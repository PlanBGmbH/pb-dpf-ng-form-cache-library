import { StoredEntityData } from '../types/storage-entity-data';
import { UserDraftIndex } from '../types/user-draft-index';

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isTimestamp(value: unknown): value is number {
	return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

/** Version 1 accepts the original unversioned shape. Unknown versions are left untouched. */
export function readDraft<T>(value: unknown): StoredEntityData<T> | undefined {
	if (!isRecord(value) || !isRecord(value['metadata'])) return;
	const metadata = value['metadata'];
	if (
		(metadata['version'] !== undefined && metadata['version'] !== 1) ||
		typeof metadata['userId'] !== 'string' ||
		typeof metadata['sessionId'] !== 'string' ||
		!isTimestamp(metadata['createdAt']) ||
		!isTimestamp(metadata['lastModified']) ||
		!isTimestamp(metadata['expiresAt']) ||
		typeof value['entityType'] !== 'string' ||
		(value['entityId'] !== undefined && typeof value['entityId'] !== 'string') ||
		typeof value['isDirty'] !== 'boolean' ||
		typeof value['autoSaveEnabled'] !== 'boolean' ||
		!Object.prototype.hasOwnProperty.call(value, 'formData')
	)
		return;
	return { ...value, metadata: { ...metadata, version: 1 } } as unknown as StoredEntityData<T>;
}

/** Validate before trusting an index, including its owner and every key's type. */
export function readIndex(value: unknown, userId: string): UserDraftIndex | undefined {
	if (
		!isRecord(value) ||
		(value['version'] !== undefined && value['version'] !== 1) ||
		value['userId'] !== userId ||
		typeof value['sessionId'] !== 'string' ||
		!isTimestamp(value['lastActivity']) ||
		!Array.isArray(value['draftKeys']) ||
		!value['draftKeys'].every((key: unknown) => typeof key === 'string')
	)
		return;
	return { ...value, version: 1, draftKeys: [...new Set(value['draftKeys'])] } as UserDraftIndex;
}

export interface SessionRecord {
	version: 1;
	userId: string;
	sessionId: string;
}

export function readSession(value: unknown): SessionRecord | undefined {
	if (
		!isRecord(value) ||
		value['version'] !== 1 ||
		typeof value['userId'] !== 'string' ||
		typeof value['sessionId'] !== 'string' ||
		!value['sessionId']
	)
		return;
	return value as unknown as SessionRecord;
}
