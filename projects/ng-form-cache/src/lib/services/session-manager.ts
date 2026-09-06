import { isPlatformBrowser } from '@angular/common';
import { inject, Injectable, OnDestroy, PLATFORM_ID } from '@angular/core';
import { FORM_CACHE_CONFIG } from '../config/cache-config';
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

	/**
	 * Starts a new session for a user.
	 * @param userId The ID of the user starting the session.
	 * @returns The generated session ID.
	 */
	public startSession(userId: string) {
		this.currentSessionId = this.generateSessionId();
		this.storageService.setItem(this.config.sessionIdKey, this.currentSessionId);
		this.updateUserIndex(userId, this.currentSessionId);
		return this.currentSessionId;
	}

	/**
	 * Ends the current session.
	 * @param userId The ID of the user ending the session.
	 */
	public endSession(userId: string) {
		const index = this.storageService.getUserDraftIndex(userId);
		if (index && index.sessionId === this.currentSessionId) {
			index.sessionId = '';
			this.storageService.setUserDraftIndex(userId, index);
		}
		if (this.storageService.getItem<string>(this.config.sessionIdKey) === this.currentSessionId) {
			this.storageService.removeItem(this.config.sessionIdKey);
		}
		this.currentSessionId = undefined;
	}

	/**
	 * @returns The current session ID.
	 */
	public getSessionId() {
		if (!this.currentSessionId) {
			this.currentSessionId = this.storageService.getItem<string>(this.config.sessionIdKey);
		}
		return this.currentSessionId;
	}

	/**
	 * Validates the current session against the user's draft index.
	 * @param userId The ID of the user.
	 * @returns True if the session is valid, false otherwise.
	 */
	public isSessionValid(userId: string) {
		const index = this.storageService.getUserDraftIndex(userId);
		const sessionId = this.getSessionId();
		return !!(index && sessionId && index.sessionId === sessionId);
	}

	private generateSessionId() {
		return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
	}

	private updateUserIndex(userId: string, sessionId: string) {
		let index = this.storageService.getUserDraftIndex(userId);
		if (!index) {
			index = {
				userId,
				sessionId,
				draftKeys: [],
				lastActivity: Date.now(),
			};
		} else {
			index.sessionId = sessionId;
			index.lastActivity = Date.now();
		}
		this.storageService.setUserDraftIndex(userId, index);
	}

	private handleStorageChange(event: StorageEvent) {
		if (event.key !== null && event.key !== this.config.sessionIdKey) return;
		try {
			if (event.storageArea && event.storageArea !== window.localStorage) return;
			const value: unknown = event.newValue ? JSON.parse(event.newValue) : undefined;
			this.currentSessionId = typeof value === 'string' ? value : undefined;
		} catch {
			this.currentSessionId = undefined;
		}
	}
}
