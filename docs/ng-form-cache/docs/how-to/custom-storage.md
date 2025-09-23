---
sidebar_position: 3
---

# Replace the Storage Backend

The default implementation stores drafts in `localStorage`. Implement the `FormCacheStorage` interface to persist data elsewhere (for example `sessionStorage` or a remote API).

## 1. Create a storage service

```typescript title="app/session-storage.service.ts"
import { Injectable } from '@angular/core';
import {
  FormCacheStorage,
  StoredEntityData,
  UserDraftIndex,
} from '@planbgmbh/ng-form-cache';

@Injectable()
export class SessionStorageService implements FormCacheStorage {
  getItem<T>(key: string): T | undefined {
    const raw = sessionStorage.getItem(key);
    return raw ? JSON.parse(raw) : undefined;
  }

  setItem<T>(key: string, value: T): void {
    sessionStorage.setItem(key, JSON.stringify(value));
  }

  removeItem(key: string): void {
    sessionStorage.removeItem(key);
  }

  clear(): void {
    sessionStorage.clear();
  }

  generateDraftKey(userId: string, entityType: string, entityId: string): string {
    return `session_draft_${userId}_${entityType}_${entityId}`;
  }

  generateIndexKey(userId: string): string {
    return `session_index_${userId}`;
  }

  getUserDraftIndex(userId: string): UserDraftIndex | undefined {
    return this.getItem<UserDraftIndex>(this.generateIndexKey(userId));
  }

  setUserDraftIndex(userId: string, index: UserDraftIndex): void {
    this.setItem(this.generateIndexKey(userId), index);
  }

  getDraft<T>(key: string): StoredEntityData<T> | undefined {
    return this.getItem<StoredEntityData<T>>(key);
  }

  setDraft(key: string, data: StoredEntityData): void {
    this.setItem(key, data);
  }
}
```

## 2. Provide the custom class

Pass the class as the second argument to `provideFormCacheStorage`.

```typescript title="app.config.ts"
import { ApplicationConfig } from '@angular/core';
import { provideFormCacheStorage, defaultConfig } from '@planbgmbh/ng-form-cache';
import { SessionStorageService } from './session-storage.service';

export const appConfig: ApplicationConfig = {
  providers: [
    provideFormCacheStorage(
      {
        baseConfig: defaultConfig,
        perstistenceConfig: {
          ttl: 30 * 60 * 1000,
          cleanupInterval: 60_000,
          staleThreshold: 10 * 60 * 1000,
          storageQuota: 2 * 1024 * 1024,
        },
      },
      SessionStorageService,
    ),
  ],
};
```

## 3. Tune the configuration

Consider lowering TTL and quota when using a smaller storage medium like session storage.

> You can also skip `provideFormCacheStorage` entirely and bind each token (`FORM_CACHE_STORAGE`, `FORM_CACHE_CONFIG`, etc.) manually if you need full control.
