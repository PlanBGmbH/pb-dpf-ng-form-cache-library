/**
 * Represents the metadata associated with a stored draft.
 * This information is used for lifecycle management, cleanup, and auditing.
 */
export interface StorageMetadata {
	/** The unique identifier of the user who owns the draft. */
	userId: string;

	/** The session identifier during which the draft was created or last updated. */
	sessionId: string;

	/** The timestamp (in milliseconds) when the draft was first created. */
	createdAt: number;

	/** The timestamp (in milliseconds) when the draft was last modified. */
	lastModified: number;

	/** The timestamp (in milliseconds) when the draft is scheduled to expire. */
	expiresAt: number;

	/** The version of the data structure, for future migrations. */
	version: number;
}