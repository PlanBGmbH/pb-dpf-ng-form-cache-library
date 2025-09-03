import { Provider, Type } from "@angular/core";
import { FORM_CACHE_STORAGE, LocalStorageService } from "../public-api";
import { FORM_CACHE_CONFIG, FormCacheConfig } from "./config/cache-config";
import { CleanupService } from "./services/cleanup";
import { FormPersistenceService } from "./services/form-persistence";
import { SessionManagerService } from "./services/session-manager";
import { DRAFT_PERSISTENT_CONFIG, PersistenceConfig } from "./types/persistence-config";
import { CLEANUP_SERVICE, FORM_PERSISTENCE_SERVICE, SESSION_MANAGER_SERVICE } from "./types/service-tokens";

export function provideFormCacheStorage(config: {
  baseConfig: FormCacheConfig,
  perstistenceConfig: PersistenceConfig
}, storageClass?: Type<any>): Provider[] {
	return [
		{
			provide: CLEANUP_SERVICE,
			useClass: CleanupService
		},
		{
			provide: SESSION_MANAGER_SERVICE,
			useClass: SessionManagerService
		},
		{
			provide: FORM_PERSISTENCE_SERVICE,
			useClass: FormPersistenceService
		},
    { 
      provide: FORM_CACHE_STORAGE,
      useClass: storageClass ? storageClass : LocalStorageService
    },
    {
			provide: FORM_CACHE_CONFIG,
			useValue: config.baseConfig,
		},
		{
			provide: DRAFT_PERSISTENT_CONFIG,
			useValue: config.perstistenceConfig,
		},
	];
}
