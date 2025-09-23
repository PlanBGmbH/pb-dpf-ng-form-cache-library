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
   The rest of the usage remains identical to the standalone tutorial: set the user id and decorate the form with `fcAutoSave`.

## Notes

- The directive requires Angular 20+ to be imported into an `NgModule`.
- If you are locked to Angular < 20, the library cannot be used because it relies on standalone directives.
- When you migrate to full standalone bootstrap you can keep the same provider configuration—just move it into `bootstrapApplication`.
