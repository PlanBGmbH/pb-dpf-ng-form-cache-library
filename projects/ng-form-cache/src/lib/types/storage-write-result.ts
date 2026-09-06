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
