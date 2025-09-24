/**
 * Represents the components of a storage key used to uniquely identify a draft.
 */
export interface StorageKey {
	/** The application-specific prefix for all storage keys. */
	prefix: 'app_draft';

	/** The unique identifier of the user. */
	userId: string;

	/** The type of the entity. */
	entityType: string;

	/** The unique identifier of the entity. */
	entityId: string;
}
