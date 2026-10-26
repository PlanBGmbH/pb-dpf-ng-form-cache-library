import { isPlatformBrowser } from '@angular/common';
import { inject, Injectable, NgZone, OnDestroy, PLATFORM_ID } from '@angular/core';
import { FORM_CACHE_CONFIG } from '../config/cache-config';
import { DRAFT_PERSISTENT_CONFIG } from '../types/persistence-config';
import { StoredEntityData } from '../types/storage-entity-data';
import { FORM_CACHE_STORAGE } from '../types/storage-service';
import { isDraft, isUserDraftIndex, readDraft, readUserDraftIndex, validateUserDraftIndex } from './storage-validation';

@Injectable()
export class CleanupService implements OnDestroy {
	private readonly storageService = inject(FORM_CACHE_STORAGE);
	private readonly persistentConfig = inject(DRAFT_PERSISTENT_CONFIG);
	private readonly config = inject(FORM_CACHE_CONFIG);
	private readonly zone = inject(NgZone);
	private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
	private cleanupIntervalId?: ReturnType<typeof setInterval>;

	public ngOnDestroy() {
		this.stop();
	}

	/** Starts periodic cleanup in the browser without keeping Angular unstable. */
	public start() {
		this.stop();
		if (!this.isBrowser) return;
		this.zone.runOutsideAngular(() => {
			this.cleanupIntervalId = setInterval(() => this.runCleanup(), this.persistentConfig.cleanupInterval);
		});
	}

	public stop() {
		if (this.cleanupIntervalId === undefined) return;
		clearInterval(this.cleanupIntervalId);
		this.cleanupIntervalId = undefined;
	}

	/** Runs maintenance against the configured adapter, if it supports key enumeration. */
	public runCleanup() {
		this.cleanupExpiredDrafts();
		this.cleanupStaleSessions();
		this.manageStorageQuota();
	}

	private keys(kind: 'draft' | 'index') {
		const prefix = kind === 'draft' ? this.config.draftKeyPrefix : this.config.indexKeyPrefix;
		const otherPrefix = kind === 'draft' ? this.config.indexKeyPrefix : this.config.draftKeyPrefix;
		const isOtherRecord = kind === 'draft' ? isUserDraftIndex : isDraft;
		return (this.storageService.keys?.() ?? []).filter(
			(key) =>
				key.startsWith(prefix) &&
				(!key.startsWith(otherPrefix) ||
					!isOtherRecord(this.storageService, key, this.storageService.getItem<unknown>(key))),
		);
	}

	private cleanupExpiredDrafts() {
		const now = Date.now();
		for (const key of this.keys('draft')) {
			const draft = readDraft(this.storageService, key);
			if (draft && draft.metadata.expiresAt <= now) {
				this.storageService.removeItem(key);
				this.removeDraftKeyFromIndex(draft.metadata.userId, key);
			}
		}
	}

	private cleanupStaleSessions() {
		const now = Date.now();
		for (const key of this.keys('index')) {
			const index = validateUserDraftIndex(this.storageService, key, this.storageService.getItem<unknown>(key));
			if (!index || now - index.lastActivity <= this.persistentConfig.staleThreshold) {
				continue;
			}
			for (const draftKey of index.draftKeys) {
				if (draftKey.startsWith(this.config.draftKeyPrefix)) this.storageService.removeItem(draftKey);
			}
			this.storageService.removeItem(key);
		}
	}

	private manageStorageQuota() {
		let totalSize = 0;
		const drafts: { key: string; draft: StoredEntityData; size: number }[] = [];
		for (const key of this.keys('draft')) {
			const draft = readDraft(this.storageService, key);
			if (!draft) continue;
			const size = this.sizeOf(key, draft);
			totalSize += size;
			drafts.push({ key, draft, size });
		}
		for (const key of this.keys('index')) {
			const index = validateUserDraftIndex(this.storageService, key, this.storageService.getItem<unknown>(key));
			if (index) totalSize += this.sizeOf(key, index);
		}

		drafts.sort((a, b) => a.draft.metadata.lastModified - b.draft.metadata.lastModified);
		for (const { key, draft, size } of drafts) {
			if (totalSize <= this.persistentConfig.storageQuota) break;
			this.storageService.removeItem(key);
			const indexKey = this.storageService.generateIndexKey(draft.metadata.userId);
			const before = readUserDraftIndex(this.storageService, draft.metadata.userId);
			const previousSize = before ? this.sizeOf(indexKey, before) : 0;
			this.removeDraftKeyFromIndex(draft.metadata.userId, key);
			const after = readUserDraftIndex(this.storageService, draft.metadata.userId);
			totalSize -= size + previousSize - (after ? this.sizeOf(indexKey, after) : 0);
		}
	}

	/** Approximate UTF-16 byte usage of JSON storage, including its keys. */
	private sizeOf(key: string, value: unknown) {
		return 2 * (key.length + JSON.stringify(value).length);
	}

	private removeDraftKeyFromIndex(userId: string, draftKey: string) {
		const index = readUserDraftIndex(this.storageService, userId);
		if (!index) return;
		index.draftKeys = index.draftKeys.filter((key) => key !== draftKey);
		this.storageService.setUserDraftIndex(userId, index);
	}
}
