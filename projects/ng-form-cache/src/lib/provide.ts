import { Provider, Type } from "@angular/core";
import { FORM_CACHE_STORAGE, LocalStorageService } from "../public-api";
import { FORM_CACHE_CONFIG, FormCacheConfig } from "./config/cache-config";
import { CleanupService } from "./services/cleanup";
import { FormPersistenceService } from "./services/form-persistence";
import { SessionManagerService } from "./services/session-manager";
import { DRAFT_PERSISTENT_CONFIG, PersistenceConfig } from "./types/persistence-config";

export function provideFormCacheStorage(config: {
  baseConfig: FormCacheConfig,
  perstistenceConfig: PersistenceConfig
}, storageClass?: Type<any>): Provider[] {
	return [
		CleanupService,
		SessionManagerService,
		FormPersistenceService,
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
