import { Component, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import {
	AutoSaveDirective,
	CLEANUP_SERVICE,
	FORM_PERSISTENCE_SERVICE,
	SESSION_MANAGER_SERVICE,
	StoredEntityData,
} from 'ng-form-cache';

@Component({
	selector: 'fc-root',
	templateUrl: './app.html',
	styleUrl: './app.css',
	imports: [ReactiveFormsModule, AutoSaveDirective],
})
export class App {
	private readonly formCacheService = inject(FORM_PERSISTENCE_SERVICE);
	public readonly form = inject(FormBuilder).group({
		firstName: [''],
		lastName: [''],
		email: [''],
	});

	public constructor() {
		// Set the user ID to some unique identifier from your oAuth user or similar.
		// In this demo I am using this fix ID for now
		const userId = 'SOME_USER_ID_HERE';
		const session = inject(SESSION_MANAGER_SERVICE);
		if (!session.isSessionValid(userId)) session.startSession(userId);
		this.formCacheService.setUserId(userId);
		inject(CLEANUP_SERVICE).start();
	}

	public notify(draft: StoredEntityData<unknown>) {
		// eslint-disable-next-line no-console
		console.log('Draft loaded from storage:', draft);
	}
}
