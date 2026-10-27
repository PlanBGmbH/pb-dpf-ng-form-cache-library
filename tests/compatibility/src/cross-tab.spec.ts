import { createEnvironmentInjector, EnvironmentInjector, provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { FormControl, FormGroup } from '@angular/forms';
import {
	defaultConfig,
	FORM_CACHE_STORAGE,
	FORM_PERSISTENCE_SERVICE,
	provideFormCacheStorage,
	SESSION_MANAGER_SERVICE,
} from '@planbgmbh/ng-form-cache';

describe('Shared storage across application instances', () => {
	const providers = () =>
		provideFormCacheStorage({
			baseConfig: { ...defaultConfig, autoSaveDebounceTime: 10 },
			perstistenceConfig: { ttl: 10000, cleanupInterval: 500, staleThreshold: 50000, storageQuota: 100000 },
		});
	const instance = (injector: EnvironmentInjector) => ({
		session: injector.get(SESSION_MANAGER_SERVICE),
		persistence: injector.get(FORM_PERSISTENCE_SERVICE),
		storage: injector.get(FORM_CACHE_STORAGE),
	});
	let peer: EnvironmentInjector;
	beforeEach(() => {
		localStorage.clear();
		TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection(), ...providers()] });
		peer = createEnvironmentInjector(providers(), TestBed.inject(EnvironmentInjector));
	});
	afterEach(() => {
		peer.destroy();
		TestBed.resetTestingModule();
		localStorage.clear();
	});
	const setup = () => {
		const first = instance(TestBed.inject(EnvironmentInjector));
		const second = instance(peer);
		for (const tab of [first, second]) {
			tab.session.startSession('alice');
			tab.persistence.setUserId('alice');
		}
		return { first, second };
	};

	it('resumes one user-owned application session in multiple instances', () => {
		const { first, second } = setup();
		expect(first.session.getSessionId()).toBe(second.session.getSessionId());
		second.session.startSession('bob');
		expect(first.session.isSessionValid('alice')).toBeFalse();
		expect(second.session.isSessionValid('bob')).toBeTrue();
		expect(first.persistence.saveDraft('profile', '1', {})).toEqual(
			jasmine.objectContaining({ status: 'failed', reason: 'invalid-session' }),
		);
	});

	it('discovers both drafts after interleaved stale index writes and reconstructs a missing index', () => {
		const { first, second } = setup();
		const staleFirst = first.storage.getUserDraftIndex('alice')!;
		const staleSecond = second.storage.getUserDraftIndex('alice')!;
		first.persistence.saveDraft('profile', '1', { from: 'first' });
		second.persistence.saveDraft('profile', '2', { from: 'second' });
		const firstKey = first.storage.generateDraftKey('alice', 'profile', '1');
		const secondKey = first.storage.generateDraftKey('alice', 'profile', '2');
		first.storage.setUserDraftIndex('alice', { ...staleFirst, draftKeys: [firstKey] });
		second.storage.setUserDraftIndex('alice', { ...staleSecond, draftKeys: [secondKey], lastActivity: 0 });
		for (const tab of [first, second])
			expect(tab.storage.getUserDraftIndex('alice')?.draftKeys.sort()).toEqual([firstKey, secondKey].sort());
		expect(first.storage.getUserDraftIndex('alice')?.lastActivity).toBeGreaterThan(0);
		localStorage.removeItem(first.storage.generateIndexKey('alice'));
		expect(first.storage.getUserDraftIndex('alice')?.draftKeys.length).toBe(2);
		expect(first.session.isSessionValid('alice')).toBeTrue();
		expect(first.persistence.saveDraft('profile', '3', {})).toEqual({ status: 'saved' });
		second.persistence.deleteDraft('profile', '2');
		first.storage.setUserDraftIndex('alice', { ...staleFirst, draftKeys: [firstKey, secondKey] });
		expect(second.storage.getUserDraftIndex('alice')?.draftKeys).not.toContain(secondKey);
	});

	it('uses the last successful write when two instances edit the same draft', () => {
		const { first, second } = setup();
		first.persistence.saveDraft('profile', '1', { value: 'first' });
		second.persistence.saveDraft('profile', '1', { value: 'second' });
		expect(first.persistence.loadDraft('profile', '1')?.formData).toEqual({ value: 'second' });
		expect(first.storage.getUserDraftIndex('alice')?.draftKeys.length).toBe(1);
	});

	it('invalidates pending saves immediately after logout in another instance and retains existing drafts', async () => {
		const { first, second } = setup();
		first.persistence.saveDraft('profile', 'existing', {});
		first.persistence.autoSave(new FormGroup({ name: new FormControl('pending') }), 'profile', 'pending');
		expect(second.session.endSession('alice')).toEqual({ success: true });
		expect(first.session.isSessionValid('alice')).toBeFalse();
		await new Promise((resolve) => setTimeout(resolve, 30));
		expect(first.persistence.getSaveState('profile', 'pending').status).toBe('cancelled');
		expect(first.persistence.hasDraft('profile', 'pending')).toBeFalse();
		expect(first.persistence.hasDraft('profile', 'existing')).toBeTrue();
	});

	it('does not revoke a new login that races with logout of the previous session', () => {
		const { first, second } = setup();
		const write = first.storage.setItem.bind(first.storage);
		spyOn(first.storage, 'setItem').and.callFake((key, value) => {
			if (key.startsWith(`${defaultConfig.sessionIdKey}:revoked:`)) second.session.startSession('bob');
			return write(key, value);
		});
		first.session.endSession('alice');
		expect(second.session.isSessionValid('bob')).toBeTrue();
		expect(second.session.isSessionValid('alice')).toBeFalse();
	});

	it('does not report successful logout when its revocation write fails', () => {
		const { first, second } = setup();
		spyOn(first.storage, 'setItem').and.returnValue({ success: false, reason: 'access' });
		expect(first.session.endSession('alice')).toEqual({ success: false, reason: 'access' });
		expect(second.session.isSessionValid('alice')).toBeTrue();
	});

	it('migrates a matching legacy session string and ignores stale event payloads', () => {
		const { first } = setup();
		const id = first.session.getSessionId()!;
		first.storage.setItem(defaultConfig.sessionIdKey, id);
		expect(first.session.startSession('alice')).toBe(id);
		expect(first.storage.getItem(defaultConfig.sessionIdKey)).toEqual({ version: 1, userId: 'alice', sessionId: id });
		window.dispatchEvent(new StorageEvent('storage', { key: defaultConfig.sessionIdKey, newValue: '"outdated"' }));
		expect(first.session.getSessionId()).toBe(id);
	});

	it('reconciles an index overwritten through storage in another browser document', async () => {
		const { first, second } = setup();
		const frame = document.createElement('iframe');
		const loaded = new Promise<void>((resolve) => (frame.onload = () => resolve()));
		frame.srcdoc = '<!doctype html><title>Second draft document</title>';
		document.body.appendChild(frame);
		try {
			await loaded;
			const remote = frame.contentWindow!.localStorage;
			const indexKey = first.storage.generateIndexKey('alice');
			const stale = JSON.parse(remote.getItem(indexKey)!);
			first.persistence.saveDraft('profile', '1', {});
			second.persistence.saveDraft('profile', '2', {});
			const secondKey = first.storage.generateDraftKey('alice', 'profile', '2');
			remote.setItem(indexKey, JSON.stringify({ ...stale, draftKeys: [secondKey] }));
			expect(first.storage.getUserDraftIndex('alice')?.draftKeys.length).toBe(2);
			remote.removeItem(defaultConfig.sessionIdKey);
			expect(first.session.isSessionValid('alice')).toBeFalse();
		} finally {
			frame.remove();
		}
	});
	it('does not create a user index for a failed replacement session write', () => {
		const { first, second } = setup();
		spyOn(second.storage, 'setItem').and.returnValue({ success: false, reason: 'access' });
		second.session.startSession('bob');
		expect(second.session.isSessionValid('bob')).toBeFalse();
		expect(first.session.isSessionValid('alice')).toBeTrue();
		expect(second.storage.getUserDraftIndex('bob')).toBeUndefined();
	});

	it('rejects malformed and future session records instead of trusting a cached session', () => {
		const { first } = setup();
		for (const value of [123, {}, { version: 99, userId: 'alice', sessionId: 'future' }]) {
			localStorage.setItem(defaultConfig.sessionIdKey, JSON.stringify(value));
			expect(first.session.getSessionId()).toBeUndefined();
			expect(first.session.isSessionValid('alice')).toBeFalse();
		}
	});
	it('can revoke legacy session IDs containing arbitrary Unicode', () => {
		const { first } = setup();
		const id = '\ud800';
		first.storage.setItem(defaultConfig.sessionIdKey, id);
		first.storage.setUserDraftIndex('alice', { ...first.storage.getUserDraftIndex('alice')!, sessionId: id });
		expect(first.session.isSessionValid('alice')).toBeTrue();
		expect(first.session.endSession('alice')).toEqual({ success: true });
		expect(first.session.getSessionId()).toBeUndefined();
	});
});
