/** Synchronous adapters may keep returning void; explicit results enable failure reporting. */
export type StorageWriteResult = { success: true } | StorageWriteFailure;

export interface StorageWriteFailure {
	success: false;
	reason: 'quota' | 'access' | 'serialization' | 'unavailable' | 'unknown';
	error?: unknown;
}

/** Reactive state for a single user/entity draft. */
export type DraftSaveState =
	| { status: 'idle' | 'pending' | 'saved' | 'cancelled' }
	| {
			status: 'failed';
			phase: 'session' | 'draft' | 'index';
			reason: StorageWriteFailure['reason'] | 'invalid-session';
			error?: unknown;
			draftPersisted: boolean;
	  };

/** Outcome of a cleanup run, so consumers can surface drafts removed without user action. */
export interface CleanupReport {
	/** Draft keys removed because their TTL elapsed. */
	expired: string[];
	/** Draft keys removed because their user's session exceeded `staleThreshold`. */
	stale: string[];
	/** Draft keys removed to keep the cache within `storageQuota`. */
	evicted: string[];
	/** Index writes that failed; the affected drafts were still removed. */
	failures: (StorageWriteFailure & { userId: string })[];
}
