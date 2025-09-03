# PlanB. Angular Form Cache Library

<img src="https://github.com/PlanBGmbH/pb-dpf-ng-form-cache-library/blob/main/docs/images/logo.png" alt="Logo of the library" width="100" height="100" />

> [!CAUTION]
> This library is currently in development and has no release version yet!

## Basic architecture and flow

This diagram shows the basic flow of the data inside the library

```mermaid
flowchart TD
  %% Sample Form Data Flow with Draft Caching (simplified, parser-friendly)

  subgraph Form_Initialization
    U[User navigates to form] --> F[Reactive form created]
    F --> D[AutoSaveDirective init fcAutoSave]
    D --> K1[Generate draft key]
    D --> FP[FormPersistenceService.loadDraft]
    FP --> LSget[LocalStorageService.getItem]
    LSget -->|draft found| P[Patch form with saved data]
    LSget -->|no draft| E[Empty/pristine form]
  end

  subgraph Auto_Save
    VC[Form value changes] -->|form is dirty| AS[FormPersistenceService.autoSave]
    AS --> SM[SessionManagerService validate]
    AS --> SD[Build StoredEntityData payload]
    SD --> LSset[LocalStorageService.setItem]
    LSset --> IDX[Update UserDraftIndex]
  end

  subgraph Submit_or_Navigate
    SUB[User submits form] --> API[Backend API save]
    API -->|success| DEL[FormPersistenceService.deleteDraft]
    DEL --> Rm[Remove draft + update index]
    API -->|error| KEEP[Keep draft for retry]
    NAV[User navigates away/closes] --> KEEP
  end

  subgraph Cleanup
    CL[CleanupService timer] --> TTL{Expired or stale?}
    TTL -->|yes| GC[Delete draft + update index]
    QU[Storage usage check] -->|high| TRIM[Delete oldest drafts]
    LOG[User logout] --> CLR[Clear current user drafts]
  end

  %% Flow connections
  U --> VC
  P --> VC
  E --> VC

```

The `Form_Initialization` part is handled automatically via the `fcAutoSave` directive. For deletion of a draft after form submit/save the user manually needs to call the delete function on the draft service. Cleanup processes are handled automatically by the cleanup service.
