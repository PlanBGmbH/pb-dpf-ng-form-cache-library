import { inject, Injectable, OnDestroy, signal } from '@angular/core';
import { FormGroup } from '@angular/forms';
import { Subject } from 'rxjs';
import { debounceTime, takeUntil } from 'rxjs/operators';
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
  private readonly autoSaveSubject = new Subject<{
    form: FormGroup;
    entityType: string;
    entityId: string;
  }>();
  private readonly destroy$ = new Subject<void>();

  public constructor() {
    this.autoSaveSubject
      .pipe(debounceTime(this.config.autoSaveDebounceTime), takeUntil(this.destroy$))
      .subscribe(({ form, entityType, entityId }) => {
        this.saveDraft(entityType, entityId, form.getRawValue());
      });
  }

  public ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  public setUserId(id: string | number) {
    this.userId.set(String(id));
  }

  /**
   * Triggers the auto-save process for a form.
   * @param form The form to save.
   * @param entityType The type of the entity.
   * @param entityId The ID of the entity.
   */
  public autoSave(form: FormGroup, entityType: string, entityId: string): void {
    this.autoSaveSubject.next({ form, entityType, entityId });
  }

  /**
   * Saves a form draft to local storage.
   * @param entityType The type of the entity.
   * @param entityId The ID of the entity.
   * @param formData The data from the form.
   */
  public saveDraft(entityType: string, entityId: string, formData: unknown) {
    const sessionId = this.sessionManagerService.getSessionId();
    if (!sessionId) return;

    const key = this.storageService.generateDraftKey(this.userId(), entityType, entityId);
    const now = Date.now();
    const ttl = this.persistentConfig.ttl;

    const data: StoredEntityData = {
      metadata: {
        userId: this.userId(),
        sessionId,
        createdAt: this.storageService.getDraft(key)?.metadata.createdAt ?? now,
        lastModified: now,
        expiresAt: now + ttl,
        version: 1,
      },
      formData,
      entityType,
      entityId,
      isDirty: true,
      autoSaveEnabled: true,
    };

    this.storageService.setDraft(key, data);
    this.updateUserIndex(this.userId(), key);
  }

  /**
   * Loads a form draft from local storage.
   * @param entityType The type of the entity.
   * @param entityId The ID of the entity.
   * @returns The stored entity data, or null if not found.
   */
  public loadDraft<T>(entityType: string, entityId: string) {
    const key = this.storageService.generateDraftKey(this.userId(), entityType, entityId);
    return this.storageService.getDraft<T>(key);
  }

  /**
   * Deletes a form draft from local storage.
   * @param entityType The type of the entity.
   * @param entityId The ID of the entity.
   */
  public deleteDraft(entityType: string, entityId: string) {
    const key = this.storageService.generateDraftKey(this.userId(), entityType, entityId);
    this.storageService.removeItem(key);
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
    const userId = this.userId();
    const index = this.storageService.getUserDraftIndex(userId);
    if (!index) return;
    index.draftKeys.forEach((key) => {
      this.storageService.removeItem(key);
    });
    index.draftKeys = [];
    index.lastActivity = Date.now();
    this.storageService.setUserDraftIndex(userId, index);
  }

  private updateUserIndex(userId: string, draftKey: string) {
    const index = this.storageService.getUserDraftIndex(userId);
    if (index && !index.draftKeys.includes(draftKey)) {
      index.draftKeys.push(draftKey);
      index.lastActivity = Date.now();
      this.storageService.setUserDraftIndex(userId, index);
    }
  }

  private removeDraftFromIndex(userId: string, draftKey: string) {
    const index = this.storageService.getUserDraftIndex(userId);
    if (!index) return;
    index.draftKeys = index.draftKeys.filter((k) => k !== draftKey);
    index.lastActivity = Date.now();
    this.storageService.setUserDraftIndex(userId, index);
  }
}
