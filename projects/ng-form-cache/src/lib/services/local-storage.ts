import { inject, Injectable } from '@angular/core';
import { FORM_CACHE_CONFIG } from '../config/cache-config';
import { StoredEntityData } from '../types/storage-entity-data';
import { FormCacheStorage } from '../types/storage-service';
import { UserDraftIndex } from '../types/user-draft-index';

@Injectable()
export class LocalStorageService implements FormCacheStorage {
  private readonly config = inject(FORM_CACHE_CONFIG);

	/**
	 * Retrieves an item from local storage and deserializes it.
	 * @param key The key of the item to retrieve.
	 * @returns The deserialized item, or null if not found or on error.
	 */
	public getItem<T>(key: string): T | undefined {
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
		return `${this.config.draftKeyPrefix}${userId}_${entityType}_${entityId}`;
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
		return this.getItem<UserDraftIndex>(key);
	}

	/**
	 * Updates the user's draft index.
	 * @param userId The user's ID.
	 * @param index The updated draft index.
	 */
	public setUserDraftIndex(userId: string, index: UserDraftIndex) {
		const key = this.generateIndexKey(userId);
		this.setItem(key, index);
	}

	/**
	 * Retrieves a specific draft from storage.
	 * @param key The key of the draft to retrieve.
	 * @returns The stored entity data, or null if not found.
	 */
	public getDraft<T>(key: string) {
		return this.getItem<StoredEntityData<T>>(key);
	}

	/**
	 * Saves a draft to storage.
	 * @param key The key to store the draft under.
	 * @param data The draft data to store.
	 */
	public setDraft(key: string, data: StoredEntityData) {
		this.setItem(key, data);
	}
}
