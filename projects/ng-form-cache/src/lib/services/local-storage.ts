import { isPlatformBrowser } from '@angular/common';
import { inject, Injectable, PLATFORM_ID } from '@angular/core';
import { storageFailure } from '../helpers/storage-write';
import { StorageWriteResult } from '../types/storage-write-result';
import { readDraft, readIndex } from '../helpers/storage-records';
import { FORM_CACHE_CONFIG } from '../config/cache-config';
import { StoredEntityData } from '../types/storage-entity-data';
import { FormCacheStorage } from '../types/storage-service';
import { UserDraftIndex } from '../types/user-draft-index';

@Injectable()
export class LocalStorageService implements FormCacheStorage {
	private readonly config = inject(FORM_CACHE_CONFIG);
	private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

	/** Returns a snapshot of the keys available to cleanup. */
	public keys(): string[] {
		if (!this.isBrowser) return [];
		try {
			const keys: string[] = [];
			for (let i = 0; i < localStorage.length; i++) {
				const key = localStorage.key(i);
				if (key !== null) keys.push(key);
			}
			return keys;
		} catch {
			return [];
		}
	}

	/**
	 * Retrieves an item from local storage and deserializes it.
	 * @param key The key of the item to retrieve.
	 * @returns The deserialized item, or null if not found or on error.
	 */
	public getItem<T>(key: string): T | undefined {
		if (!this.isBrowser) return;
		try {
			const item = localStorage.getItem(key);
			return item ? JSON.parse(item) : undefined;
		} catch (error) {
			console.error(`Error reading from local storage for key: ${key}`, error);
			return;
		}
	}

	/**
	 * Serializes and saves an item to local storage.
	 * @param key The key to store the item under.
	 * @param value The value to store.
	 */
	public setItem<T>(key: string, value: T): void | StorageWriteResult {
		if (!this.isBrowser) return { success: false, reason: 'unavailable' };
		let item: string;
		try {
			const serialized = JSON.stringify(value);
			if (serialized === undefined) throw new TypeError('Value cannot be serialized as JSON');
			item = serialized;
		} catch (error) {
			return { success: false, reason: 'serialization', error };
		}
		try {
			localStorage.setItem(key, item);
			return { success: true };
		} catch (error) {
			const failure = storageFailure(error);
			if (failure.reason !== 'quota') return failure;
			// One retry, removing only expired cache drafts. Preserve active drafts and unrelated data.
			this.removeExpiredDrafts(key);
			try {
				localStorage.setItem(key, item);
				return { success: true };
			} catch (retryError) {
				return storageFailure(retryError);
			}
		}
	}

	private removeExpiredDrafts(writingKey: string) {
		for (const key of this.keys()) {
			if (key === writingKey || !key.startsWith(this.config.draftKeyPrefix)) continue;
			const draft = readDraft(this.getItem(key));
			if (
				draft &&
				draft.metadata.expiresAt <= Date.now() &&
				(key === this.generateDraftKey(draft.metadata.userId, draft.entityType, draft.entityId ?? '') ||
					key === this.legacyDraftKey(draft.metadata.userId, draft.entityType, draft.entityId ?? ''))
			)
				this.removeItem(key);
		}
	}

	/**
	 * Removes an item from local storage.
	 * @param key The key of the item to remove.
	 */
	public removeItem(key: string) {
		if (!this.isBrowser) return;
		try {
			localStorage.removeItem(key);
		} catch (error) {
			console.error(`Error removing item from local storage for key: ${key}`, error);
		}
	}

	/**
	 * Clears all items from local storage.
	 */
	public clear() {
		if (!this.isBrowser) return;
		try {
			localStorage.clear();
		} catch (error) {
			console.error('Error clearing local storage', error);
		}
	}

	/**
	 * Generates a storage key for a draft.
	 * @param userId The user's ID.
	 * @param entityType The type of the entity.
	 * @param entityId The entity's ID.
	 * @returns The generated storage key.
	 */
	public generateDraftKey(userId: string, entityType: string, entityId: string) {
		// Escape underscores too: the new suffix cannot overlap any legacy three-part key.
		return `${this.config.draftKeyPrefix}v2:${encodeURIComponent(JSON.stringify([userId, entityType, entityId])).replace(/_/g, '%5F')}`;
	}

	/**
	 * Generates the storage key for the user's draft index.
	 * @param userId The user's ID.
	 * @returns The generated storage key.
	 */
	public generateIndexKey(userId: string) {
		return `${this.config.indexKeyPrefix}${userId}`;
	}

	/**
	 * Retrieves the user's draft index.
	 * @param userId The user's ID.
	 * @returns The user's draft index, or null if not found.
	 */
	public getUserDraftIndex(userId: string) {
		const raw = this.getItem<unknown>(this.generateIndexKey(userId));
		const index = readIndex(raw, userId);
		// Preserve unsupported records rather than interpreting a future index format.
		if (raw !== undefined && !index) return;
		const drafts = new Map<string, { key: string; draft: StoredEntityData }>();
		// Draft records are authoritative. A stale read/modify/write of the advisory index
		// cannot hide a completed save: each read reconciles the backend's current keys.
		for (const key of new Set([...this.keys(), ...(index?.draftKeys ?? [])])) {
			if (!key.startsWith(this.config.draftKeyPrefix)) continue;
			const draft = this.getDraft(key);
			if (draft?.metadata.userId !== userId) continue;
			const canonical = this.generateDraftKey(userId, draft.entityType, draft.entityId ?? '');
			this.getDraft(canonical);
			const stored = readDraft(this.getItem(canonical));
			const hasCanonical =
				stored && this.generateDraftKey(stored.metadata.userId, stored.entityType, stored.entityId ?? '') === canonical;
			drafts.set(canonical, { key: hasCanonical ? canonical : key, draft: hasCanonical ? stored : draft });
		}
		if (!index && !drafts.size) return;
		let lastActivity = index?.lastActivity ?? 0;
		for (const { draft } of drafts.values()) lastActivity = Math.max(lastActivity, draft.metadata.lastModified);
		return {
			version: 1 as const,
			userId,
			sessionId: index?.sessionId ?? '',
			draftKeys: [...drafts.values()].map(({ key }) => key),
			lastActivity,
		};
	}

	/**
	 * Updates the user's draft index.
	 * @param userId The user's ID.
	 * @param index The updated draft index.
	 */
	public setUserDraftIndex(userId: string, index: UserDraftIndex): void | StorageWriteResult {
		const key = this.generateIndexKey(userId);
		return this.setItem(key, { ...index, version: 1 });
	}

	/**
	 * Retrieves a specific draft from storage.
	 * @param key The key of the draft to retrieve.
	 * @returns The stored entity data, or null if not found.
	 */
	public getDraft<T>(key: string) {
		if (!key.startsWith(this.config.draftKeyPrefix)) return;
		const draft = readDraft<T>(this.getItem<unknown>(key));
		if (
			draft &&
			(key === this.generateDraftKey(draft.metadata.userId, draft.entityType, draft.entityId ?? '') ||
				key === this.legacyDraftKey(draft.metadata.userId, draft.entityType, draft.entityId ?? ''))
		)
			return draft;
		// Never overwrite malformed or unsupported data as a side effect of reading.
		if (this.getItem<unknown>(key) !== undefined || this.keys().includes(key)) return;
		const identity = this.parseDraftKey(key);
		if (!identity) return;
		const [userId, entityType, entityId] = identity;
		const legacyKey = this.legacyDraftKey(userId, entityType, entityId);
		const legacy = readDraft<T>(this.getItem<unknown>(legacyKey));
		if (
			!legacy ||
			legacy.metadata.userId !== userId ||
			legacy.entityType !== entityType ||
			(legacy.entityId ?? '') !== entityId
		)
			return;
		this.setDraft(key, legacy);
		if (JSON.stringify(this.getItem(key)) !== JSON.stringify(legacy)) return legacy;
		const indexKey = this.generateIndexKey(userId);
		const index = readIndex(this.getItem(indexKey), userId);
		if (index) {
			index.draftKeys = [...new Set([...index.draftKeys.filter((item) => item !== legacyKey), key])];
			this.setUserDraftIndex(userId, index);
			if (readIndex(this.getItem(indexKey), userId)?.draftKeys.includes(key)) this.removeItem(legacyKey);
		}
		return legacy;
	}

	/** Removes both key formats, only following an identity-checked legacy record. */
	public removeDraft(key: string): void {
		const identity = this.parseDraftKey(key);
		if (identity) {
			const [userId, entityType, entityId] = identity;
			const legacyKey = this.legacyDraftKey(userId, entityType, entityId);
			const legacy = readDraft(this.getItem(legacyKey));
			if (
				legacy?.metadata.userId === userId &&
				legacy.entityType === entityType &&
				(legacy.entityId ?? '') === entityId
			) {
				this.removeItem(legacyKey);
			}
		}
		this.removeItem(key);
	}

	private legacyDraftKey(userId: string, entityType: string, entityId: string) {
		return `${this.config.draftKeyPrefix}${userId}_${entityType}_${entityId}`;
	}

	private parseDraftKey(key: string): [string, string, string] | undefined {
		const prefix = `${this.config.draftKeyPrefix}v2:`;
		if (!key.startsWith(prefix)) return;
		try {
			const value: unknown = JSON.parse(decodeURIComponent(key.slice(prefix.length)));
			if (
				Array.isArray(value) &&
				value.length === 3 &&
				value.every((part) => typeof part === 'string') &&
				this.generateDraftKey(value[0], value[1], value[2]) === key
			)
				return value as [string, string, string];
		} catch {
			/* A legacy key may happen to start with the version marker. */
		}
		return;
	}

	/**
	 * Saves a draft to storage.
	 * @param key The key to store the draft under.
	 * @param data The draft data to store.
	 */
	public setDraft(key: string, data: StoredEntityData): void | StorageWriteResult {
		return this.setItem(key, { ...data, metadata: { ...data.metadata, version: 1 } });
	}
}
