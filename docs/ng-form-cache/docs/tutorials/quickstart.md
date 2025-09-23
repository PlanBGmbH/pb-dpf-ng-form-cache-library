---
sidebar_position: 1
---

# Build Your First Autosaving Form

This tutorial walks you through wiring `@planbgmbh/ng-form-cache` into a fresh Angular standalone app. You will install the library, configure the providers, attach the autosave directive, and see the form state persist across reloads in just a few minutes.

## Prerequisites

- Angular 20 or newer with standalone APIs enabled
- Reactive Forms (`@angular/forms`)
- Access to edit `app.config.ts`, a component class, and its template

> The examples below use TypeScript and the standalone bootstrap pattern available in Angular 20.

## 1. Install the library

```bash
npm install @planbgmbh/ng-form-cache
```

## 2. Register the form cache providers

Open `app.config.ts` (or the equivalent bootstrap configuration) and add the `provideFormCacheStorage` factory. The helper wires up all required services (cleanup, session, persistence, and storage) in one place.

```typescript title="app.config.ts"
import { ApplicationConfig } from '@angular/core';
import { defaultConfig, provideFormCacheStorage } from '@planbgmbh/ng-form-cache';

export const appConfig: ApplicationConfig = {
  providers: [
    // other providers
    provideFormCacheStorage({
      baseConfig: defaultConfig,
      perstistenceConfig: {
        ttl: 60 * 60 * 1000,      // keep drafts for 1 hour
        cleanupInterval: 60_000,  // run cleanup every minute
        staleThreshold: 30 * 60 * 1000,
        storageQuota: 5 * 1024 * 1024,
      },
    }),
  ],
};
```

## 3. Build a reactive form component

Inject the `FormPersistenceService` so you can identify the active user. In this simple example we set a mock identifier during construction.

```typescript title="app/app.ts"
import { Component, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { AutoSaveDirective, FormPersistenceService } from '@planbgmbh/ng-form-cache';

@Component({
  selector: 'fc-root',
  templateUrl: './app.html',
  styleUrl: './app.css',
  imports: [ReactiveFormsModule, AutoSaveDirective],
})
export class AppComponent {
  private readonly formCache = inject(FormPersistenceService);
  private readonly fb = inject(FormBuilder);

  readonly form = this.fb.group({
    firstName: [''],
    lastName: [''],
    email: [''],
  });

  constructor() {
    this.formCache.setUserId('demo-user');
  }
}
```

## 4. Attach the autosave directive

Decorate the `<form>` with `fcAutoSave` and provide a stable identifier. The directive listens to form value changes, debounces them, and persists the state automatically.

```html title="app/app.html"
<form
  [formGroup]="form"
  fcAutoSave="user"
  fcObjectId="new"
  [fcAutoLoad]="true"
>
  <input formControlName="firstName" placeholder="First name" />
  <input formControlName="lastName" placeholder="Last name" />
  <input formControlName="email" placeholder="Email" />
</form>
```

## 5. Verify the experience

1. Start the dev server and open the form in your browser.
2. Enter values into the inputs. After the debounce window (default 1 second) the draft is saved to `localStorage`.
3. Refresh the page — the last values appear automatically thanks to `[fcAutoLoad]="true"`.
4. Inspect the browser console to confirm autosave logs (expected warning when no draft exists yet).

You now have a working autosaving form. Continue with the how-to guides to delete drafts after submission, surface restore notifications, or swap out the storage backend.
