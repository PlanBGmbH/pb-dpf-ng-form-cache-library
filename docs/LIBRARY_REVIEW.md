# Angular Form Cache Library review

Reviewed on 2026-09-06, after the Angular 20/21/22 compatibility commit `b1cba98`.
The changes below retain the existing public configuration spelling and synchronous storage contract.
No package has been published.

## Bug fixes implemented

| Area | Previous behavior | Corrected behavior |
| --- | --- | --- |
| Concurrent forms | A single debounce stream dropped edits to one entity when another entity changed. | Each storage key has its own debounce timer; repeated edits to the same entity still coalesce. |
| Pending saves | Deleting a draft or clearing all drafts could be undone by a delayed save. | Deletion cancels the corresponding pending saves. Immediate saves supersede pending saves. |
| User/session changes | Pending form data could be written under the next user's identity or a replacement session. | User changes cancel pending work; queued saves capture the originating session and validate it before writing. Saves require a matching user session. |
| Activity tracking | Saving an existing draft did not update `lastActivity`, allowing active users to be treated as stale. | Every successful call to persist a draft refreshes its index activity timestamp. |
| Expiration | Drafts could be restored after their TTL until cleanup happened to run. | Loading an expired draft removes it and its index entry, including at the exact expiration boundary. |
| Cleanup iteration | Removing entries while iterating localStorage by position skipped subsequent entries. | Cleanup enumerates a snapshot of keys. |
| Storage adapters | Cleanup read global localStorage even when a different adapter was configured. | Cleanup uses optional `FormCacheStorage.keys()`. The built-in adapter implements it; existing adapters without enumeration retain save/load support. |
| Quota cleanup | Unrelated application storage triggered eviction, character counts were treated as bytes, and removing 20% could leave the cache over budget. | Only configured draft/index namespaces count; UTF-16 key and JSON sizes approximate bytes; oldest drafts are removed until within budget or no drafts remain. Index overhead alone can exceed a very small budget. |
| Cross-tab sessions | Storage events retained JSON quotes in session IDs and ignored `localStorage.clear()`. An old tab could remove a newer session. | Events decode IDs and handle clearing; ending a session only removes its own persisted ID. |
| Server execution | Session construction and cleanup timers accessed browser globals on the server. | Browser listeners, default browser storage, and scheduled cleanup are guarded by platform checks. Explicit cleanup can still use a custom server adapter. Browser intervals run outside Angular's zone. |
| Dependency injection | Documentation used class injection, but only service tokens had providers. | Class providers alias the existing tokens, sharing the same service instances and respecting token overrides. The provider factory no longer imports through its own public barrel. |
| Restore notifications | Restoring into a dirty form emitted changes and scheduled another save. | Restoration patches the form with `emitEvent: false`; the restore callback remains available. |
| Sample and guides | Setup omitted session startup and claimed that provider registration automatically started cleanup. The sample therefore did not save in a fresh browser. | Sample and guides explicitly start/resume a matching session and start cleanup. Custom adapter examples now use matching prefixes. |

## Improvements tracked for review

### High priority: storage format and failure handling — implemented

1. **Version and validate persisted records.** Draft metadata and user indexes now have runtime guards. Valid unversioned records normalize to schema version 1 and persist that version on the next write. Invalid or unsupported records remain available for application recovery but are ignored by typed cache reads. Cleanup and deletion validate draft ownership before following index keys. Tests cover malformed JSON, invalid metadata/index fields, unknown versions, legacy records, and unrelated data protection.

2. **Adopt unambiguous storage keys with a migration.** Draft keys now use a versioned, percent-encoded JSON tuple. Underscores are escaped too, keeping the new and legacy key spaces disjoint. Migration verifies all three identity fields and retains legacy data until the new record and index entry are confirmed written. Deletion checks the identity of legacy copies. Tests cover 1,000 adversarial tuples, separator collisions, Unicode, interrupted migration, and damaged destinations. Previously overwritten legacy collisions cannot be reconstructed.

3. **Expose storage write outcomes.** Optional synchronous `StorageWriteResult` returns preserve existing void adapters. The built-in adapter reports quota, access, serialization, and server unavailability failures. Quota recovery retries once after removing only expired drafts. Persistence exposes reactive per-draft states and distinguishes draft failures from index failures; failed draft writes never update the index. The sample displays status and offers retry. Tests cover failure reporting, bounded recovery, cancellation, and legacy adapters.

4. **Define cross-tab ownership and conflict behavior.** The built-in adapter treats draft records as authoritative and reconciles every index read against stored keys. Stale concurrent index writes cannot hide completed saves, and missing indexes are reconstructed. The last successful write wins for the same logical draft; payloads are not merged. Versioned application-wide sessions identify their owning user and resume across tabs. Validation reads persisted state immediately, while logout writes an immutable per-session revocation marker so it cannot erase a newer login. Drafts remain after logout; failed revocation writes are reported. Tests cover independent application instances, controlled read/write interleavings, a second browser document, lost indexes, logout races, delayed saves, and legacy session migration. Custom shared adapters must provide equivalent reconciliation or transactions; old adapters remain supported without inheriting this guarantee automatically.

### Medium priority: public API and lifecycle

5. **Make configuration safer while keeping compatibility.** Introduce a correctly spelled `persistenceConfig` alias and deprecate `perstistenceConfig` gradually. Add defaults, validate nonempty/distinct prefixes and positive finite timing/quota values, and constrain `storageClass` to `Type<FormCacheStorage>`. Do not silently remove the legacy spelling or change the `Provider[]` return contract. Acceptance: old examples compile and invalid configurations fail with actionable messages.

6. **Specify dynamic directive behavior.** The directive subscribes to the form present at initialization and restores only once. Replacing a `FormGroup` or changing entity inputs on a reused component needs an explicit resubscription/restoration policy. Review how pending edits are flushed or canceled on navigation and whether pristine programmatic changes should ever save. Acceptance: tests cover input changes, form replacement, teardown, and user edits without writing to the wrong entity.

7. **Offer typed restore/serialization hooks.** Review typed form payloads, callbacks or outputs for restored/saved/failed states, and codecs for dates or other non-JSON values. This can remove the internal `any` cast and clarify disabled-control and `FormArray` behavior. Keep the default JSON behavior compatible.

8. **Make cleanup startup an explicit provider option.** Cleanup now accurately documents the required `start()` call. A future opt-in initializer could make setup easier, but needs a decision about environment providers versus the current module-compatible `Provider[]`, server behavior, injector scope, and scheduler ownership. Acceptance: startup happens exactly once at the intended scope and never keeps SSR pending.

9. **Review the scope of `LocalStorageService.clear()`.** It currently invokes `localStorage.clear()`, including unrelated application data. Decide whether to add a cache-only clearing method, deprecate the broad operation, or change it in a breaking release. Acceptance: applications have an explicit way to erase only this library's data.

### Maintenance and release process

10. **Repair and simplify local quality tooling.** `.husky/pre-commit` invokes `lint-staged`, which is not installed. Its configured command also runs ESLint on JSON/CSS and formats the whole repository. Add the missing tool or replace the hook, target each file type correctly, and give the library a clearly named lint target. Include test fixtures and build scripts in appropriate lint/format checks; the current project lint excludes the browser fixtures and `.prettierignore` excludes `build/`.

11. **Refresh the Angular 20 build toolchain within its major and schedule dependency updates.** The lockfile builds with Angular 20.2.2, while the consumer suite checks newer releases as well. Keep published artifacts compiled by Angular 20 while refreshing compatible patches, run dependency auditing, and review older Karma-related transitive dependencies. A test-runner migration should preserve testing of the actual published artifact in Angular 20 consumers.

12. **Clarify and harden release automation.** `pull_requests.yml` publishes packages, while `publish.yml` validates pull requests; their filenames are misleading. Release workflows currently print expected/actual versions without asserting equality. Review version validation, action pinning, release permissions, and whether publication must explicitly require the consumer matrix. Keep release checks separate from the act of publishing.

13. **Extend compatibility evidence over time.** Current checks cover zoneless standalone applications, service/directive browser behavior, strict consumer type checking, and server service use without browser globals. Add a Zone.js application, an NgModule bootstrap, full SSR/hydration, real multi-tab interaction, and additional browser engines where needed. Add future Angular major versions only after the suite passes; an unbounded peer range would imply unsupported guarantees.

## Validation

- Compatibility work was verified before creating the follow-up branch: library and sample production builds, lint, formatting, and packaged consumers on Angular 20.0.7, 20.3.30, 21.2.22, and 22.1.5.
- The follow-up suite contains 23 browser tests, including regressions for the fixes above, and a server check that constructs and destroys the public services in Node without `window` or `localStorage`.
- The Angular 20.0 consumer uses TypeScript 5.8 and RxJS 6; newer 20/21 consumers use TypeScript 5.9 and RxJS 7; Angular 22 uses TypeScript 6.0 and RxJS 7.
- Local browser checks use headless Chromium via the installed Brave executable. CI uses ChromeHeadless.
- Final checks passed: library and sample production builds, documentation production build, lint, formatting, and all 23 browser tests plus the server check in each of the four consumers (92 passing browser tests). No hosted CI runs or release workflows were triggered during this review.
- The CI matrix currently covers Angular 20, 21, and 22. The local default also runs the Angular 20.0 / RxJS 6 baseline.

### High-priority follow-up validation

- All four high-priority improvements are implemented as separate conventional commits on `fix/general-fixes`.
- The final packaged suite passes 48 browser tests and the server check in Angular 20.0.7, 20.3.30, 21.2.22, and 22.1.5: 192 passing browser tests and four passing server checks. The baseline still uses TypeScript 5.8 and RxJS 6.
- Library, sample, and documentation production builds pass, as do lint, formatting, and conventional commit message validation.
- Concurrency coverage includes independent service instances with controlled stale writes and shared localStorage in a second browser document. Same-draft writes use the documented last-successful-write-wins policy.
- No package was published, and no new branches or worktrees were created. The original checkout's existing uncommitted changes were preserved.
