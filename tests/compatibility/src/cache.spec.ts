import { Component, provideZonelessChangeDetection, signal } from '@angular/core';
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

@Component({
	imports: [ReactiveFormsModule, AutoSaveDirective],
	template:
		'<form [formGroup]="form()" [fcAutoSave]="type()" [fcObjectId]="id()"><input formControlName="name" /></form>',
})
class DynamicForm {
	readonly form = signal(new FormGroup({ name: new FormControl('') }));
	readonly type = signal('profile');
	readonly id = signal('a');
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

	it('restores without emitting form changes or scheduling another save', async () => {
		const service = TestBed.inject(FORM_PERSISTENCE_SERVICE);
		service.saveDraft('profile', 'new', { name: 'Ada' });
		const save = spyOn(service, 'autoSave');
		const fixture = TestBed.createComponent(TestForm);
		fixture.componentInstance.form.markAsDirty();
		const changed = jasmine.createSpy('valueChanges');
		fixture.componentInstance.form.valueChanges.subscribe(changed);
		await fixture.whenStable();
		expect(changed).not.toHaveBeenCalled();
		expect(save).not.toHaveBeenCalled();
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

	describe('with dynamic forms and identities', () => {
		const wait = () => new Promise((resolve) => setTimeout(resolve, 40));
		const type = async (fixture: { nativeElement: HTMLElement }, value: string) => {
			const input = fixture.nativeElement.querySelector('input') as HTMLInputElement;
			input.value = value;
			input.dispatchEvent(new Event('input'));
		};

		it('rebinds to a replaced FormGroup and ignores the previous one', async () => {
			const service = TestBed.inject(FORM_PERSISTENCE_SERVICE);
			const fixture = TestBed.createComponent(DynamicForm);
			await fixture.whenStable();
			const oldForm = fixture.componentInstance.form();
			const newForm = new FormGroup({ name: new FormControl('') });
			fixture.componentInstance.form.set(newForm);
			await fixture.whenStable();
			await type(fixture, 'New');
			expect(newForm.controls.name.value).toBe('New');
			await wait();
			expect(service.loadDraft('profile', 'a')?.formData).toEqual({ name: 'New' });

			service.deleteDraft('profile', 'a');
			const save = spyOn(service, 'autoSave').and.callThrough();
			oldForm.markAsDirty();
			oldForm.controls.name.setValue('Old');
			expect(save).not.toHaveBeenCalled();
			newForm.controls.name.setValue('Newer');
			expect(save).toHaveBeenCalledOnceWith(newForm, 'profile', 'a');
		});

		it('restores the new identity and never writes retained values to it', async () => {
			const service = TestBed.inject(FORM_PERSISTENCE_SERVICE);
			service.saveDraft('profile', 'a', { name: 'Ada' });
			service.saveDraft('profile', 'b', { name: 'Bob' });
			const fixture = TestBed.createComponent(DynamicForm);
			await fixture.whenStable();
			const form = fixture.componentInstance.form();
			expect(form.controls.name.value).toBe('Ada');

			await type(fixture, 'Ada edited');
			const changed = jasmine.createSpy('valueChanges');
			form.valueChanges.subscribe(changed);
			fixture.componentInstance.id.set('b');
			await fixture.whenStable();
			expect(form.controls.name.value).toBe('Bob');
			expect(changed).not.toHaveBeenCalled();
			expect(form.dirty).toBeFalse();
			// The pending edit of the previous identity is flushed to its own key.
			expect(service.loadDraft('profile', 'a')?.formData).toEqual({ name: 'Ada edited' });
			expect(service.loadDraft('profile', 'b')?.formData).toEqual({ name: 'Bob' });

			await type(fixture, 'Bob edited');
			await wait();
			expect(service.loadDraft('profile', 'a')?.formData).toEqual({ name: 'Ada edited' });
			expect(service.loadDraft('profile', 'b')?.formData).toEqual({ name: 'Bob edited' });
		});

		it('does not save values retained from the previous identity without a user edit', async () => {
			const service = TestBed.inject(FORM_PERSISTENCE_SERVICE);
			service.saveDraft('profile', 'a', { name: 'Ada' });
			const fixture = TestBed.createComponent(DynamicForm);
			await fixture.whenStable();
			await type(fixture, 'Ada edited');
			fixture.componentInstance.type.set('order');
			await fixture.whenStable();
			fixture.componentInstance.form().controls.name.setValue('Programmatic');
			await wait();
			expect(service.hasDraft('order', 'a')).toBeFalse();
			expect(service.loadDraft('profile', 'a')?.formData).toEqual({ name: 'Ada edited' });
		});

		it('stops saving after the directive is destroyed', async () => {
			const service = TestBed.inject(FORM_PERSISTENCE_SERVICE);
			const fixture = TestBed.createComponent(DynamicForm);
			await fixture.whenStable();
			const form = fixture.componentInstance.form();
			fixture.destroy();
			const save = spyOn(service, 'autoSave');
			form.markAsDirty();
			form.controls.name.setValue('After');
			expect(save).not.toHaveBeenCalled();
		});
	});
});
