import { isPlatformBrowser } from '@angular/common';
import { inject, Injectable, NgZone, OnDestroy, PLATFORM_ID, signal } from '@angular/core';
import { FORM_CACHE_CONFIG } from '../config/cache-config';
import { attemptWrite } from '../helpers/storage-write';
import { DRAFT_PERSISTENT_CONFIG } from '../types/persistence-config';
import { SESSION_MANAGER_SERVICE } from '../types/service-tokens';
import { StoredEntityData } from '../types/storage-entity-data';
import { FORM_CACHE_STORAGE } from '../types/storage-service';
import { CleanupReport } from '../types/storage-write-result';
import { UserDraftIndex } from '../types/user-draft-index';
import { validDraft, validIndex } from './storage-validation';

@Injectable()
export class CleanupService implements OnDestroy {
	private readonly storageService = inject(FORM_CACHE_STORAGE);
	private readonly persistentConfig = inject(DRAFT_PERSISTENT_CONFIG);
	private readonly config = inject(FORM_CACHE_CONFIG);
	private readonly sessionManagerService = inject(SESSION_MANAGER_SERVICE);
	private readonly zone = inject(NgZone);
	private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
	private cleanupIntervalId?: ReturnType<typeof setInterval>;
	private report: CleanupReport = { expired: [], stale: [], evicted: [], failures: [] };
	private readonly lastReportState = signal<CleanupReport | undefined>(undefined);
	/** The report of the most recent cleanup run, including periodic runs. */
	public readonly lastReport = this.lastReportState.asReadonly();

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
	public runCleanup(): CleanupReport {
		this.report = { expired: [], stale: [], evicted: [], failures: [] };
		this.cleanupExpiredDrafts();
		this.cleanupStaleSessions();
		this.manageStorageQuota();
		this.lastReportState.set(this.report);
		return this.report;
	}

	private keys(prefix: string) {
		return (this.storageService.keys?.() ?? []).filter((key) => key.startsWith(prefix));
	}

	private cleanupExpiredDrafts() {
		const now = Date.now();
		for (const key of this.keys(this.config.draftKeyPrefix)) {
			const draft = validDraft(this.storageService.getDraft(key));
			if (draft && draft.metadata.expiresAt <= now) {
				this.storageService.removeItem(key);
				this.report.expired.push(key);
				this.removeDraftKeyFromIndex(draft.metadata.userId, key);
			}
		}
	}

	private cleanupStaleSessions() {
		const now = Date.now();
		for (const key of this.keys(this.config.indexKeyPrefix)) {
			const userId = key.slice(this.config.indexKeyPrefix.length);
			const index = validIndex(this.storageService.getUserDraftIndex(userId), userId);
			if (!index || now - index.lastActivity <= this.persistentConfig.staleThreshold) {
				continue;
			}
			for (const draftKey of index.draftKeys) {
				if (
					draftKey.startsWith(this.config.draftKeyPrefix) &&
					validDraft(this.storageService.getDraft(draftKey))?.metadata.userId === index.userId
				) {
					this.storageService.removeItem(draftKey);
					this.report.stale.push(draftKey);
				}
			}
			if (
				index.sessionId &&
				index.sessionId === this.sessionManagerService.getSessionId() &&
				this.sessionManagerService.isSessionValid(index.userId)
			) {
				index.draftKeys = [];
				this.writeIndex(index.userId, index);
			} else {
				this.storageService.removeItem(key);
			}
		}
	}

	private manageStorageQuota() {
		let totalSize = 0;
		const drafts: { key: string; draft: StoredEntityData; size: number }[] = [];
		for (const key of this.keys(this.config.draftKeyPrefix)) {
			const draft = validDraft(this.storageService.getDraft(key));
			if (!draft) continue;
			const size = this.sizeOf(key, draft);
			totalSize += size;
			drafts.push({ key, draft, size });
		}
		for (const key of this.keys(this.config.indexKeyPrefix)) {
			const userId = key.slice(this.config.indexKeyPrefix.length);
			const index = validIndex(this.storageService.getUserDraftIndex(userId), userId);
			if (index) totalSize += this.sizeOf(key, index);
		}

		drafts.sort((a, b) => a.draft.metadata.lastModified - b.draft.metadata.lastModified);
		for (const { key, draft, size } of drafts) {
			if (totalSize <= this.persistentConfig.storageQuota) break;
			this.storageService.removeItem(key);
			this.report.evicted.push(key);
			const indexKey = this.storageService.generateIndexKey(draft.metadata.userId);
			const before = validIndex(this.storageService.getUserDraftIndex(draft.metadata.userId), draft.metadata.userId);
			const previousSize = before ? this.sizeOf(indexKey, before) : 0;
			this.removeDraftKeyFromIndex(draft.metadata.userId, key);
			const after = validIndex(this.storageService.getUserDraftIndex(draft.metadata.userId), draft.metadata.userId);
			totalSize -= size + previousSize - (after ? this.sizeOf(indexKey, after) : 0);
		}
	}

	/** Approximate UTF-16 byte usage of JSON storage, including its keys. */
	private sizeOf(key: string, value: unknown) {
		return 2 * (key.length + JSON.stringify(value).length);
	}

	private removeDraftKeyFromIndex(userId: string, draftKey: string) {
		const index = validIndex(this.storageService.getUserDraftIndex(userId), userId);
		if (!index) return;
		index.draftKeys = index.draftKeys.filter((key) => key !== draftKey);
		this.writeIndex(userId, index);
	}

	private writeIndex(userId: string, index: UserDraftIndex) {
		const result = attemptWrite(() => this.storageService.setUserDraftIndex(userId, index));
		if (!result.success) this.report.failures.push({ ...result, userId });
	}
}
