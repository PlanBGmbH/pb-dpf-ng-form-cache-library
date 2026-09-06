import { Component, provideZonelessChangeDetection } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { bootstrapApplication } from '@angular/platform-browser';
import { AutoSaveDirective, defaultConfig, provideFormCacheStorage } from '@planbgmbh/ng-form-cache';

@Component({
	selector: 'fc-consumer',
	imports: [ReactiveFormsModule, AutoSaveDirective],
	template: '<form [formGroup]="form" fcAutoSave="profile" fcObjectId="new"><input formControlName="name" /></form>',
})
class Consumer {
	readonly form = new FormGroup({ name: new FormControl('') });
}

bootstrapApplication(Consumer, {
	providers: [
		provideZonelessChangeDetection(),
		provideFormCacheStorage({
			baseConfig: defaultConfig,
			perstistenceConfig: {
				ttl: 3600000,
				cleanupInterval: 60000,
				staleThreshold: 1800000,
				storageQuota: 5242880,
			},
		}),
	],
}).catch(console.error);
