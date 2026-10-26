import { Injectable, PLATFORM_ID, provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { FormControl, FormGroup } from '@angular/forms';
import {
	CLEANUP_SERVICE,
	CleanupService,
	defaultConfig,
	FORM_CACHE_STORAGE,
	FORM_PERSISTENCE_SERVICE,
	FormPersistenceService,
	LocalStorageService,
	provideFormCacheStorage,
	SESSION_MANAGER_SERVICE,
	SessionManagerService,
} from '@planbgmbh/ng-form-cache';

@Injectable()
class MemoryStorage extends LocalStorageService {
	private readonly items = new Map<string, string>();
	public override getItem<T>(key: string): T | undefined {
		const value = this.items.get(key);
		return value === undefined ? undefined : JSON.parse(value);
	}
	public override setItem<T>(key: string, value: T): void {
		this.items.set(key, JSON.stringify(value));
	}
	public override removeItem(key: string): void {
		this.items.delete(key);
	}
	public keys(): string[] {
		return [...this.items.keys()];
	}
}

describe('Draft lifecycle regressions', () => {
	const form = (value: string) => new FormGroup({ name: new FormControl(value) });
	const setup = (options: { customStorage?: boolean; server?: boolean; quota?: number; ttl?: number } = {}) => {
		TestBed.configureTestingModule({
			providers: [
				provideZonelessChangeDetection(),
				provideFormCacheStorage(
					{
						baseConfig: { ...defaultConfig, autoSaveDebounceTime: 100 },
						perstistenceConfig: {
							ttl: options.ttl ?? 1000,
							cleanupInterval: 500,
							staleThreshold: 5000,
							storageQuota: options.quota ?? 100000,
						},
					},
					options.customStorage ? MemoryStorage : undefined,
				),
				...(options.server ? [{ provide: PLATFORM_ID, useValue: 'server' }] : []),
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

	beforeEach(() => {
		localStorage.clear();
		jasmine.clock().install();
		jasmine.clock().mockDate(new Date('2026-01-01T00:00:00Z'));
	});
	afterEach(() => {
		TestBed.resetTestingModule();
		jasmine.clock().uninstall();
		localStorage.clear();
	});

	it('debounces each entity independently', () => {
		const { persistence } = setup();
		persistence.autoSave(form('first'), 'profile', '1');
		persistence.autoSave(form('second'), 'profile', '2');
		jasmine.clock().tick(101);
		expect(persistence.loadDraft('profile', '1')?.formData).toEqual({ name: 'first' });
		expect(persistence.loadDraft('profile', '2')?.formData).toEqual({ name: 'second' });
	});

	it('keeps only the latest edit for the same entity', () => {
		const { persistence, storage } = setup();
		const write = spyOn(storage, 'setDraft').and.callThrough();
		persistence.autoSave(form('old'), 'profile', '1');
		jasmine.clock().tick(50);
		persistence.autoSave(form('latest'), 'profile', '1');
		jasmine.clock().tick(101);
		expect(write).toHaveBeenCalledTimes(1);
		expect(persistence.loadDraft('profile', '1')?.formData).toEqual({ name: 'latest' });
	});

	it('does not recreate a draft deleted before the debounce expires', () => {
		const { persistence } = setup();
		persistence.autoSave(form('submitted'), 'profile', '1');
		persistence.deleteDraft('profile', '1');
		jasmine.clock().tick(101);
		expect(persistence.hasDraft('profile', '1')).toBeFalse();
	});

	it('cancels pending saves when all drafts are deleted', () => {
		const { persistence } = setup();
		persistence.autoSave(form('submitted'), 'profile', '1');
		persistence.deleteAllDrafts();
		jasmine.clock().tick(101);
		expect(persistence.hasDraft('profile', '1')).toBeFalse();
	});

	it('does not write the previous user’s pending edit into a new user’s draft', () => {
		const { persistence, session } = setup();
		persistence.autoSave(form('private'), 'profile', '1');
		session.startSession('bob');
		persistence.setUserId('bob');
		jasmine.clock().tick(101);
		expect(persistence.hasDraft('profile', '1')).toBeFalse();
	});

	it('discards pending edits after a session is replaced for the same user', () => {
		const { persistence, session } = setup();
		persistence.autoSave(form('old session'), 'profile', '1');
		session.endSession('alice');
		session.startSession('alice');
		jasmine.clock().tick(101);
		expect(persistence.hasDraft('profile', '1')).toBeFalse();
	});

	it('rejects saves using a session belonging to a different user', () => {
		const { persistence } = setup();
		persistence.setUserId('bob');
		persistence.saveDraft('profile', '1', { secret: true });
		expect(persistence.hasDraft('profile', '1')).toBeFalse();
	});

	it('cancels timers when the injector is destroyed', () => {
		const { persistence, storage } = setup();
		const write = spyOn(storage, 'setDraft').and.callThrough();
		persistence.autoSave(form('pending'), 'profile', '1');
		TestBed.resetTestingModule();
		jasmine.clock().tick(101);
		expect(write).not.toHaveBeenCalled();
	});

	it('refreshes activity when an existing draft is saved again', () => {
		const { persistence, storage } = setup();
		persistence.saveDraft('profile', '1', {});
		jasmine.clock().tick(100);
		persistence.saveDraft('profile', '1', {});
		expect(storage.getUserDraftIndex('alice')?.lastActivity).toBe(Date.now());
		expect(storage.getUserDraftIndex('alice')?.draftKeys.length).toBe(1);
	});

	it('does not restore expired drafts and removes their index entries', () => {
		const { persistence, storage } = setup();
		persistence.saveDraft('profile', '1', {});
		jasmine.clock().tick(1000);
		expect(persistence.loadDraft('profile', '1')).toBeUndefined();
		expect(storage.getUserDraftIndex('alice')?.draftKeys).toEqual([]);
	});

	it('cleans every expired draft without skipping keys after a deletion', () => {
		const { persistence, storage, cleanup } = setup();
		for (let i = 0; i < 4; i++) persistence.saveDraft('profile', String(i), {});
		jasmine.clock().tick(1001);
		cleanup.runCleanup();
		expect(storage.getUserDraftIndex('alice')?.draftKeys).toEqual([]);
	});

	it('cleans the configured adapter without reading or deleting unrelated localStorage', () => {
		const { persistence, storage, cleanup } = setup({ customStorage: true });
		persistence.saveDraft('profile', '1', {});
		const key = storage.generateDraftKey('alice', 'profile', '1');
		localStorage.setItem('unrelated', 'keep');
		jasmine.clock().tick(1001);
		cleanup.runCleanup();
		expect(storage.getDraft(key)).toBeUndefined();
		expect(localStorage.getItem('unrelated')).toBe('keep');
	});

	for (const customStorage of [false, true]) {
		it(`keeps autosave working after stale cleanup with ${customStorage ? 'custom' : 'local'} storage`, () => {
			const { persistence, session, storage, cleanup } = setup({ customStorage, ttl: 10000 });
			persistence.saveDraft('profile', '1', { name: 'stale' });
			const index = storage.getUserDraftIndex('alice')!;
			const key = storage.generateDraftKey('alice', 'profile', '1');
			jasmine.clock().tick(5001);
			cleanup.runCleanup();
			expect(storage.getDraft(key)).toBeUndefined();
			expect(storage.getUserDraftIndex('alice')).toEqual({ ...index, draftKeys: [] });
			expect(storage.getItem(defaultConfig.sessionIdKey)).toBe(index.sessionId);
			expect(session.isSessionValid('alice')).toBeTrue();
			cleanup.runCleanup();
			persistence.autoSave(form('resumed'), 'profile', '1');
			jasmine.clock().tick(101);
			expect(persistence.loadDraft('profile', '1')?.formData).toEqual({ name: 'resumed' });
			expect(storage.getUserDraftIndex('alice')?.draftKeys).toEqual([key]);
			expect(storage.getUserDraftIndex('alice')?.lastActivity).toBe(Date.now() - 1);
			persistence.saveDraft('profile', '1', { name: 'saved again' });
			expect(persistence.loadDraft('profile', '1')?.formData).toEqual({ name: 'saved again' });
		});
	}

	it('preserves an empty active index when cleanup runs during a pending autosave', () => {
		const { persistence, session, cleanup } = setup();
		jasmine.clock().tick(4950);
		persistence.autoSave(form('pending'), 'profile', '1');
		jasmine.clock().tick(51);
		cleanup.runCleanup();
		jasmine.clock().tick(50);
		expect(session.isSessionValid('alice')).toBeTrue();
		expect(persistence.loadDraft('profile', '1')?.formData).toEqual({ name: 'pending' });
	});

	it('still removes stale drafts and indexes for an inactive session', () => {
		const { persistence, session, storage, cleanup } = setup({ ttl: 10000 });
		persistence.saveDraft('profile', '1', {});
		jasmine.clock().tick(5001);
		session.startSession('bob');
		cleanup.runCleanup();
		expect(storage.getUserDraftIndex('alice')).toBeUndefined();
		expect(persistence.hasDraft('profile', '1')).toBeFalse();
		expect(session.isSessionValid('bob')).toBeTrue();
	});

	it('does not undo logout with pending or subsequent saves after stale cleanup', () => {
		const { persistence, session, storage, cleanup } = setup();
		jasmine.clock().tick(5001);
		cleanup.runCleanup();
		persistence.autoSave(form('pending'), 'profile', '1');
		session.endSession('alice');
		cleanup.runCleanup();
		persistence.autoSave(form('after logout'), 'profile', '1');
		persistence.saveDraft('profile', '2', {});
		jasmine.clock().tick(101);
		expect(persistence.hasDraft('profile', '1')).toBeFalse();
		expect(persistence.hasDraft('profile', '2')).toBeFalse();
		expect(storage.getUserDraftIndex('alice')).toBeUndefined();
		expect(storage.getItem(defaultConfig.sessionIdKey)).toBeUndefined();
		expect(session.isSessionValid('alice')).toBeFalse();
	});

	it('does not preserve a stale index using a cached session after its stored ID is removed', () => {
		const { persistence, session, storage, cleanup } = setup();
		storage.removeItem(defaultConfig.sessionIdKey);
		jasmine.clock().tick(5001);
		cleanup.runCleanup();
		persistence.autoSave(form('after logout'), 'profile', '1');
		jasmine.clock().tick(101);
		expect(storage.getUserDraftIndex('alice')).toBeUndefined();
		expect(persistence.hasDraft('profile', '1')).toBeFalse();
		expect(session.isSessionValid('alice')).toBeFalse();
	});

	it('does not recreate an arbitrary missing session index', () => {
		const { persistence, storage, cleanup } = setup();
		storage.removeItem(storage.generateIndexKey('alice'));
		cleanup.runCleanup();
		persistence.autoSave(form('missing index'), 'profile', '1');
		persistence.saveDraft('profile', '2', {});
		jasmine.clock().tick(101);
		expect(storage.getUserDraftIndex('alice')).toBeUndefined();
		expect(persistence.hasDraft('profile', '1')).toBeFalse();
		expect(persistence.hasDraft('profile', '2')).toBeFalse();
	});

	it('ignores unrelated application data when enforcing the cache quota', () => {
		const { persistence, cleanup } = setup({ quota: 5000 });
		persistence.saveDraft('profile', '1', {});
		localStorage.setItem('unrelated', 'x'.repeat(6000));
		cleanup.runCleanup();
		expect(persistence.hasDraft('profile', '1')).toBeTrue();
	});

	it('removes enough oldest drafts to satisfy the configured quota', () => {
		const { persistence, storage, cleanup } = setup({ quota: 1 });
		for (let i = 0; i < 4; i++) persistence.saveDraft('profile', String(i), {});
		cleanup.runCleanup();
		expect(storage.getUserDraftIndex('alice')?.draftKeys).toEqual([]);
	});

	it('decodes JSON session IDs received from another tab', () => {
		const { session, storage } = setup();
		const index = storage.getUserDraftIndex('alice')!;
		storage.setUserDraftIndex('alice', { ...index, sessionId: 'other-tab' });
		storage.setItem(defaultConfig.sessionIdKey, 'other-tab');
		window.dispatchEvent(new StorageEvent('storage', { key: defaultConfig.sessionIdKey, newValue: '"other-tab"' }));
		expect(session.getSessionId()).toBe('other-tab');
		expect(session.isSessionValid('alice')).toBeTrue();
	});

	it('invalidates the cached session when another tab clears storage', () => {
		const { session } = setup();
		localStorage.clear();
		window.dispatchEvent(new StorageEvent('storage', { key: null }));
		expect(session.getSessionId()).toBeUndefined();
	});

	it('does not remove a newer session when an older tab ends its session', () => {
		const { session, storage } = setup();
		storage.setItem(defaultConfig.sessionIdKey, 'newer-session');
		session.endSession('alice');
		expect(storage.getItem(defaultConfig.sessionIdKey)).toBe('newer-session');
	});

	it('resolves class providers to the same instances as their public tokens', () => {
		const { persistence, session, cleanup } = setup();
		expect(TestBed.inject(FormPersistenceService)).toBe(persistence);
		expect(TestBed.inject(SessionManagerService)).toBe(session);
		expect(TestBed.inject(CleanupService)).toBe(cleanup);
	});

	it('does not register browser listeners or timers when rendered on the server', () => {
		const listener = spyOn(window, 'addEventListener').and.callThrough();
		const { cleanup } = setup({ server: true });
		const run = spyOn(cleanup, 'runCleanup');
		cleanup.start();
		jasmine.clock().tick(1000);
		expect(listener.calls.allArgs().some(([event]) => event === 'storage')).toBeFalse();
		expect(run).not.toHaveBeenCalled();
		expect(localStorage.length).toBe(0);
	});
});
