import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
	CLEANUP_SERVICE,
	defaultConfig,
	FORM_CACHE_STORAGE,
	FORM_PERSISTENCE_SERVICE,
	provideFormCacheStorage,
	SESSION_MANAGER_SERVICE,
} from '@planbgmbh/ng-form-cache';

describe('Persisted storage safety', () => {
	const setup = () => {
		TestBed.configureTestingModule({
			providers: [
				provideZonelessChangeDetection(),
				provideFormCacheStorage({
					baseConfig: { ...defaultConfig, autoSaveDebounceTime: 100 },
					perstistenceConfig: {
						ttl: 10000,
						cleanupInterval: 500,
						staleThreshold: 50000,
						storageQuota: 100000,
					},
				}),
			],
		});
		const session = TestBed.inject(SESSION_MANAGER_SERVICE);
		const persistence = TestBed.inject(FORM_PERSISTENCE_SERVICE);
		const storage = TestBed.inject(FORM_CACHE_STORAGE);
		const cleanup = TestBed.inject(CLEANUP_SERVICE);
		session.startSession('alice');
		persistence.setUserId('alice');
		return { session, persistence, storage, cleanup };
	};

	beforeEach(() => localStorage.clear());
	afterEach(() => {
		TestBed.resetTestingModule();
		localStorage.clear();
	});

	it('ignores malformed drafts and unknown versions without removing their contents', () => {
		const { persistence, storage, cleanup } = setup();
		persistence.saveDraft('profile', '1', {});
		const key = storage.generateDraftKey('alice', 'profile', '1');
		const valid = storage.getDraft(key)!;
		for (const value of [
			null,
			[],
			{},
			{ ...valid, metadata: {} },
			{ ...valid, metadata: { ...valid.metadata, version: 99 } },
		]) {
			localStorage.setItem(key, JSON.stringify(value));
			expect(() => persistence.loadDraft('profile', '1')).not.toThrow();
			expect(persistence.loadDraft('profile', '1')).toBeUndefined();
			cleanup.runCleanup();
			expect(localStorage.getItem(key)).toBe(JSON.stringify(value));
		}
		localStorage.setItem(key, '{invalid');
		spyOn(console, 'error');
		expect(() => persistence.saveDraft('profile', '1', { repaired: true })).not.toThrow();
		expect(persistence.loadDraft('profile', '1')?.formData).toEqual({ repaired: true });
	});

	it('normalizes valid legacy records and writes explicit versions on the next save', () => {
		const { persistence, storage } = setup();
		persistence.saveDraft('profile', '1', {});
		const key = storage.generateDraftKey('alice', 'profile', '1');
		const raw = JSON.parse(localStorage.getItem(key)!);
		delete raw.metadata.version;
		localStorage.setItem(key, JSON.stringify(raw));
		const indexKey = storage.generateIndexKey('alice');
		const index = JSON.parse(localStorage.getItem(indexKey)!);
		delete index.version;
		localStorage.setItem(indexKey, JSON.stringify(index));
		expect(persistence.loadDraft('profile', '1')?.metadata.version).toBe(1);
		expect(storage.getUserDraftIndex('alice')?.version).toBe(1);
		persistence.saveDraft('profile', '1', {});
		expect(JSON.parse(localStorage.getItem(key)!).metadata.version).toBe(1);
		expect(JSON.parse(localStorage.getItem(indexKey)!).version).toBe(1);
	});

	it('rejects invalid index fields and never follows foreign or unrelated keys during deletion', () => {
		const { persistence, storage, cleanup } = setup();
		const indexKey = storage.generateIndexKey('alice');
		const valid = storage.getUserDraftIndex('alice')!;
		for (const value of [
			null,
			{},
			{ ...valid, userId: 'bob' },
			{ ...valid, draftKeys: [123] },
			{ ...valid, lastActivity: '0' },
			{ ...valid, version: 99 },
		]) {
			localStorage.setItem(indexKey, JSON.stringify(value));
			expect(storage.getUserDraftIndex('alice')).toBeUndefined();
			expect(() => persistence.saveDraft('profile', '1', {})).not.toThrow();
			expect(() => cleanup.runCleanup()).not.toThrow();
		}
		const otherKey = storage.generateDraftKey('bob', 'profile', '1');
		const now = Date.now();
		storage.setDraft(otherKey, {
			metadata: {
				userId: 'bob',
				sessionId: 'bob-session',
				createdAt: now,
				lastModified: now,
				expiresAt: now + 10000,
				version: 1,
			},
			formData: {},
			entityType: 'profile',
			entityId: '1',
			isDirty: true,
			autoSaveEnabled: true,
		});
		localStorage.setItem('unrelated', 'keep');
		for (const remove of [() => persistence.deleteAllDrafts(), () => cleanup.runCleanup()]) {
			localStorage.setItem(indexKey, JSON.stringify({ ...valid, lastActivity: 0, draftKeys: ['unrelated', otherKey] }));
			remove();
			expect(localStorage.getItem('unrelated')).toBe('keep');
			expect(storage.getDraft(otherKey)).toBeDefined();
		}
	});
	it('uses distinct keys for adversarial identifier tuples, including legacy-looking strings', () => {
		const { storage } = setup();
		const parts = ['', '_', 'a_b', 'b_c', ':', '%', 'v2:', '"[,]\\', '\ud800', '😀'];
		const keys = new Set<string>();
		for (const user of parts)
			for (const type of parts)
				for (const id of parts) {
					const key = storage.generateDraftKey(user, type, id);
					expect(key.slice(defaultConfig.draftKeyPrefix.length)).not.toContain('_');
					keys.add(key);
				}
		expect(keys.size).toBe(parts.length ** 3);
		expect(storage.generateDraftKey('a_b', 'c', 'd')).not.toBe(storage.generateDraftKey('a', 'b_c', 'd'));
	});

	it('migrates a matching legacy draft and index without exposing it to a colliding identity', () => {
		const { persistence, storage, session } = setup();
		session.startSession('a_b');
		persistence.setUserId('a_b');
		persistence.saveDraft('c', 'd', { secret: true });
		const key = storage.generateDraftKey('a_b', 'c', 'd');
		const legacyKey = `${defaultConfig.draftKeyPrefix}a_b_c_d`;
		localStorage.setItem(legacyKey, localStorage.getItem(key)!);
		localStorage.removeItem(key);
		storage.setUserDraftIndex('a_b', {
			...JSON.parse(localStorage.getItem(storage.generateIndexKey('a_b'))!),
			draftKeys: [legacyKey],
		});
		persistence.setUserId('a');
		expect(persistence.loadDraft('b_c', 'd')).toBeUndefined();
		persistence.deleteDraft('b_c', 'd');
		expect(localStorage.getItem(legacyKey)).not.toBeNull();
		persistence.setUserId('a_b');
		expect(persistence.loadDraft('c', 'd')?.formData).toEqual({ secret: true });
		expect(localStorage.getItem(legacyKey)).toBeNull();
		expect(storage.getUserDraftIndex('a_b')?.draftKeys).toEqual([key]);
	});

	it('keeps legacy data recoverable when migration writes fail', () => {
		const { persistence, storage } = setup();
		persistence.saveDraft('profile', '1', { keep: true });
		const key = storage.generateDraftKey('alice', 'profile', '1');
		const legacyKey = `${defaultConfig.draftKeyPrefix}alice_profile_1`;
		localStorage.setItem(legacyKey, localStorage.getItem(key)!);
		localStorage.removeItem(key);
		const indexKey = storage.generateIndexKey('alice');
		localStorage.setItem(
			indexKey,
			JSON.stringify({ ...JSON.parse(localStorage.getItem(indexKey)!), draftKeys: [legacyKey] }),
		);
		const write = spyOn(storage, 'setDraft').and.stub();
		expect(persistence.loadDraft('profile', '1')?.formData).toEqual({ keep: true });
		expect(localStorage.getItem(legacyKey)).not.toBeNull();
		write.and.callThrough();
		spyOn(storage, 'setUserDraftIndex').and.stub();
		expect(persistence.loadDraft('profile', '1')?.formData).toEqual({ keep: true });
		expect(localStorage.getItem(legacyKey)).not.toBeNull();
		persistence.deleteDraft('profile', '1');
		expect(localStorage.getItem(legacyKey)).toBeNull();
		expect(persistence.loadDraft('profile', '1')).toBeUndefined();
	});
	it('does not replace an unsupported or malformed destination while reading a legacy draft', () => {
		const { persistence, storage } = setup();
		persistence.saveDraft('profile', '1', {});
		const key = storage.generateDraftKey('alice', 'profile', '1');
		const legacyKey = `${defaultConfig.draftKeyPrefix}alice_profile_1`;
		localStorage.setItem(legacyKey, localStorage.getItem(key)!);
		spyOn(console, 'error');
		for (const raw of ['{invalid', '{"metadata":{"version":99}}']) {
			localStorage.setItem(key, raw);
			expect(persistence.loadDraft('profile', '1')).toBeUndefined();
			expect(localStorage.getItem(key)).toBe(raw);
			expect(storage.getUserDraftIndex('alice')?.draftKeys).toEqual([legacyKey]);
			expect(localStorage.getItem(legacyKey)).not.toBeNull();
		}
	});
	it('reports serialization failures without adding an index entry', () => {
		const { persistence, storage } = setup();
		const payload: { self?: unknown } = {};
		payload.self = payload;
		const result = persistence.saveDraft('profile', '1', payload);
		expect(result).toEqual(
			jasmine.objectContaining({ status: 'failed', phase: 'draft', reason: 'serialization', draftPersisted: false }),
		);
		expect(persistence.getSaveState('profile', '1')).toBe(result);
		expect(storage.getUserDraftIndex('alice')?.draftKeys).toEqual([]);
		expect(persistence.loadDraft('profile', '1')).toBeUndefined();
	});

	it('reports access failures and thrown custom adapter failures', () => {
		const { persistence, storage } = setup();
		const write = spyOn(Storage.prototype, 'setItem').and.throwError(new DOMException('blocked', 'SecurityError'));
		expect(persistence.saveDraft('profile', '1', {})).toEqual(
			jasmine.objectContaining({ status: 'failed', reason: 'access', phase: 'draft' }),
		);
		expect(write).toHaveBeenCalledTimes(1);
		write.and.callThrough();
		spyOn(storage, 'setDraft').and.throwError(new Error('adapter offline'));
		expect(() => persistence.saveDraft('profile', '1', {})).not.toThrow();
		expect(persistence.getSaveState('profile', '1')).toEqual(
			jasmine.objectContaining({ status: 'failed', reason: 'unknown' }),
		);
		expect(storage.getUserDraftIndex('alice')?.draftKeys).toEqual([]);
	});

	it('retries quota failures once after evicting only expired drafts', () => {
		const { persistence, storage } = setup();
		persistence.saveDraft('profile', 'expired', {});
		persistence.saveDraft('profile', 'active', {});
		const expiredKey = storage.generateDraftKey('alice', 'profile', 'expired');
		const expired = storage.getDraft(expiredKey)!;
		storage.setDraft(expiredKey, { ...expired, metadata: { ...expired.metadata, expiresAt: 0 } });
		localStorage.setItem('unrelated', 'keep');
		const nativeWrite = Storage.prototype.setItem;
		const target = storage.generateDraftKey('alice', 'profile', '1');
		let attempts = 0;
		spyOn(Storage.prototype, 'setItem').and.callFake(function (this: Storage, key: string, value: string) {
			if (key === target && ++attempts === 1) throw new DOMException('full', 'QuotaExceededError');
			nativeWrite.call(this, key, value);
		});
		expect(persistence.saveDraft('profile', '1', {})).toEqual({ status: 'saved' });
		expect(attempts).toBe(2);
		expect(localStorage.getItem(expiredKey)).toBeNull();
		expect(persistence.hasDraft('profile', 'active')).toBeTrue();
		expect(localStorage.getItem('unrelated')).toBe('keep');
	});

	it('reports persistent quota failure after exactly one retry', () => {
		const { persistence, storage } = setup();
		const write = spyOn(Storage.prototype, 'setItem').and.throwError(new DOMException('full', 'QuotaExceededError'));
		expect(persistence.saveDraft('profile', '1', {})).toEqual(
			jasmine.objectContaining({ status: 'failed', phase: 'draft', reason: 'quota' }),
		);
		expect(write).toHaveBeenCalledTimes(2);
		expect(storage.getUserDraftIndex('alice')?.draftKeys).toEqual([]);
	});

	it('reports index failures separately and allows an explicit retry', () => {
		const { persistence, storage } = setup();
		const write = spyOn(storage, 'setUserDraftIndex').and.returnValue({ success: false, reason: 'access' });
		expect(persistence.saveDraft('profile', '1', { keep: true })).toEqual(
			jasmine.objectContaining({ status: 'failed', phase: 'index', draftPersisted: true }),
		);
		expect(persistence.loadDraft('profile', '1')?.formData).toEqual({ keep: true });
		expect(JSON.parse(localStorage.getItem(storage.generateIndexKey('alice'))!).draftKeys).toEqual([]);
		write.and.callThrough();
		expect(persistence.saveDraft('profile', '1', { keep: true })).toEqual({ status: 'saved' });
		expect(storage.getUserDraftIndex('alice')?.draftKeys).toEqual([storage.generateDraftKey('alice', 'profile', '1')]);
	});
});
