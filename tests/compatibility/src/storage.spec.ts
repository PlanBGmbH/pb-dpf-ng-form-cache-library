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
});
