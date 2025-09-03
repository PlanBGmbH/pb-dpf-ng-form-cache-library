import { Directive, inject, input, OnDestroy, OnInit } from '@angular/core';
import { FormGroupDirective } from '@angular/forms';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { FORM_PERSISTENCE_SERVICE } from '../types/service-tokens';
import { StoredEntityData } from '../types/storage-entity-data';

@Directive({
	selector: '[fcAutoSave]',
	standalone: true,
})
export class AutoSaveDirective implements OnInit, OnDestroy {
	public readonly entityType = input.required<string>({ alias: 'fcAutoSave' });
	public readonly entityId = input.required<string>({ alias: 'fcObjectId' });
	public readonly autoLoad = input<boolean>(true, { alias: 'fcAutoLoad' });
  public readonly notifyFunc = input<(draft: StoredEntityData<any>) => void>(() => {}, { alias: 'fcNotifyFunc' });

	private readonly destroy$ = new Subject<void>();

	private readonly formGroupDirective = inject(FormGroupDirective);
	private readonly formPersistenceService = inject(FORM_PERSISTENCE_SERVICE);

	public ngOnInit() {
		this.formGroupDirective.form.valueChanges.pipe(takeUntil(this.destroy$)).subscribe(() => {
			if (!this.formGroupDirective.form.dirty) return;
			this.formPersistenceService.autoSave(
				this.formGroupDirective.form,
				this.entityType(),
				this.entityId(),
			);
		});

		// If auto-load is enabled the latest state will be automatically loaded
		if (this.autoLoad()) this.loadDraft();
	}

	public ngOnDestroy() {
		this.destroy$.next();
		this.destroy$.complete();
	}

	private loadDraft() {
		const draft = this.formPersistenceService.loadDraft(this.entityType(), this.entityId());
		if (!draft) {
			console.warn(`Form Cache Lib: No draft found for ${this.entityType()} with ID ${this.entityId()}`);
			return;
		}
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		this.formGroupDirective.form.patchValue(draft.formData as any);
    if (!this.notifyFunc()) return;
		this.notifyFunc()(draft);
	}
}
