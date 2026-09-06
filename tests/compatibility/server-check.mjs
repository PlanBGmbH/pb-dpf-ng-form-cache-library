import '@angular/compiler';
import assert from 'node:assert/strict';
import { createEnvironmentInjector, NgZone, PLATFORM_ID } from '@angular/core';
import {
	CLEANUP_SERVICE,
	defaultConfig,
	FORM_CACHE_STORAGE,
	FORM_PERSISTENCE_SERVICE,
	provideFormCacheStorage,
	SESSION_MANAGER_SERVICE,
} from '@planbgmbh/ng-form-cache';

assert.equal(typeof window, 'undefined');
assert.equal(typeof localStorage, 'undefined');
const injector = createEnvironmentInjector([
	{ provide: PLATFORM_ID, useValue: 'server' },
	{ provide: NgZone, useValue: { runOutsideAngular: (callback) => callback() } },
	...provideFormCacheStorage({
		baseConfig: defaultConfig,
		perstistenceConfig: { ttl: 1000, cleanupInterval: 100, staleThreshold: 5000, storageQuota: 5000 },
	}),
]);
try {
	injector.get(SESSION_MANAGER_SERVICE).startSession('server-user');
	const persistence = injector.get(FORM_PERSISTENCE_SERVICE);
	persistence.setUserId('server-user');
	persistence.saveDraft('profile', '1', { name: 'server' });
	assert.equal(persistence.loadDraft('profile', '1'), undefined);
	assert.deepEqual(injector.get(FORM_CACHE_STORAGE).keys(), []);
	injector.get(CLEANUP_SERVICE).start();
	injector.get(CLEANUP_SERVICE).runCleanup();
	console.log('Server check passed without browser globals');
} finally {
	injector.destroy();
}
