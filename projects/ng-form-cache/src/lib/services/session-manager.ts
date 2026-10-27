import { inject, Injectable, OnDestroy } from '@angular/core';
import { FORM_CACHE_CONFIG } from '../config/cache-config';
import { readSession, SessionRecord } from '../helpers/storage-records';
import { attemptWrite } from '../helpers/storage-write';
import { StorageWriteResult } from '../types/storage-write-result';
import { FORM_CACHE_STORAGE } from '../types/storage-service';
import { validIndex } from './storage-validation';

@Injectable()
export class SessionManagerService implements OnDestroy {
	private readonly storageService = inject(FORM_CACHE_STORAGE);
	private readonly config = inject(FORM_CACHE_CONFIG);
	private currentSessionId?: string;
	// Only the configured backend reports its own external changes; backends without notifications get none.
	private readonly unwatch = this.storageService.watch?.((key) => this.handleStorageChange(key));

	public ngOnDestroy() {
		this.unwatch?.();
	}

	/** Start or resume the application-wide session for this user. Check validity after a failed storage write. */
	public startSession(userId: string): string {
		const active = this.readActiveSession();
		const existingId = typeof active === 'string' ? active : active?.sessionId;
		const sameUser = active && this.belongsTo(active, userId);
		const sessionId = sameUser && existingId ? existingId : this.generateSessionId();
		if (!sameUser || typeof active === 'string') {
			const record: SessionRecord = { version: 1, userId, sessionId };
			const result = attemptWrite(() => this.storageService.setItem(this.config.sessionIdKey, record));
			if (!result.success) {
				this.currentSessionId = undefined;
				return sessionId;
			}
		}
		this.currentSessionId = sessionId;
		this.updateUserIndex(userId, sessionId);
		return sessionId;
	}

	/** Logout in every tab observing this session; drafts are retained. Newer sessions are untouched. */
	public endSession(userId: string): StorageWriteResult {
		let result: StorageWriteResult = { success: true };
		const active = this.readActiveSession();
		const sessionId = typeof active === 'string' ? active : active?.sessionId;
		if (active && sessionId && sessionId === this.currentSessionId && this.belongsTo(active, userId)) {
			// An immutable per-session revocation avoids a read/remove race with a new login.
			result = attemptWrite(() => this.storageService.setItem(this.revocationKey(sessionId), true));
			if (result.success) {
				const index = validIndex(this.storageService.getUserDraftIndex(userId), userId);
				if (index?.sessionId === sessionId) {
					index.sessionId = '';
					attemptWrite(() => this.storageService.setUserDraftIndex(userId, index));
				}
			}
		}
		this.currentSessionId = undefined;
		return result;
	}

	/** Read persisted state every time, including before delayed saves and before storage events arrive. */
	public getSessionId(): string | undefined {
		const active = this.readActiveSession();
		this.currentSessionId = typeof active === 'string' ? active : active?.sessionId;
		return this.currentSessionId;
	}

	/** Ownership comes from the session record, independently of concurrent index updates. */
	public isSessionValid(userId: string): boolean {
		const active = this.readActiveSession();
		this.currentSessionId = typeof active === 'string' ? active : active?.sessionId;
		return !!active && this.belongsTo(active, userId);
	}

	private belongsTo(active: SessionRecord | string, userId: string): boolean {
		return typeof active === 'string'
			? validIndex(this.storageService.getUserDraftIndex(userId), userId)?.sessionId === active
			: active.userId === userId;
	}

	private readActiveSession(): SessionRecord | string | undefined {
		const raw = this.storageService.getItem<unknown>(this.config.sessionIdKey);
		const active = readSession(raw) ?? (typeof raw === 'string' && raw ? raw : undefined);
		const sessionId = typeof active === 'string' ? active : active?.sessionId;
		return sessionId && this.storageService.getItem(this.revocationKey(sessionId)) !== true ? active : undefined;
	}

	private revocationKey(sessionId: string): string {
		return `${this.config.sessionIdKey}:revoked:${encodeURIComponent(JSON.stringify(sessionId))}`;
	}

	private generateSessionId() {
		return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
	}

	private updateUserIndex(userId: string, sessionId: string) {
		const stored = this.storageService.getItem<{ version?: unknown } | null>(
			this.storageService.generateIndexKey(userId),
		);
		// Preserve indexes written by a newer library version.
		if (stored && typeof stored === 'object' && stored.version !== undefined && stored.version !== 1) return;
		const index = validIndex(this.storageService.getUserDraftIndex(userId), userId) ?? {
			version: 1,
			userId,
			sessionId,
			draftKeys: [],
			lastActivity: Date.now(),
		};
		index.sessionId = sessionId;
		index.lastActivity = Date.now();
		attemptWrite(() => this.storageService.setUserDraftIndex(userId, index));
	}

	private handleStorageChange(key: string | null) {
		if (key !== null && key !== this.config.sessionIdKey && !key.startsWith(`${this.config.sessionIdKey}:revoked:`))
			return;
		try {
			// Events may be delayed; the value persisted in the configured backend is authoritative.
			this.getSessionId();
		} catch {
			this.currentSessionId = undefined;
		}
	}
}
