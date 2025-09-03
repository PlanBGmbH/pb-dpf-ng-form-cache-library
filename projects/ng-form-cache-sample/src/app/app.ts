import { Component, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { AutoSaveDirective, FormPersistenceService, StoredEntityData } from 'ng-form-cache';

@Component({
  selector: 'fc-root',
  templateUrl: './app.html',
  styleUrl: './app.css',
  imports: [ReactiveFormsModule, AutoSaveDirective],
})
export class App {
  private readonly formCacheService = inject(FormPersistenceService);
  public readonly form = inject(FormBuilder).group({
    firstName: [''],
    lastName: [''],
    email: [''],
  });

  public constructor() {
    // Set the user ID to some unique identifier from your oAuth user or similar.
    // In this demo I am using this fix ID for now
    this.formCacheService.setUserId('SOME_USER_ID_HERE');
  }

  public notify(draft: StoredEntityData<unknown>) {
    // eslint-disable-next-line no-console
    console.log('Draft loaded from storage:', draft);
  }
}
