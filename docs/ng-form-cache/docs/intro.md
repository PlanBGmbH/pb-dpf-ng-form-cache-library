---
sidebar_position: 1
---

# Introduction

You want to get start easily with the package? You can install and use it in under 5 minutes!

## Getting started

1. Install the package via npm inside your Angular application:

```bash
npm i @planbgmbh/ng-form-cache
```

2. Import the provides to the `app.config.ts`.

```typescript
import { defaultConfig, provideFormCacheStorage } from '@planbgmbh/ng-form-cache';

export const appConfig: ApplicationConfig = {
  providers: [
    // ...other providers here
    provideFormCacheStorage({
      baseConfig: defaultConfig,
      perstistenceConfig: {
        ttl: 3600 * 1000, // 1 hour in milliseconds
        cleanupInterval: 60000, // 1 minute in milliseconds
        staleThreshold: 1800000, // 30 minutes in milliseconds
        storageQuota: 5242880, // 5MB in bytes
      },
    }),
  ],
};
```

3. Add the directive to your reactive form:

```html
<!-- app.html -->
<main>
  <h1>NgFormCache Sample Application</h1>
  <form
    [formGroup]="form"
    fcAutoSave="user"
    fcObjectId="new"
  >
    <input formControlName="firstName" placeholder="First Name" />
    <input formControlName="lastName" placeholder="Last Name" />
    <input formControlName="email" placeholder="Email" />
  </form>
</main>
```

4. Import the `AutoSaveDirective` to the component

```typescript
// app.ts
@Component({
  selector: 'fc-root',
  templateUrl: './app.html',
  styleUrl: './app.css',
  imports: [ReactiveFormsModule, AutoSaveDirective],
})
```

5.That's it. (Yes, really!)

**Conclusion**

The form now automatically restores the data of a form as soon as you reload the page and/or re-visit the form.
But that's, of course, not all. If you want to e.g. delete the draft/cache as soon as you have submitted the form you probably want to delete the stored data. As well as you may want a bit more control, e.g. notify the user if data was restored and/or you don't want to automatically restore the data and handle it manually. For all these things take a look at the futher documentation.
