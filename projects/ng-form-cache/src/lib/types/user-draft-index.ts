/**
 * Represents the index of all drafts stored for a specific user.
 * This allows for quick retrieval and management of a user's drafts.
 */
export interface UserDraftIndex {
  /** The unique identifier of the user. */
  userId: string;

  /** The last active session identifier for the user. */
  sessionId: string;

  /** A list of storage keys for all drafts belonging to the user. */
  draftKeys: string[];

  /** The timestamp (in milliseconds) of the user's last activity. */
  lastActivity: number;
}
