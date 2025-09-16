---
sidebar_position: 1
---

# Standalone Application

For standalone applications we made a set of providers available which can be directly imported on application creation or at any point in the app where you can initialize modules, components or routes.

```typescript
import { provideFormCacheStorage } from '@planbgmbh/ng-form-cache';
```

This automatically provides the cleanup service, session manager, form persistence service, storage, cache config and draft persistent config.

You are not required to use this default providings. Everything can be overriding using our injection tokens.

We also provide an export member for default the default form cache config.

To use the library, after providing the required data, you can simply import the `AutoSaveDirective` into the imports section of your component where you want to use it.
