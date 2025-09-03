import { InjectionToken } from "@angular/core";
import { StoredEntityData } from "./storage-entity-data";
import { UserDraftIndex } from "./user-draft-index";

/**
 * This interface defines the contract for a storage service.
 * The library provides per default an adapter for the localstorage.
 * But if you like, you can write your own for e.g. sync your data to a server
 * or storing it inside the session storage.
 */
export interface FormCacheStorage {
  getItem<T>(key: string): T | undefined;
  setItem<T>(key: string, value: T): void;
  removeItem(key: string): void;
  clear(): void;

  generateDraftKey(userId: string, entityType: string, entityId: string): string;
  generateIndexKey(userId: string): string;
  getUserDraftIndex(userId: string): UserDraftIndex | undefined;
  setUserDraftIndex(userId: string, index: UserDraftIndex): void;
  getDraft<T>(key: string): StoredEntityData<T> | undefined;
  setDraft(key: string, data: StoredEntityData): void;
}

export const FORM_CACHE_STORAGE = new InjectionToken<FormCacheStorage>('form-cache.storage');