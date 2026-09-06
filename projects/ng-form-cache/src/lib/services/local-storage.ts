import { isPlatformBrowser } from '@angular/common';
import { inject, Injectable, PLATFORM_ID } from '@angular/core';
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
	public setItem<T>(key: string, value: T) {
		if (!this.isBrowser) return;
		try {
			const item = JSON.stringify(value);
			localStorage.setItem(key, item);
		} catch (error) {
			console.error(`Error writing to local storage for key: ${key}`, error);
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
		const key = this.generateIndexKey(userId);
		const index = readIndex(this.getItem<unknown>(key), userId);
		if (!index) return;
		index.draftKeys = [
			...new Set(
				index.draftKeys.flatMap((draftKey) => {
					const draft = this.getDraft(draftKey);
					if (draft?.metadata.userId !== userId) return [];
					const canonical = this.generateDraftKey(userId, draft.entityType, draft.entityId ?? '');
					this.getDraft(canonical);
					const stored = readDraft(this.getItem(canonical));
					return [
						stored &&
						this.generateDraftKey(stored.metadata.userId, stored.entityType, stored.entityId ?? '') === canonical
							? canonical
							: draftKey,
					];
				}),
			),
		];
		return index;
	}

	/**
	 * Updates the user's draft index.
	 * @param userId The user's ID.
	 * @param index The updated draft index.
	 */
	public setUserDraftIndex(userId: string, index: UserDraftIndex) {
		const key = this.generateIndexKey(userId);
		this.setItem(key, { ...index, version: 1 });
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
	public setDraft(key: string, data: StoredEntityData) {
		this.setItem(key, { ...data, metadata: { ...data.metadata, version: 1 } });
	}
}
