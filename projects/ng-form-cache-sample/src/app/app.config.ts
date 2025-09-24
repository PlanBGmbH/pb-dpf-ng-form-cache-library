import { ApplicationConfig, provideBrowserGlobalErrorListeners, provideZonelessChangeDetection } from '@angular/core';
import { defaultConfig, provideFormCacheStorage } from 'ng-form-cache';

export const appConfig: ApplicationConfig = {
	providers: [
		provideBrowserGlobalErrorListeners(),
		provideZonelessChangeDetection(),
		provideFormCacheStorage({
			baseConfig: defaultConfig,
			perstistenceConfig: {
				ttl: 3600 * 1000, // 1 hour in milliseconds
				cleanupInterval: 60000, // 1 minute in milliseconds
				staleThreshold: 1800000, // 30 minutes in milliseconds
				storageQuota: 5242880, // 5MB in bytes
			},
		}),
	],
};
