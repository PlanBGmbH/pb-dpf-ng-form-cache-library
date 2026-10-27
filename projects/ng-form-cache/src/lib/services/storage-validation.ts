import { readDraft as parseDraft, readIndex } from '../helpers/storage-records';
import { StoredEntityData } from '../types/storage-entity-data';
import { UserDraftIndex } from '../types/user-draft-index';

/**
 * Validates records returned by any storage adapter. Invalid or unsupported records are treated as
 * absent but never modified or removed, so future versions remain untouched. formData is unrestricted.
 */
export function validDraft<T = unknown>(value: unknown): StoredEntityData<T> | undefined {
	return parseDraft<T>(value);
}

export function validIndex(value: unknown, userId: string): UserDraftIndex | undefined {
	return readIndex(value, userId);
}
