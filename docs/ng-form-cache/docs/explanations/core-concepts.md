---
sidebar_position: 1
---

# Core Concepts

Understanding the moving pieces behind ng-form-cache makes it easier to reason about persistence, configure cleanup, and extend the system. This page explains the main concepts and how they interact during the draft lifecycle.

## Drafts and metadata

Every autosaved form snapshot is stored as a `StoredEntityData` object. It bundles:

- `formData`: the serialized `FormGroup` value.
- `metadata`: timestamps, version, the originating user, and the session id.
- `entityType` / `entityId`: logical identifiers you choose to scope drafts (for example `"order"` + `"new"`).
- Flags such as `isDirty` and `autoSaveEnabled` for future UI scenarios.

The combination of `entityType` and `entityId` lets you manage multiple drafts per user.

## User draft index

To keep track of all keys that belong to a user, ng-form-cache maintains a `UserDraftIndex` entry. It records the latest session id and every draft key associated with the user. The index enables fast cleanup without searching the entire storage namespace.

## Session tracking

`SessionManagerService` assigns the application session a generated id and stores it under the `sessionIdKey` (defaults to `app_current_session_id`). When a session starts or ends:

1. The service writes the id into storage so other tabs stay in sync.
2. The user draft index is updated with the new `sessionId` and `lastActivity` timestamp.
3. Call `endSession(userId)` explicitly on logout. Closing a tab does not clear localStorage.

You can query `sessionManagerService.isSessionValid(userId)` to confirm that the stored drafts belong to the active session.

## Autosave flow

1. The `AutoSaveDirective` subscribes to `FormGroup.valueChanges` and emits updates to `FormPersistenceService.autoSave(...)`.
2. `FormPersistenceService` debounces writes (`autoSaveDebounceTime`) and orchestrates serialization.
3. Drafts are persisted through the `FormCacheStorage` adapter (localStorage by default).
4. The service also updates the user draft index so other features (cleanup, resume flows) can quickly list stored drafts.

When `[fcAutoLoad]="true"`, the directive loads the newest draft as soon as the component mounts and optionally calls `[fcNotifyFunc]`.

## Cleanup strategy

`CleanupService` periodically executes three maintenance tasks:

- **Expired drafts** — removes entries whose `expiresAt` timestamp is older than `Date.now()`.
- **Stale sessions** — deletes a user's drafts if `lastActivity` exceeds the configured `staleThreshold`.
- **Quota management** — when storage exceeds `storageQuota`, oldest drafts are removed until the cache is within its approximate UTF-16 byte budget or no drafts remain. Only configured draft and index prefixes count toward the budget; unrelated application data is excluded. Index overhead can still exceed an extremely small budget.

Call `cleanupService.start()` once during browser application startup to enable periodic cleanup, or call `runCleanup()` for explicit maintenance. Registering the providers alone does not start the timer. The scheduler runs outside Angular's zone and stops when its injector is destroyed. No timer or browser storage access is started on the server.

## Configuration layers

Two configuration objects feed the system:

- `FormCacheConfig` (`FORM_CACHE_CONFIG`): controls key prefixes, the session storage key, and debounce timings.
- `PersistenceConfig` (`DRAFT_PERSISTENT_CONFIG`): defines TTL, cleanup cadence, stale session threshold, and the approximate storage budget.

Use `defaultConfig` as a base and override pieces to align with your product constraints.

## Storage abstraction

All persistence goes through the `FormCacheStorage` interface. The library ships with `LocalStorageService`, but you can bind a custom implementation. A storage adapter must:

- Read/write JSON objects by key (`getItem`, `setItem`, `removeItem`, `clear`).
- Generate normalized draft and index keys so cleanup can detect relevant entries.
- Fetch and store `StoredEntityData` instances as well as `UserDraftIndex` records.

The adapter contract is synchronous. Session storage or an in-memory cache can implement it directly; a remote API needs a separate synchronization layer. Implement optional `keys(): string[]` to enable background cleanup. Older adapters without `keys()` still support saving and loading, but cleanup skips enumeration for them.
