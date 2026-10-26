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
	StoredEntityData,
	UserDraftIndex,
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
	public override getDraft<T>(key: string): StoredEntityData<T> | undefined {
		return this.getItem(key);
	}
	public override getUserDraftIndex(userId: string): UserDraftIndex | undefined {
		return this.getItem(this.generateIndexKey(userId));
	}
	public keys(): string[] {
		return [...this.items.keys()];
	}
}

describe('Draft lifecycle regressions', () => {
	const form = (value: string) => new FormGroup({ name: new FormControl(value) });
	const setup = (
		options: {
			customStorage?: boolean;
			server?: boolean;
			quota?: number;
			prefixes?: Partial<typeof defaultConfig>;
		} = {},
	) => {
		TestBed.configureTestingModule({
			providers: [
				provideZonelessChangeDetection(),
				provideFormCacheStorage(
					{
						baseConfig: { ...defaultConfig, autoSaveDebounceTime: 100, ...options.prefixes },
						perstistenceConfig: {
							ttl: 1000,
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

	for (const customStorage of [false, true]) {
		describe(customStorage ? 'unvalidated custom adapter records' : 'localStorage records', () => {
			const invalidDrafts = (draft: StoredEntityData): unknown[] => [
				{},
				[],
				null,
				true,
				42,
				'old draft',
				{ ...draft, metadata: null },
				{ ...draft, metadata: {} },
				{ ...draft, metadata: { ...draft.metadata, version: 2 } },
				{ ...draft, metadata: { ...draft.metadata, userId: 'bob' } },
				{ ...draft, metadata: { ...draft.metadata, sessionId: 42 } },
				{ ...draft, entityType: 'other' },
				{ ...draft, entityId: 'other' },
				{ ...draft, isDirty: 'true' },
				{ ...draft, autoSaveEnabled: null },
				...['createdAt', 'lastModified', 'expiresAt'].flatMap((field) =>
					[null, '123', {}, Infinity].map((value) => ({
						...draft,
						metadata: { ...draft.metadata, [field]: value },
					})),
				),
			];
			const invalidIndexes = (index: UserDraftIndex): unknown[] => [
				{},
				[],
				null,
				false,
				42,
				'old index',
				{ ...index, draftKeys: undefined },
				...['key', {}, null, [42], ['unrelated', null]].map((draftKeys) => ({
					...index,
					draftKeys,
				})),
				{ ...index, userId: 'bob' },
				{ ...index, sessionId: 42 },
				...['123', null, {}, Infinity].map((lastActivity) => ({ ...index, lastActivity })),
			];

			it('treats invalid drafts as absent and replaces them safely on save', () => {
				const { persistence, storage } = setup({ customStorage });
				persistence.saveDraft('profile', '1', {});
				const key = storage.generateDraftKey('alice', 'profile', '1');
				const valid = storage.getDraft(key)!;
				jasmine.clock().tick(10);
				for (const invalid of invalidDrafts(valid)) {
					storage.setItem(key, invalid);
					expect(persistence.loadDraft('profile', '1')).toBeUndefined();
					expect(storage.getItem(key)).toBeUndefined();
					storage.setItem(key, invalid);
					expect(persistence.hasDraft('profile', '1')).toBeFalse();
					storage.setItem(key, invalid);
					persistence.saveDraft('profile', '1', 'recovered');
					expect(persistence.loadDraft('profile', '1')?.metadata.createdAt).toBe(Date.now());
					expect(persistence.loadDraft('profile', '1')?.formData).toBe('recovered');
				}
			});

			it('rebuilds invalid indexes on session startup and safely handles deletion', () => {
				const { persistence, storage, session } = setup({ customStorage });
				const indexKey = storage.generateIndexKey('alice');
				const valid = storage.getUserDraftIndex('alice')!;
				storage.setItem('unrelated', 'keep');
				for (const invalid of invalidIndexes(valid)) {
					storage.setItem(indexKey, invalid);
					expect(session.isSessionValid('alice')).toBeFalse();
					expect(storage.getItem(indexKey)).toBeUndefined();
					storage.setItem(indexKey, invalid);
					expect(() => persistence.saveDraft('profile', '1', {})).not.toThrow();
					storage.setItem(indexKey, invalid);
					expect(() => persistence.deleteDraft('profile', '1')).not.toThrow();
					storage.setItem(indexKey, invalid);
					expect(() => persistence.deleteAllDrafts()).not.toThrow();
					storage.setItem(indexKey, invalid);
					expect(() => session.endSession('alice')).not.toThrow();
					storage.setItem(indexKey, invalid);
					session.startSession('alice');
					expect(storage.getUserDraftIndex('alice')?.draftKeys).toEqual([]);
					persistence.saveDraft('profile', '1', {});
					expect(persistence.hasDraft('profile', '1')).toBeTrue();
					expect(storage.getItem('unrelated')).toBe('keep');
				}
			});

			it('removes invalid records during cleanup without affecting valid drafts or unrelated data', () => {
				const { persistence, storage, cleanup } = setup({ customStorage });
				persistence.saveDraft('profile', '1', {});
				const key = storage.generateDraftKey('alice', 'profile', '1');
				const validDraft = storage.getDraft(key)!;
				const indexKey = storage.generateIndexKey('alice');
				const validIndex = storage.getUserDraftIndex('alice')!;
				storage.setItem('unrelated', 'keep');
				for (const invalid of invalidDrafts(validDraft)) {
					storage.setItem(key, invalid);
					cleanup.runCleanup();
					expect(storage.getItem(key)).toBeUndefined();
				}
				storage.setDraft(key, validDraft);
				for (const invalid of invalidIndexes(validIndex)) {
					storage.setItem(indexKey, invalid);
					cleanup.runCleanup();
					expect(storage.getItem(indexKey)).toBeUndefined();
					expect(persistence.hasDraft('profile', '1')).toBeTrue();
				}
				expect(storage.getItem('unrelated')).toBe('keep');
			});

			it('preserves arbitrary formData and valid creation timestamps', () => {
				const { persistence, storage } = setup({ customStorage });
				for (const formData of [null, false, 42, 'text', [1, null], { nested: { value: true } }, undefined]) {
					persistence.saveDraft('profile', '1', formData);
					const createdAt = persistence.loadDraft('profile', '1')?.metadata.createdAt;
					jasmine.clock().tick(1);
					persistence.saveDraft('profile', '1', formData);
					expect(persistence.loadDraft('profile', '1')?.formData).toEqual(formData);
					expect(persistence.loadDraft('profile', '1')?.metadata.createdAt).toBe(createdAt);
				}
				persistence.saveDraft('profile', '', {});
				const key = storage.generateDraftKey('alice', 'profile', '');
				const draft = storage.getDraft(key)!;
				delete draft.entityId;
				storage.setDraft(key, draft);
				expect(persistence.hasDraft('profile', '')).toBeTrue();
			});
		});
	}

	it('rejects non-finite timestamps returned directly by custom adapters', () => {
		const { persistence, storage, cleanup, session } = setup({ customStorage: true });
		persistence.saveDraft('profile', '1', {});
		const key = storage.generateDraftKey('alice', 'profile', '1');
		const draft = storage.getDraft(key)!;
		const index = storage.getUserDraftIndex('alice')!;
		const getDraft = spyOn(storage, 'getDraft');
		for (const field of ['createdAt', 'lastModified', 'expiresAt']) {
			for (const value of [NaN, Infinity, -Infinity]) {
				getDraft.and.returnValue({ ...draft, metadata: { ...draft.metadata, [field]: value } });
				expect(persistence.loadDraft('profile', '1')).toBeUndefined();
				expect(() => cleanup.runCleanup()).not.toThrow();
			}
		}
		const getIndex = spyOn(storage, 'getUserDraftIndex');
		for (const lastActivity of [NaN, Infinity, -Infinity]) {
			getIndex.and.returnValue({ ...index, lastActivity });
			expect(session.isSessionValid('alice')).toBeFalse();
			expect(() => persistence.deleteAllDrafts()).not.toThrow();
		}
	});

	it('rejects sparse draft key arrays returned directly by custom adapters', () => {
		const { persistence, storage, cleanup, session } = setup({ customStorage: true });
		const key = storage.generateIndexKey('alice');
		const index = { ...storage.getUserDraftIndex('alice')!, draftKeys: new Array<string>(1) };
		spyOn(storage, 'getUserDraftIndex').and.returnValue(index);
		expect(session.isSessionValid('alice')).toBeFalse();
		expect(() => persistence.deleteAllDrafts()).not.toThrow();
		const getItem = storage.getItem.bind(storage);
		storage.setItem(key, {});
		spyOn(storage, 'getItem').and.callFake(<T>(itemKey: string): T | undefined => {
			return itemKey === key ? (index as T) : getItem<T>(itemKey);
		});
		expect(() => cleanup.runCleanup()).not.toThrow();
		expect(storage.keys?.()).not.toContain(key);
	});

	for (const [draftKeyPrefix, indexKeyPrefix] of [
		['fc_', 'fc_index_'],
		['fc_draft_', 'fc_'],
		['fc_', 'fc_'],
	]) {
		it(`preserves valid records with overlapping prefixes ${draftKeyPrefix} / ${indexKeyPrefix}`, () => {
			const { persistence, storage, cleanup, session } = setup({
				prefixes: { draftKeyPrefix, indexKeyPrefix },
			});
			persistence.saveDraft('profile', '1', 'keep');
			cleanup.runCleanup();
			expect(session.isSessionValid('alice')).toBeTrue();
			expect(persistence.loadDraft('profile', '1')?.formData).toBe('keep');
			jasmine.clock().tick(1001);
			cleanup.runCleanup();
			expect(persistence.hasDraft('profile', '1')).toBeFalse();
			expect(storage.getUserDraftIndex('alice')?.draftKeys).toEqual([]);
		});
	}
});
