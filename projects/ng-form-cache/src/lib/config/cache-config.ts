import { InjectionToken } from "@angular/core";

export interface FormCacheConfig {
  indexKeyPrefix: string;
  draftKeyPrefix: string;
  sessionIdKey: string;
  autoSaveDebounceTime: number;
}

export const FORM_CACHE_CONFIG = new InjectionToken<FormCacheConfig>("form-cache.config");

export const defaultConfig: FormCacheConfig = {
  indexKeyPrefix: 'fc_index_',
  draftKeyPrefix: 'fc_draft_',
  sessionIdKey: 'app_current_session_id',
  autoSaveDebounceTime: 1000
}