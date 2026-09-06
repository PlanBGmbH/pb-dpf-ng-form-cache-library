import { inject, Injectable, OnDestroy, signal } from '@angular/core';
import { FormGroup } from '@angular/forms';
import { attemptWrite, storageFailure } from '../helpers/storage-write';
import { DraftSaveState, StorageWriteResult } from '../types/storage-write-result';
import { FORM_CACHE_CONFIG } from '../config/cache-config';
import { DRAFT_PERSISTENT_CONFIG } from '../types/persistence-config';
import { SESSION_MANAGER_SERVICE } from '../types/service-tokens';
import { StoredEntityData } from '../types/storage-entity-data';
import { FORM_CACHE_STORAGE } from '../types/storage-service';

@Injectable()
export class FormPersistenceService implements OnDestroy {
	private readonly storageService = inject(FORM_CACHE_STORAGE);
	private readonly persistentConfig = inject(DRAFT_PERSISTENT_CONFIG);
	private readonly config = inject(FORM_CACHE_CONFIG);
	private readonly sessionManagerService = inject(SESSION_MANAGER_SERVICE);
	private readonly userId = signal<string>('');
	private readonly states = signal<ReadonlyMap<string, DraftSaveState>>(new Map());
	public readonly saveStates = this.states.asReadonly();

	/** Reading this in a template reacts to save status changes. */
	public getSaveState(entityType: string, entityId: string): DraftSaveState {
		return (
			this.states().get(this.storageService.generateDraftKey(this.userId(), entityType, entityId)) ?? { status: 'idle' }
		);
	}

	private recordState(key: string, state: DraftSaveState): DraftSaveState {
		this.states.update((states) => new Map(states).set(key, state));
		return state;
	}
	private readonly pendingSaves = new Map<string, ReturnType<typeof setTimeout>>();

	public ngOnDestroy() {
		this.cancelPendingSaves();
	}

	public setUserId(id: string | number) {
		const userId = String(id);
		if (userId !== this.userId()) this.cancelPendingSaves();
		this.userId.set(userId);
	}

	/**
	 * Triggers the auto-save process for a form.
	 * @param form The form to save.
	 * @param entityType The type of the entity.
	 * @param entityId The ID of the entity.
	 */
	public autoSave(form: FormGroup, entityType: string, entityId: string): void {
		const userId = this.userId();
		const sessionId = this.sessionManagerService.getSessionId();
		if (!userId || !sessionId || !this.sessionManagerService.isSessionValid(userId)) {
			this.saveDraft(entityType, entityId, form.getRawValue());
			return;
		}
		const key = this.storageService.generateDraftKey(userId, entityType, entityId);
		const formData = form.getRawValue();
		this.cancelPendingSave(key);
		this.recordState(key, { status: 'pending' });
		this.pendingSaves.set(
			key,
			setTimeout(() => {
				this.pendingSaves.delete(key);
				if (this.userId() !== userId || this.sessionManagerService.getSessionId() !== sessionId) {
					this.recordState(key, { status: 'cancelled' });
					return;
				}
				this.saveDraft(entityType, entityId, formData);
			}, this.config.autoSaveDebounceTime),
		);
	}

	/**
	 * Saves a form draft to local storage.
	 * @param entityType The type of the entity.
	 * @param entityId The ID of the entity.
	 * @param formData The data from the form.
	 */
	public saveDraft(entityType: string, entityId: string, formData: unknown): DraftSaveState {
		const key = this.storageService.generateDraftKey(this.userId(), entityType, entityId);
		this.cancelPendingSave(key);
		let phase: 'session' | 'draft' | 'index' = 'session';
		try {
			const sessionId = this.sessionManagerService.getSessionId();
			if (!this.userId() || !sessionId || !this.sessionManagerService.isSessionValid(this.userId())) {
				return this.recordState(key, { status: 'failed', phase, reason: 'invalid-session', draftPersisted: false });
			}
			phase = 'draft';
			const now = Date.now();
			const data: StoredEntityData = {
				metadata: {
					userId: this.userId(),
					sessionId,
					createdAt: this.storageService.getDraft(key)?.metadata.createdAt ?? now,
					lastModified: now,
					expiresAt: now + this.persistentConfig.ttl,
					version: 1,
				},
				formData,
				entityType,
				entityId,
				isDirty: true,
				autoSaveEnabled: true,
			};
			const draftResult = attemptWrite(() => this.storageService.setDraft(key, data));
			if (!draftResult.success)
				return this.recordState(key, { status: 'failed', phase, ...draftResult, draftPersisted: false });
			phase = 'index';
			const indexResult = this.updateUserIndex(this.userId(), key);
			if (!indexResult.success)
				return this.recordState(key, { status: 'failed', phase, ...indexResult, draftPersisted: true });
			return this.recordState(key, { status: 'saved' });
		} catch (error) {
			return this.recordState(key, {
				status: 'failed',
				phase,
				...storageFailure(error),
				draftPersisted: phase === 'index',
			});
		}
	}

	/**
	 * Loads a form draft from local storage.
	 * @param entityType The type of the entity.
	 * @param entityId The ID of the entity.
	 * @returns The stored entity data, or null if not found.
	 */
	public loadDraft<T>(entityType: string, entityId: string) {
		const key = this.storageService.generateDraftKey(this.userId(), entityType, entityId);
		const draft = this.storageService.getDraft<T>(key);
		if (draft && draft.metadata.expiresAt <= Date.now()) {
			this.removeStoredDraft(key);
			this.removeDraftFromIndex(this.userId(), key);
			return undefined;
		}
		return draft;
	}

	/**
	 * Deletes a form draft from local storage.
	 * @param entityType The type of the entity.
	 * @param entityId The ID of the entity.
	 */
	public deleteDraft(entityType: string, entityId: string) {
		const key = this.storageService.generateDraftKey(this.userId(), entityType, entityId);
		this.cancelPendingSave(key);
		this.removeStoredDraft(key);
		this.removeDraftFromIndex(this.userId(), key);
	}

	/**
	 * Checks if a draft exists for a given entity.
	 * @param entityType The type of the entity.
	 * @param entityId The ID of the entity.
	 * @returns True if a draft exists, false otherwise.
	 */
	public hasDraft(entityType: string, entityId: string) {
		return !!this.loadDraft(entityType, entityId);
	}

	/**
	 * Deletes all drafts for the current user.
	 */
	public deleteAllDrafts() {
		this.cancelPendingSaves();
		const userId = this.userId();
		const index = this.storageService.getUserDraftIndex(userId);
		if (!index) return;
		index.draftKeys.forEach((key) => {
			if (key.startsWith(this.config.draftKeyPrefix) && this.storageService.getDraft(key)?.metadata.userId === userId) {
				this.removeStoredDraft(key);
			}
		});
		index.draftKeys = [];
		index.lastActivity = Date.now();
		this.storageService.setUserDraftIndex(userId, index);
	}

	private removeStoredDraft(key: string) {
		if (this.storageService.removeDraft) this.storageService.removeDraft(key);
		else this.storageService.removeItem(key);
	}

	private updateUserIndex(userId: string, draftKey: string): StorageWriteResult {
		const index = this.storageService.getUserDraftIndex(userId);
		if (!index) return { success: false, reason: 'unavailable' };
		if (!index.draftKeys.includes(draftKey)) index.draftKeys.push(draftKey);
		index.lastActivity = Date.now();
		return attemptWrite(() => this.storageService.setUserDraftIndex(userId, index));
	}

	private removeDraftFromIndex(userId: string, draftKey: string) {
		const index = this.storageService.getUserDraftIndex(userId);
		if (!index) return;
		index.draftKeys = index.draftKeys.filter((k) => k !== draftKey);
		index.lastActivity = Date.now();
		this.storageService.setUserDraftIndex(userId, index);
	}
	private cancelPendingSave(key: string) {
		const timer = this.pendingSaves.get(key);
		if (timer !== undefined) {
			clearTimeout(timer);
			this.recordState(key, { status: 'cancelled' });
		}
		this.pendingSaves.delete(key);
	}

	private cancelPendingSaves() {
		for (const key of this.pendingSaves.keys()) this.cancelPendingSave(key);
		this.pendingSaves.clear();
	}
}
