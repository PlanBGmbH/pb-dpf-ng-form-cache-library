---
sidebar_position: 1
---

# Install in a Standalone Angular Application

Follow these steps to add `@planbgmbh/ng-form-cache` to an Angular app that uses the standalone bootstrap API.

## Steps

1. **Install the dependency**
   ```bash
   npm install @planbgmbh/ng-form-cache
   ```
2. **Provide the services during bootstrap**
   Add the bundled provider factory to your `ApplicationConfig` (or a feature-level config). It registers the cleanup scheduler, session manager, persistence service, default storage, and configuration tokens.
   ```typescript title="app.config.ts"
   import { ApplicationConfig } from '@angular/core';
   import { defaultConfig, provideFormCacheStorage } from '@planbgmbh/ng-form-cache';

   export const appConfig: ApplicationConfig = {
     providers: [
       provideFormCacheStorage({
         baseConfig: defaultConfig,
         perstistenceConfig: {
           ttl: 60 * 60 * 1000,
           cleanupInterval: 60_000,
           staleThreshold: 30 * 60 * 1000,
           storageQuota: 5 * 1024 * 1024,
         },
       }),
     ],
   };
   ```
3. **Import the directive where you need autosave**
   ```typescript title="feature/feature.component.ts"
   import { Component, inject } from '@angular/core';
   import { ReactiveFormsModule } from '@angular/forms';
   import { AutoSaveDirective, FormPersistenceService } from '@planbgmbh/ng-form-cache';

   @Component({
     selector: 'feature-form',
     templateUrl: './feature.component.html',
     imports: [ReactiveFormsModule, AutoSaveDirective],
   })
   export class FeatureComponent {
     private readonly formPersistence = inject(FormPersistenceService);

     constructor() {
       this.formPersistence.setUserId('current-user-id');
     }
   }
   ```
4. **Decorate your `<form>` element**
   ```html
   <form
     [formGroup]="form"
     fcAutoSave="order"
     fcObjectId="draft"
   >
     <!-- controls -->
   </form>
   ```

## Verification checklist

- Reload the page and confirm the form repopulates.
- Inspect `localStorage` to see keys with the configured `draftKeyPrefix` and `indexKeyPrefix` values.
- Confirm the app sets a session id entry named after `sessionIdKey`.

## Customizing later

- Swap the storage backend by providing your own implementation for `FORM_CACHE_STORAGE`.
- Override the default cache settings by passing a custom `baseConfig` instead of `defaultConfig`.
- Tune persistence behavior (TTL, cleanup interval, etc.) by adjusting the `perstistenceConfig` values.
