import { StoredEntityData } from '../types/storage-entity-data';
import { FormCacheStorage } from '../types/storage-service';
import { UserDraftIndex } from '../types/user-draft-index';

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isTimestamp(value: unknown): value is number {
	return typeof value === 'number' && Number.isFinite(value);
}

/** formData is deliberately unrestricted. */
export function isDraft<T>(storage: FormCacheStorage, key: string, value: unknown): value is StoredEntityData<T> {
	if (isRecord(value) && isRecord(value['metadata'])) {
		const metadata = value['metadata'];
		if (
			typeof metadata['userId'] === 'string' &&
			typeof metadata['sessionId'] === 'string' &&
			metadata['version'] === 1 &&
			isTimestamp(metadata['createdAt']) &&
			isTimestamp(metadata['lastModified']) &&
			isTimestamp(metadata['expiresAt']) &&
			typeof value['entityType'] === 'string' &&
			(value['entityId'] === undefined || typeof value['entityId'] === 'string') &&
			typeof value['isDirty'] === 'boolean' &&
			typeof value['autoSaveEnabled'] === 'boolean' &&
			storage.generateDraftKey(metadata['userId'], value['entityType'], value['entityId'] ?? '') === key
		) {
			return true;
		}
	}
	return false;
}

export function isUserDraftIndex(storage: FormCacheStorage, key: string, value: unknown): value is UserDraftIndex {
	return (
		isRecord(value) &&
		typeof value['userId'] === 'string' &&
		typeof value['sessionId'] === 'string' &&
		isTimestamp(value['lastActivity']) &&
		Array.isArray(value['draftKeys']) &&
		Array.from(value['draftKeys']).every((draftKey: unknown) => typeof draftKey === 'string') &&
		storage.generateIndexKey(value['userId']) === key
	);
}

/** Invalid records are removed and treated as absent. */
export function validateDraft<T>(
	storage: FormCacheStorage,
	key: string,
	value: unknown,
): StoredEntityData<T> | undefined {
	if (isDraft<T>(storage, key, value)) return value;
	if (value !== undefined) storage.removeItem(key);
	return undefined;
}

export function validateUserDraftIndex(
	storage: FormCacheStorage,
	key: string,
	value: unknown,
): UserDraftIndex | undefined {
	if (isUserDraftIndex(storage, key, value)) return value;
	if (value !== undefined) storage.removeItem(key);
	return undefined;
}

export function readDraft<T>(storage: FormCacheStorage, key: string) {
	return validateDraft<T>(storage, key, storage.getDraft<T>(key));
}

export function readUserDraftIndex(storage: FormCacheStorage, userId: string) {
	return validateUserDraftIndex(storage, storage.generateIndexKey(userId), storage.getUserDraftIndex(userId));
}
