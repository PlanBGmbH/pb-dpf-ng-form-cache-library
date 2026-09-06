import { Component, provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import {
	AutoSaveDirective,
	defaultConfig,
	FORM_PERSISTENCE_SERVICE,
	SESSION_MANAGER_SERVICE,
	provideFormCacheStorage,
} from '@planbgmbh/ng-form-cache';

@Component({
	imports: [ReactiveFormsModule, AutoSaveDirective],
	template: '<form [formGroup]="form" fcAutoSave="profile" fcObjectId="new"><input formControlName="name" /></form>',
})
class TestForm {
	readonly form = new FormGroup({
		name: new FormControl(''),
		disabled: new FormControl({ value: 'included', disabled: true }),
	});
}

describe('Published package in a zoneless Angular consumer', () => {
	beforeEach(() => {
		localStorage.clear();
		TestBed.configureTestingModule({
			providers: [
				provideZonelessChangeDetection(),
				provideFormCacheStorage({
					baseConfig: { ...defaultConfig, autoSaveDebounceTime: 5 },
					perstistenceConfig: {
						ttl: 3600000,
						cleanupInterval: 60000,
						staleThreshold: 1800000,
						storageQuota: 5242880,
					},
				}),
			],
		});
		TestBed.inject(SESSION_MANAGER_SERVICE).startSession('test-user');
		TestBed.inject(FORM_PERSISTENCE_SERVICE).setUserId('test-user');
	});

	afterEach(() => {
		TestBed.resetTestingModule();
		localStorage.clear();
	});

	it('saves, loads, and deletes typed drafts through public providers', () => {
		const service = TestBed.inject(FORM_PERSISTENCE_SERVICE);
		service.saveDraft('profile', 'new', { name: 'Ada' });
		expect(service.loadDraft<{ name: string }>('profile', 'new')?.formData.name).toBe('Ada');
		expect(service.hasDraft('profile', 'new')).toBeTrue();
		service.deleteDraft('profile', 'new');
		expect(service.hasDraft('profile', 'new')).toBeFalse();
	});

	it('restores a draft through the standalone directive', async () => {
		TestBed.inject(FORM_PERSISTENCE_SERVICE).saveDraft('profile', 'new', { name: 'Ada' });
		const fixture = TestBed.createComponent(TestForm);
		await fixture.whenStable();
		expect(fixture.componentInstance.form.controls.name.value).toBe('Ada');
	});

	it('autosaves user edits and includes disabled controls without Zone.js', async () => {
		const fixture = TestBed.createComponent(TestForm);
		await fixture.whenStable();
		const input: HTMLInputElement = fixture.nativeElement.querySelector('input');
		input.value = 'Grace';
		input.dispatchEvent(new Event('input'));
		await new Promise((resolve) => setTimeout(resolve, 40));
		expect(TestBed.inject(FORM_PERSISTENCE_SERVICE).loadDraft('profile', 'new')?.formData).toEqual({
			name: 'Grace',
			disabled: 'included',
		});
	});
});
