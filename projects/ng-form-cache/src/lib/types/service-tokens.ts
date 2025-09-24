import { InjectionToken } from '@angular/core';
import { CleanupService } from '../services/cleanup';
import { FormPersistenceService } from '../services/form-persistence';
import { SessionManagerService } from '../services/session-manager';

export const CLEANUP_SERVICE = new InjectionToken<CleanupService>('PB_FC_CLEANUP_SERVICE');
export const SESSION_MANAGER_SERVICE = new InjectionToken<SessionManagerService>('PB_FC_SESSION_MANAGER_SERVICE');
export const FORM_PERSISTENCE_SERVICE = new InjectionToken<FormPersistenceService>('PB_FC_FORM_PERSISTENCE_SERVICE');
