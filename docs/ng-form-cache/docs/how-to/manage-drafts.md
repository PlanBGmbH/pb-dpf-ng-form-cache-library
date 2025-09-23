---
sidebar_position: 2
---

# Manage Drafts Programmatically

Use `FormPersistenceService` to control when drafts are loaded, deleted, or inspected. This guide shows common recipes you can drop into your reactive forms.

## Load a draft on demand

If you prefer to decide when form data is restored (instead of setting `[fcAutoLoad]="true"`), disable auto-load and call `loadDraft` yourself.

```html title="order-form.component.html"
<form
  [formGroup]="form"
  fcAutoSave="order"
  fcObjectId="draft"
  [fcAutoLoad]="false"
>
  <!-- controls -->
</form>
```

```typescript title="order-form.component.ts"
import { Component, inject, OnInit } from '@angular/core';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { AutoSaveDirective, FormPersistenceService } from '@planbgmbh/ng-form-cache';

@Component({
  selector: 'order-form',
  templateUrl: './order-form.component.html',
  imports: [ReactiveFormsModule, AutoSaveDirective],
})
export class OrderFormComponent implements OnInit {
  private readonly formPersistence = inject(FormPersistenceService);
  private readonly fb = inject(FormBuilder);

  readonly form = this.fb.group({
    title: [''],
    amount: [0],
  });

  ngOnInit(): void {
    const draft = this.formPersistence.loadDraft<{ title: string; amount: number }>('order', 'draft');
    if (draft) {
      this.form.patchValue(draft.formData);
    }
  }
}
```

## Notify the user when a draft is restored

Pass a callback through `[fcNotifyFunc]` to integrate banners or snackbars.

```html
<form
  [formGroup]="form"
  fcAutoSave="profile"
  fcObjectId="current"
  [fcNotifyFunc]="handleDraftRestored"
>
  <!-- controls -->
</form>
```

```typescript
handleDraftRestored(draft: StoredEntityData<unknown>) {
  this.snackBar.open('Draft from ' + new Date(draft.metadata.lastModified).toLocaleString(), 'Dismiss');
}
```

## Delete a draft after submission

Call `deleteDraft` once the server reports success to avoid resurrecting outdated data.

```typescript
onSubmit(): void {
  if (this.form.invalid) return;
  this.saveOrder(this.form.value).subscribe(() => {
    this.formPersistence.deleteDraft('order', this.currentOrderId);
  });
}
```

## Clear every draft for the signed-in user

Useful for logout flows or when the privacy policy requires a hard reset.

```typescript
import { inject } from '@angular/core';
import { FormPersistenceService } from '@planbgmbh/ng-form-cache';

const formPersistence = inject(FormPersistenceService);

function onLogout() {
  formPersistence.deleteAllDrafts();
}
```

## Check whether a draft exists

Run guards before navigating away or enabling "continue where you left off" buttons.

```typescript
const hasDraft = this.formPersistence.hasDraft('profile', this.userId);
if (hasDraft) {
  // prompt the user to resume
}
```

Combine these snippets to create the exact draft lifecycle your product needs.
