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
| `setUserId(id: string \| number)` | Registers the active user. Must be called before saving or loading drafts. |
| `autoSave(form: FormGroup, entityType: string, entityId: string)` | Debounced entry point used by the directive. |
| `saveDraft(entityType: string, entityId: string, formData: unknown)` | Immediately persist a custom payload. |
| `loadDraft<T>(entityType: string, entityId: string): StoredEntityData<T> \| undefined` | Return the draft for the entity if it exists. |
| `deleteDraft(entityType: string, entityId: string)` | Remove a single draft and update the user index. |
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

Runs periodic maintenance tasks against the storage backend.

| Method | Description |
| --- | --- |
| `start()` | Begin the cleanup interval timer. |
| `stop()` | Cancel the cleanup interval. Called automatically in `ngOnDestroy`. |
| `runCleanup()` | Execute cleanup immediately (expires drafts, removes stale sessions, enforces quota). |

### `LocalStorageService`

Default `FormCacheStorage` adapter that persists JSON to `window.localStorage`. Implements all interface methods and prefixes keys using `FormCacheConfig`.

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
