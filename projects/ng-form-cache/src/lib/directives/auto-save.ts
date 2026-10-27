import { Directive, DoCheck, inject, input, OnDestroy, OnInit } from '@angular/core';
import { FormGroup, FormGroupDirective } from '@angular/forms';
import { Subscription } from 'rxjs';
import { FORM_PERSISTENCE_SERVICE } from '../types/service-tokens';
import { StoredEntityData } from '../types/storage-entity-data';

interface Binding {
	form: FormGroup;
	entityType: string;
	entityId: string;
}

/**
 * Auto-saves the host `FormGroup` and restores its draft.
 *
 * The directive rebinds when the bound `FormGroup`, `fcAutoSave` or `fcObjectId` changes:
 * - the subscription to the previous form is disposed, so it can no longer save;
 * - when the identity changes, a pending auto-save of the previous identity is flushed with the
 *   values captured for that identity, the new identity's draft is restored (if `fcAutoLoad`) without
 *   emitting value changes and the form is marked pristine, so values retained from the previous
 *   identity are only saved for the new identity after a user edit;
 * - replacing only the `FormGroup` keeps the identity and does not restore the draft again.
 */
@Directive({
	selector: '[fcAutoSave]',
	standalone: true,
})
export class AutoSaveDirective implements OnInit, DoCheck, OnDestroy {
	public readonly entityType = input.required<string>({ alias: 'fcAutoSave' });
	// eslint-disable-next-line @angular-eslint/no-input-rename
	public readonly entityId = input.required<string>({ alias: 'fcObjectId' });
	// eslint-disable-next-line @angular-eslint/no-input-rename
	public readonly autoLoad = input<boolean>(true, { alias: 'fcAutoLoad' });
	// eslint-disable-next-line @typescript-eslint/no-empty-function
	public readonly notifyFunc = input<(draft: StoredEntityData<unknown>) => void>(() => {}, {
		// eslint-disable-next-line @angular-eslint/no-input-rename
		alias: 'fcNotifyFunc',
	});

	private binding?: Binding;
	private subscription?: Subscription;

	private readonly formGroupDirective = inject(FormGroupDirective);
	private readonly formPersistenceService = inject(FORM_PERSISTENCE_SERVICE);

	public ngOnInit() {
		this.bind();
	}

	public ngDoCheck() {
		this.bind();
	}

	public ngOnDestroy() {
		this.subscription?.unsubscribe();
		this.subscription = undefined;
	}

	private bind() {
		const next: Binding = {
			form: this.formGroupDirective.form,
			entityType: this.entityType(),
			entityId: this.entityId(),
		};
		const previous = this.binding;
		if (
			previous &&
			previous.form === next.form &&
			previous.entityType === next.entityType &&
			previous.entityId === next.entityId
		)
			return;
		this.binding = next;
		this.subscription?.unsubscribe();
		this.subscription = next.form.valueChanges.subscribe(() => {
			if (!next.form.dirty) return;
			this.formPersistenceService.autoSave(next.form, next.entityType, next.entityId);
		});

		const identityChanged = !previous || previous.entityType !== next.entityType || previous.entityId !== next.entityId;
		if (!identityChanged) return;
		if (previous) {
			this.formPersistenceService.flushPendingSave(previous.entityType, previous.entityId);
			next.form.markAsPristine();
		}
		// If auto-load is enabled the latest state will be automatically loaded
		if (this.autoLoad()) this.loadDraft(next);
	}

	private loadDraft({ form, entityType, entityId }: Binding) {
		const draft = this.formPersistenceService.loadDraft(entityType, entityId);
		if (!draft) {
			console.warn(`Form Cache Lib: No draft found for ${entityType} with ID ${entityId}`);
			return;
		}
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		form.patchValue(draft.formData as any, { emitEvent: false });
		if (!this.notifyFunc()) return;
		this.notifyFunc()(draft);
	}
}
