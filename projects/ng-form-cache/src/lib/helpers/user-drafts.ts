import { FormCacheStorage } from '../types/storage-service';
import { readDraft } from './storage-records';

/**
 * Keys of validated drafts owned by `userId`, taken from `candidates` and, for adapters implementing
 * `keys()`, from every stored draft record. Stored drafts are authoritative: an index overwritten by a
 * concurrent read/modify/write in another tab cannot hide them from bulk deletion or later index writes.
 */
export function ownedDraftKeys(
	storage: FormCacheStorage,
	draftKeyPrefix: string,
	userId: string,
	candidates: readonly string[] = [],
): string[] {
	let stored: string[] = [];
	try {
		stored = storage.keys?.() ?? [];
	} catch {
		// Without enumeration only the candidates can be checked.
	}
	return [...new Set([...candidates, ...stored])].filter((key) => {
		if (!key.startsWith(draftKeyPrefix)) return false;
		try {
			return readDraft(storage.getDraft(key))?.metadata.userId === userId;
		} catch {
			return false;
		}
	});
}

/** Adds stored drafts owned by `userId` to existing index keys, preserving their order. */
export function withOwnedDrafts(
	storage: FormCacheStorage,
	draftKeyPrefix: string,
	userId: string,
	draftKeys: readonly string[],
): string[] {
	return [...new Set([...draftKeys, ...ownedDraftKeys(storage, draftKeyPrefix, userId)])];
}
