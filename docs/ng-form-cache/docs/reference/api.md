---
sidebar_position: 1
---

# API Reference

This reference covers every symbol exported from `@planbgmbh/ng-form-cache`.

## Providers and configuration

### `provideFormCacheStorage(config, storageClass?)`

Factory that returns the provider array required to wire up the library. Use it in standalone bootstrap or inside an `NgModule`.

- `config.baseConfig: FormCacheConfig`
  - `indexKeyPrefix` (default `fc_index_`)
  - `draftKeyPrefix` (default `fc_draft_`)
  - `sessionIdKey` (default `app_current_session_id`)
  - `autoSaveDebounceTime` (default `1000` ms)
- `config.perstistenceConfig: PersistenceConfig`
  - `ttl`: milliseconds until a draft expires.
  - `cleanupInterval`: how often `CleanupService` runs.
  - `staleThreshold`: inactivity threshold before user sessions are considered stale.
  - `storageQuota`: approximate storage size in bytes before quota cleanup kicks in.
Class injection for `FormPersistenceService`, `SessionManagerService`, and `CleanupService` resolves to the same instances as the corresponding tokens.

- `storageClass`: optional `Type` that implements `FormCacheStorage`. Defaults to `LocalStorageService`.

### `defaultConfig`

Base `FormCacheConfig` you can spread and override when calling `provideFormCacheStorage`.

### Injection tokens

- `FORM_CACHE_CONFIG`: binds a `FormCacheConfig` instance.
- `DRAFT_PERSISTENT_CONFIG`: binds a `PersistenceConfig` instance.
- `FORM_CACHE_STORAGE`: resolves to the active `FormCacheStorage` adapter.
- `FORM_PERSISTENCE_SERVICE`, `SESSION_MANAGER_SERVICE`, `CLEANUP_SERVICE`: expose the internal services for advanced customization.

## Directives

### `AutoSaveDirective`

Standalone directive that listens to `FormGroup.valueChanges` and triggers autosave.

Inputs:

- `fcAutoSave` (required): entity type string.
- `fcObjectId` (required): entity identifier string.
- `fcAutoLoad` (default `true`): load the newest draft automatically during `ngOnInit`.
- `fcNotifyFunc`: callback invoked with `StoredEntityData` after a draft is restored.

Attach it directly to your `<form>` element. The directive requires the form to come from `FormGroupDirective`.

## Services

### `FormPersistenceService`

Handles serialization, persistence, and index management.

| Method | Description |
| --- | --- |
| `setUserId(id: string \| number)` | Registers the active user and cancels pending saves when the user changes. Start or resume a matching session before saving. |
| `autoSave(form: FormGroup, entityType: string, entityId: string)` | Debounced per entity; pending edits are discarded after user/session changes. |
| `saveDraft(entityType: string, entityId: string, formData: unknown)` | Immediately persist a custom payload. |
| `loadDraft<T>(entityType: string, entityId: string): StoredEntityData<T> \| undefined` | Return an unexpired draft; expired drafts and their index entries are removed. |
| `deleteDraft(entityType: string, entityId: string)` | Cancel pending saves, remove a single draft, and update the user index. |
| `deleteAllDrafts()` | Clears every draft for the current user and resets the index. |
| `hasDraft(entityType: string, entityId: string)` | Boolean convenience wrapper around `loadDraft`. |

### `SessionManagerService`

Manages session identifiers and synchronizes them across tabs.

| Method | Description |
| --- | --- |
| `startSession(userId: string): string` | Generates and stores a new session id, returns it. |
| `endSession(userId: string)` | Clears the session id from storage and updates the draft index. |
| `getSessionId(): string \| undefined` | Returns the cached or stored session id. |
| `isSessionValid(userId: string): boolean` | Verifies that the stored index belongs to the active session. |

### `CleanupService`

Runs maintenance against the configured storage backend. Call `start()` explicitly to enable the browser timer. Adapters must implement optional `keys()` for enumeration.

| Method | Description |
| --- | --- |
| `start()` | Begin the cleanup interval timer. |
| `stop()` | Cancel the cleanup interval. Called automatically in `ngOnDestroy`. |
| `runCleanup()` | Execute cleanup immediately (expires drafts, removes stale sessions, enforces quota). |

### `LocalStorageService`

Default `FormCacheStorage` adapter that persists JSON to `window.localStorage`, with a `keys()` snapshot for cleanup. Browser storage operations become no-ops on the server. Implements all interface methods and prefixes keys using `FormCacheConfig`.

## Utility functions

### `serializeForm(form: FormGroup): string`

Returns a JSON string representation of the form's raw value.

### `deserializeForm(json: string, form: FormGroup): void`

Parses JSON and patches the form instance. Logs an error if parsing fails.

## Types

- `FormCacheConfig`: Structure described in the configuration section above.
- `PersistenceConfig`: TTL, cleanup, stale-session, and quota fields.
- `StoredEntityData<T>`: Container for persisted drafts.
- `StorageMetadata`: Metadata inside `StoredEntityData`.
- `StorageKey`: Shape used by storage adapters to compose key strings.
- `UserDraftIndex`: Tracks draft keys and last activity per user.
- `FormCacheStorage`: Interface that custom storage implementations must satisfy.

Use these types to add strong typing to your application layer or when writing custom adapters.

## Persisted record policy

Draft metadata and user indexes use schema version 1. Valid records from the original unversioned format are normalized on read and written as version 1 on the next save. Runtime checks validate metadata, timestamps, index fields, and ownership before records are used. The generic `getItem<T>()` remains a raw JSON API; use `getDraft()` and `getUserDraftIndex()` for validated cache records.

Malformed JSON, invalid records, and unsupported versions are treated as unavailable and left in storage for application recovery. Explicitly saving to the same key replaces its contents. Cleanup and bulk deletion only follow keys belonging to validated drafts for the expected user; they do not erase unrelated data referenced by a damaged index. Payload types remain the application's responsibility.

### Draft key migration

The built-in adapter generates `draftKeyPrefix + "v2:" + encodeURIComponent(JSON.stringify([userId, entityType, entityId]))`, additionally escaping underscores as `%5F`. Tuple encoding supports separators, Unicode, and empty identifiers without collisions; escaping underscores prevents overlap with legacy keys. Index keys retain their existing format. Treat storage keys as opaque and always use the adapter's key generation methods.

Reading an old draft by its identity migrates it and updates its user index. Migration requires all identity fields to match and retains the old copy unless both writes can be verified. Existing drafts that already collided in the old format cannot be reconstructed if previously overwritten. Optional `FormCacheStorage.removeDraft(key)` allows adapters to erase identity-checked legacy copies during deletion.

## Save outcomes

`saveDraft()` returns a `DraftSaveState`. `getSaveState(entityType, entityId)` reads the reactive state for the current user; it can be called directly in an Angular template. `saveStates` is a readonly signal containing states by generated storage key. States are `idle`, `pending`, `saved`, `failed`, or `cancelled`. A failed state includes `phase` (`session`, `draft`, or `index`), `reason`, an optional original `error`, and `draftPersisted`. An index failure can leave a recoverable draft in storage; it is still reported as failed so the application can retry. A saved state acknowledges that synchronous save and does not promise retention after later edits, deletion, or cleanup.

The built-in adapter returns `StorageWriteResult` from `setItem`, `setDraft`, and `setUserDraftIndex`: either `{ success: true }` or `{ success: false, reason, error? }`. Reasons are `quota`, `access`, `serialization`, `unavailable`, and `unknown`. Persistence additionally reports `invalid-session`. A failed draft write never updates the user index. Custom adapters may still return `void` (assumed success) or throw; to reliably report swallowed failures, adopt explicit results.

Quota recovery makes exactly one retry after removing validated expired drafts. It preserves active drafts and unrelated storage. Access and serialization failures are not retried automatically. The application can retain form edits, display `getSaveState(...).status`, and offer a button calling `saveDraft()` again, as shown in the sample. Server writes with the default browser adapter report `unavailable`.
