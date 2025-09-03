import { InjectionToken } from "@angular/core";

/**
 * Defines the configuration options for the draft persistence system.
 */
export interface PersistenceConfig {
	/** The time-to-live (TTL) for stored drafts, in milliseconds. */
	ttl: number;

	/** The interval (in milliseconds) at which the cleanup service should run. */
	cleanupInterval: number;

	/** The threshold (in milliseconds) for considering a session stale. */
	staleThreshold: number;

	/** The storage quota (in bytes) at which the system should trigger cleanup. */
	storageQuota: number;
}

export const DRAFT_PERSISTENT_CONFIG = new InjectionToken<PersistenceConfig>('form-cache.persistent-config');