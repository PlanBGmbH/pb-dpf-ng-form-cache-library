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
	const setup = (options: { customStorage?: boolean; server?: boolean; quota?: number } = {}) => {
		TestBed.configureTestingModule({
			providers: [
				provideZonelessChangeDetection(),
				provideFormCacheStorage(
					{
						baseConfig: { ...defaultConfig, autoSaveDebounceTime: 100 },
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

	for (const customStorage of [false, true]) {
		describe(customStorage ? 'custom adapter draft keys' : 'localStorage draft keys', () => {
			const seedLegacy = (userId = 'alice', entityType = 'order_item', entityId = '42') => {
				const context = setup({ customStorage });
				const { persistence, session, storage } = context;
				if (userId !== 'alice') {
					session.startSession(userId);
					persistence.setUserId(userId);
				}
				persistence.saveDraft(entityType, entityId, { name: 'legacy' });
				const key = storage.generateDraftKey(userId, entityType, entityId);
				const legacyKey = `${defaultConfig.draftKeyPrefix}${userId}_${entityType}_${entityId}`;
				const draft = storage.getDraft(key)!;
				storage.setDraft(legacyKey, draft);
				storage.removeItem(key);
				storage.setUserDraftIndex(userId, {
					...storage.getUserDraftIndex(userId)!,
					draftKeys: [legacyKey],
				});
				return { ...context, key, legacyKey, draft };
			};

			it('encodes delimiter, quote, Unicode, and empty identifiers as distinct tuples', () => {
				const { storage } = setup({ customStorage });
				const identities = [
					['alice', 'order_item', '42'],
					['alice', 'order', 'item_42'],
					['alice_admin', 'order', '42'],
					['alice', 'admin_order', '42'],
					['a_"雪', '["_,', ''],
					['', 'a_"雪', '["_,'],
				];
				const keys = identities.map(([user, type, id]) => storage.generateDraftKey(user, type, id));
				expect(new Set(keys).size).toBe(identities.length);
				keys.forEach((key, i) => {
					expect(JSON.parse(key.slice(`${defaultConfig.draftKeyPrefix}v2:`.length))).toEqual(identities[i]);
					expect(key.slice(defaultConfig.draftKeyPrefix.length)).not.toContain('_');
				});
			});

			it('cannot overwrite a legacy key with crafted identifiers in the v2 namespace', () => {
				const { persistence, session, storage, legacyKey, draft } = seedLegacy(
					'v2:["alice","order',
					'item","item',
					'42"]',
				);
				session.startSession('alice');
				persistence.setUserId('alice');
				persistence.saveDraft('order_item', 'item_42', { name: 'current' });
				expect(storage.getDraft(legacyKey)).toEqual(draft);
				expect(persistence.loadDraft('order_item', 'item_42')?.formData).toEqual({ name: 'current' });
			});

			it('independently debounces, loads, and deletes same-user colliding identities', () => {
				const { persistence, storage } = setup({ customStorage });
				persistence.autoSave(form('first'), 'order_item', '42');
				persistence.autoSave(form('second'), 'order', 'item_42');
				jasmine.clock().tick(101);
				expect(persistence.loadDraft('order_item', '42')?.formData).toEqual({ name: 'first' });
				expect(persistence.loadDraft('order', 'item_42')?.formData).toEqual({ name: 'second' });
				expect(storage.getUserDraftIndex('alice')?.draftKeys.length).toBe(2);
				persistence.deleteDraft('order_item', '42');
				expect(persistence.hasDraft('order_item', '42')).toBeFalse();
				expect(persistence.loadDraft('order', 'item_42')?.formData).toEqual({ name: 'second' });
			});

			it('isolates load, delete, and bulk delete across colliding user identities', () => {
				const { persistence, session } = setup({ customStorage });
				persistence.saveDraft('admin_order', '42', { name: 'alice' });
				session.startSession('alice_admin');
				persistence.setUserId('alice_admin');
				persistence.saveDraft('order', '42', { name: 'admin' });
				expect(persistence.loadDraft('order', '42')?.formData).toEqual({ name: 'admin' });
				persistence.deleteDraft('order', '42');
				expect(persistence.hasDraft('order', '42')).toBeFalse();
				persistence.saveDraft('order', '42', {});
				persistence.deleteAllDrafts();
				persistence.setUserId('alice');
				expect(persistence.loadDraft('admin_order', '42')?.formData).toEqual({ name: 'alice' });
			});

			it('migrates a matching legacy draft and index without changing metadata', () => {
				const { persistence, storage, key, legacyKey, draft } = seedLegacy();
				expect(persistence.loadDraft('order_item', '42')).toEqual(draft);
				expect(storage.getDraft(key)).toEqual(draft);
				expect(storage.getDraft(legacyKey)).toBeUndefined();
				expect(storage.getUserDraftIndex('alice')?.draftKeys).toEqual([key]);
				persistence.deleteDraft('order_item', '42');
				expect(persistence.hasDraft('order_item', '42')).toBeFalse();
			});

			it('retains the legacy draft and index when migration cannot write', () => {
				const { persistence, storage, key, legacyKey, draft } = seedLegacy();
				spyOn(storage, 'setDraft').and.stub();
				expect(persistence.loadDraft('order_item', '42')).toEqual(draft);
				expect(storage.getDraft(key)).toBeUndefined();
				expect(storage.getDraft(legacyKey)).toEqual(draft);
				expect(storage.getUserDraftIndex('alice')?.draftKeys).toEqual([legacyKey]);
			});

			it('still loads legacy drafts when an adapter throws during migration', () => {
				const { persistence, storage, legacyKey, draft } = seedLegacy();
				spyOn(storage, 'setDraft').and.throwError('Storage full');
				expect(persistence.loadDraft('order_item', '42')).toEqual(draft);
				expect(persistence.hasDraft('order_item', '42')).toBeTrue();
				expect(storage.getDraft(legacyKey)).toEqual(draft);
				expect(storage.getUserDraftIndex('alice')?.draftKeys).toEqual([legacyKey]);
			});

			it('retains the legacy copy when the migrated index cannot be written', () => {
				const { persistence, storage, key, legacyKey, draft } = seedLegacy();
				spyOn(storage, 'setUserDraftIndex').and.stub();
				expect(persistence.loadDraft('order_item', '42')).toEqual(draft);
				expect(storage.getDraft(key)).toBeUndefined();
				expect(storage.getDraft(legacyKey)).toEqual(draft);
				expect(storage.getUserDraftIndex('alice')?.draftKeys).toEqual([legacyKey]);
				persistence.deleteAllDrafts();
				expect(storage.getDraft(legacyKey)).toBeUndefined();
				expect(storage.getDraft(key)).toBeUndefined();
			});

			it('rolls back migration when an adapter throws while updating the index', () => {
				const { persistence, storage, key, legacyKey, draft } = seedLegacy();
				spyOn(storage, 'setUserDraftIndex').and.throwError('Storage full');
				expect(persistence.loadDraft('order_item', '42')).toEqual(draft);
				expect(storage.getDraft(key)).toBeUndefined();
				expect(storage.getDraft(legacyKey)).toEqual(draft);
				expect(storage.getUserDraftIndex('alice')?.draftKeys).toEqual([legacyKey]);
			});

			it('retains legacy data when saving a replacement fails', () => {
				const { persistence, storage, legacyKey, draft } = seedLegacy();
				spyOn(storage, 'setDraft').and.stub();
				persistence.saveDraft('order_item', '42', { name: 'replacement' });
				expect(storage.getDraft(legacyKey)).toEqual(draft);
				expect(persistence.loadDraft('order_item', '42')).toEqual(draft);
			});

			for (const throws of [false, true]) {
				it(`retains indexed legacy data when a replacement index write ${throws ? 'throws' : 'fails'}`, () => {
					const { persistence, storage, key, legacyKey, draft } = seedLegacy();
					const updateIndex = spyOn(storage, 'setUserDraftIndex');
					if (throws) {
						updateIndex.and.throwError('Storage full');
						expect(() => persistence.saveDraft('order_item', '42', { name: 'replacement' })).toThrowError();
					} else {
						updateIndex.and.stub();
						persistence.saveDraft('order_item', '42', { name: 'replacement' });
					}
					expect(storage.getDraft(key)).toBeUndefined();
					expect(storage.getDraft(legacyKey)).toEqual(draft);
					expect(storage.getUserDraftIndex('alice')?.draftKeys).toEqual([legacyKey]);
					updateIndex.and.callThrough();
					persistence.deleteAllDrafts();
					expect(persistence.hasDraft('order_item', '42')).toBeFalse();
				});
			}

			if (!customStorage) {
				it('retains legacy data without throwing when a replacement cannot be serialized', () => {
					const { persistence, storage, legacyKey, draft } = seedLegacy();
					const circular: { self?: unknown } = {};
					circular.self = circular;
					spyOn(console, 'error');
					expect(() => persistence.saveDraft('order_item', '42', circular)).not.toThrow();
					expect(storage.getDraft(legacyKey)).toEqual(draft);
				});
			}

			it('prefers the current draft and removes legacy copies when saving or deleting', () => {
				const { persistence, storage, key, legacyKey, draft } = seedLegacy();
				const current = { ...draft, formData: { name: 'current' } };
				storage.setDraft(key, current);
				expect(persistence.loadDraft('order_item', '42')).toEqual(current);
				persistence.saveDraft('order_item', '42', { name: 'updated' });
				expect(storage.getDraft(legacyKey)).toBeUndefined();
				expect(storage.getDraft(key)?.metadata.createdAt).toBe(draft.metadata.createdAt);
				storage.setDraft(legacyKey, draft);
				persistence.deleteDraft('order_item', '42');
				expect(storage.getDraft(key)).toBeUndefined();
				expect(storage.getDraft(legacyKey)).toBeUndefined();
			});

			it('deletes a matching legacy draft even before it has been loaded', () => {
				const { persistence, storage, legacyKey } = seedLegacy();
				persistence.deleteDraft('order_item', '42');
				expect(storage.getDraft(legacyKey)).toBeUndefined();
				expect(storage.getUserDraftIndex('alice')?.draftKeys).toEqual([]);
			});

			it('does not load, delete, or overwrite a colliding legacy entity', () => {
				const { persistence, storage, legacyKey, draft } = seedLegacy();
				expect(persistence.loadDraft('order', 'item_42')).toBeUndefined();
				persistence.deleteDraft('order', 'item_42');
				expect(storage.getDraft(legacyKey)).toEqual(draft);
				persistence.saveDraft('order', 'item_42', { name: 'other' });
				expect(storage.getDraft(legacyKey)).toEqual(draft);
				expect(persistence.loadDraft('order_item', '42')).toEqual(draft);
				expect(persistence.loadDraft('order', 'item_42')?.formData).toEqual({ name: 'other' });
			});

			it('rejects another user’s legacy draft even when expired or indexed by both users', () => {
				const { persistence, session, storage, legacyKey, draft } = seedLegacy('alice_admin', 'order');
				session.startSession('alice');
				persistence.setUserId('alice');
				storage.setUserDraftIndex('alice', {
					...storage.getUserDraftIndex('alice')!,
					draftKeys: [legacyKey],
				});
				expect(persistence.loadDraft('admin_order', '42')).toBeUndefined();
				persistence.deleteDraft('admin_order', '42');
				persistence.deleteAllDrafts();
				expect(storage.getDraft(legacyKey)).toEqual(draft);
				jasmine.clock().tick(1001);
				expect(persistence.loadDraft('admin_order', '42')).toBeUndefined();
				expect(storage.getDraft(legacyKey)).toEqual(draft);
			});

			it('does not let a stale legacy user index delete another user’s draft', () => {
				const { storage, cleanup, legacyKey, draft } = seedLegacy('alice_admin', 'order');
				storage.setUserDraftIndex('alice', {
					...storage.getUserDraftIndex('alice')!,
					draftKeys: [legacyKey],
					lastActivity: Date.now() - 5001,
				});
				cleanup.runCleanup();
				expect(storage.getDraft(legacyKey)).toEqual(draft);
			});

			it('expires matching legacy drafts without migrating them', () => {
				const { persistence, storage, key, legacyKey } = seedLegacy();
				jasmine.clock().tick(1000);
				expect(persistence.loadDraft('order_item', '42')).toBeUndefined();
				expect(storage.getDraft(key)).toBeUndefined();
				expect(storage.getDraft(legacyKey)).toBeUndefined();
				expect(storage.getUserDraftIndex('alice')?.draftKeys).toEqual([]);
			});

			it('does not resurrect a legacy copy after the current draft expires', () => {
				const { persistence, storage, key, draft } = seedLegacy();
				storage.setDraft(key, { ...draft, metadata: { ...draft.metadata, expiresAt: Date.now() } });
				expect(persistence.loadDraft('order_item', '42')).toBeUndefined();
				expect(persistence.loadDraft('order_item', '42')).toBeUndefined();
			});

			it('rejects mismatched identity metadata even under a current key', () => {
				const { persistence, storage, key, draft } = seedLegacy();
				storage.removeItem(`${defaultConfig.draftKeyPrefix}alice_order_item_42`);
				const other = { ...draft, metadata: { ...draft.metadata, userId: 'bob' } };
				storage.setDraft(key, other);
				expect(persistence.loadDraft('order_item', '42')).toBeUndefined();
				persistence.deleteDraft('order_item', '42');
				expect(storage.getDraft(key)).toEqual(other);
			});
		});
	}

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
});
