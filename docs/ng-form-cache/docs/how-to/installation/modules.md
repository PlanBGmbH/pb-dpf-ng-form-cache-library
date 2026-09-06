---
sidebar_position: 2
---

# Use ng-form-cache in an NgModule-based Application

Even though the library ships providers and directives as standalone artifacts, you can still integrate it into an app that bootstraps an `NgModule`. Follow the steps below.

## Steps

1. **Install the dependency**

   ```bash
   npm install @planbgmbh/ng-form-cache
   ```

2. **Register the providers in your root module**
   Spread the factory result into the `providers` array. The function returns a plain `Provider[]`, so it works in any Angular module.

   ```typescript title="app.module.ts"
   import { NgModule } from '@angular/core';
   import { BrowserModule } from '@angular/platform-browser';
   import { AppComponent } from './app.component';
   import { defaultConfig, provideFormCacheStorage } from '@planbgmbh/ng-form-cache';

   @NgModule({
     declarations: [AppComponent],
     imports: [BrowserModule],
     providers: [
       ...provideFormCacheStorage({
         baseConfig: defaultConfig,
         perstistenceConfig: {
           ttl: 60 * 60 * 1000,
           cleanupInterval: 60_000,
           staleThreshold: 30 * 60 * 1000,
           storageQuota: 5 * 1024 * 1024,
         },
       }),
     ],
     bootstrap: [AppComponent],
   })
   export class AppModule {}
   ```

3. **Import the standalone directive**
   Angular 20 (the minimum supported version) lets you list standalone directives in the `imports` array of any `NgModule`.

   ```typescript title="app.module.ts"
   import { AutoSaveDirective } from '@planbgmbh/ng-form-cache';

   @NgModule({
     // ...
     imports: [BrowserModule, AutoSaveDirective],
   })
   export class AppModule {}
   ```

4. **Inject `FormPersistenceService` where needed**
   The rest of the usage remains identical to the standalone tutorial: start or resume a session, set the same user id, start cleanup once during application startup, and decorate the form with `fcAutoSave`.

## Notes

- This package supports Angular 20, 21, and 22. Angular versions below 20 are outside its supported peer range.
- When you migrate to full standalone bootstrap you can keep the same provider configuration—just move it into `bootstrapApplication`.
