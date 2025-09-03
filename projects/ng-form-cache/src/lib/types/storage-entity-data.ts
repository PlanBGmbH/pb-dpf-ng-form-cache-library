import { StorageMetadata } from "./storage-metadata";

/**
 * Represents the complete data structure for a stored entity draft.
 * This includes the form data itself and all associated metadata.
 */
export interface StoredEntityData<T = unknown> {
	/** The metadata for the stored draft. */
	metadata: StorageMetadata;

	/** The actual form data being persisted. */
	formData: T;

	/** The type of the entity (e.g., 'client', 'institution'). */
	entityType: string;

	/** The unique identifier of the entity, if it already exists. */
	entityId?: string;

	/** A flag indicating if the form has unsaved changes. */
	isDirty: boolean;

	/** A flag indicating if auto-save is currently enabled for the form. */
	autoSaveEnabled: boolean;
}