import { inject, Injectable, OnDestroy } from '@angular/core';
import { FORM_CACHE_CONFIG } from '../config/cache-config';
import { DRAFT_PERSISTENT_CONFIG } from '../types/persistence-config';
import { StoredEntityData } from '../types/storage-entity-data';
import { FORM_CACHE_STORAGE } from '../types/storage-service';
import { UserDraftIndex } from '../types/user-draft-index';

@Injectable()
export class CleanupService implements OnDestroy {
	private readonly storageService = inject(FORM_CACHE_STORAGE);
	private readonly persistentConfig = inject(DRAFT_PERSISTENT_CONFIG);
	private readonly config = inject(FORM_CACHE_CONFIG);
	private cleanupIntervalId?: number;

	public ngOnDestroy() {
		this.stop();
	}

	/**
	 * Starts the periodic cleanup process.
	 */
	public start() {
		if (this.cleanupIntervalId) {
			this.stop();
		}
		this.cleanupIntervalId = window.setInterval(() => {
			this.runCleanup();
		}, this.persistentConfig.cleanupInterval);
	}

	/**
	 * Stops the periodic cleanup process.
	 */
	public stop() {
		if (!this.cleanupIntervalId) return;
		clearInterval(this.cleanupIntervalId);
		this.cleanupIntervalId = undefined;
	}

	/**
	 * Runs all cleanup tasks.
	 */
	public runCleanup() {
		this.cleanupExpiredDrafts();
		this.cleanupStaleSessions();
		this.manageStorageQuota();
	}

	/**
	 * Removes drafts that have exceeded their TTL.
	 */
	private cleanupExpiredDrafts() {
		const now = Date.now();
		// This is a simplified approach. A real implementation would need a way to get all user indexes.
		// For now, we assume we can get all keys and filter them.
		for (let i = 0; i < localStorage.length; i++) {
			const key = localStorage.key(i);
			if (!key || !key.startsWith(this.config.draftKeyPrefix)) continue;
			const draft = this.storageService.getDraft(key);
			if (draft && draft.metadata && draft.metadata.expiresAt < now) {
				this.storageService.removeItem(key);
				// Also remove from the corresponding UserDraftIndex
				this.removeDraftKeyFromIndex(draft.metadata.userId, key);
			}
		}
	}

	/**
	 * Removes drafts from stale sessions.
	 */
	private cleanupStaleSessions() {
		const now = Date.now();
		const staleThreshold = this.persistentConfig.staleThreshold;
		// This is a simplified approach. A real implementation would need a way to get all user indexes.
		for (let i = 0; i < localStorage.length; i++) {
			const key = localStorage.key(i);
			if (!key || !key.startsWith(this.config.indexKeyPrefix)) continue;
			const index = this.storageService.getItem<UserDraftIndex>(key);
			if (!index || now - index.lastActivity <= staleThreshold) continue;
			index.draftKeys.forEach((draftKey) => this.storageService.removeItem(draftKey));
			this.storageService.removeItem(key);
		}
	}

	/**
	 * Manages storage quota by removing the oldest drafts if the quota is exceeded.
	 */
	private manageStorageQuota() {
		const storageQuota = this.persistentConfig.storageQuota;
		let totalSize = 0;
		const drafts: { key: string; draft: StoredEntityData }[] = [];

		for (let i = 0; i < localStorage.length; i++) {
			const key = localStorage.key(i);
			if (!key) continue;
			const item = localStorage.getItem(key);
			if (!item) continue;
			totalSize += item.length;
			if (!key.startsWith(this.config.draftKeyPrefix)) continue;
			const draft = this.storageService.getDraft(key);
			if (!draft) continue;
			drafts.push({ key, draft });
		}

		if (totalSize <= storageQuota) return;
		drafts.sort((a, b) => a.draft.metadata.lastModified - b.draft.metadata.lastModified);
		const draftsToRemove = Math.ceil(drafts.length * 0.2); // Remove oldest 20%
		for (let i = 0; i < draftsToRemove; i++) {
			const draftToRemove = drafts[i];
			this.storageService.removeItem(draftToRemove.key);
			this.removeDraftKeyFromIndex(draftToRemove.draft.metadata.userId, draftToRemove.key);
		}
	}

	private removeDraftKeyFromIndex(userId: string, draftKey: string) {
		const index = this.storageService.getUserDraftIndex(userId);
		if (!index) return;
		index.draftKeys = index.draftKeys.filter((k) => k !== draftKey);
		this.storageService.setUserDraftIndex(userId, index);
	}
}
