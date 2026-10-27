import { StorageWriteFailure, StorageWriteResult } from '../types/storage-write-result';

export function storageFailure(error: unknown): StorageWriteFailure {
	const name = typeof error === 'object' && error !== null && 'name' in error ? error.name : undefined;
	return {
		success: false,
		reason: name === 'QuotaExceededError' ? 'quota' : name === 'SecurityError' ? 'access' : 'unknown',
		error,
	};
}

/** A legacy void return means assumed success; thrown adapter failures are still reported. */
export function attemptWrite(write: () => void | StorageWriteResult): StorageWriteResult {
	try {
		return write() ?? { success: true };
	} catch (error) {
		return storageFailure(error);
	}
}
