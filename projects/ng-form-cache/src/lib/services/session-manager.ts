import { isPlatformBrowser } from '@angular/common';
import { inject, Injectable, OnDestroy, PLATFORM_ID } from '@angular/core';
import { FORM_CACHE_CONFIG } from '../config/cache-config';
import { readSession, SessionRecord } from '../helpers/storage-records';
import { attemptWrite } from '../helpers/storage-write';
import { StorageWriteResult } from '../types/storage-write-result';
import { FORM_CACHE_STORAGE } from '../types/storage-service';

@Injectable()
export class SessionManagerService implements OnDestroy {
	private readonly storageService = inject(FORM_CACHE_STORAGE);
	private readonly config = inject(FORM_CACHE_CONFIG);
	private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
	private currentSessionId?: string;

	public constructor() {
		this.handleStorageChange = this.handleStorageChange.bind(this);
		if (this.isBrowser) window.addEventListener('storage', this.handleStorageChange);
	}

	public ngOnDestroy() {
		if (this.isBrowser) window.removeEventListener('storage', this.handleStorageChange);
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
				const index = this.storageService.getUserDraftIndex(userId);
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
			? this.storageService.getUserDraftIndex(userId)?.sessionId === active
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
		const index = this.storageService.getUserDraftIndex(userId) ?? {
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

	private handleStorageChange(event: StorageEvent) {
		if (
			event.key !== null &&
			event.key !== this.config.sessionIdKey &&
			!event.key.startsWith(`${this.config.sessionIdKey}:revoked:`)
		)
			return;
		try {
			if (event.storageArea && event.storageArea !== window.localStorage) return;
			// Events may be delayed; the persisted value, not event.newValue, is authoritative.
			this.getSessionId();
		} catch {
			this.currentSessionId = undefined;
		}
	}
}
