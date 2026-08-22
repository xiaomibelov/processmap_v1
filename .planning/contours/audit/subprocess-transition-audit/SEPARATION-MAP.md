# Subprocess Transition Architecture — SEPARATION MAP

This matrix shows which component/layer currently owns a concern and where it should live after decoupling.

| Concern | Current owner | Desired owner | Decoupling action |
|---------|---------------|---------------|-------------------|
| Detect BPMN drilldown click | `bindSubprocessNavigationEvents` + `BpmnStage` + `App.jsx` callback | BPMN stage event adapter | Adapter emits typed `drilldownRequested(elementId)` event; no callback threading through `App.jsx` |
| Decide to start a subprocess transition | `App.jsx` | `SubprocessTransitionCoordinator` (new) | Coordinator consumes events from BPMN stage, context menu, URL restore |
| Resolve child session / XML / breadcrumbs | `session_service.py` (god module) | `SubprocessLifecycleService` (new) | Extract find-or-create, XML resolution, breadcrumb projection from `session_service.py` |
| Enforce unique child per parent element | None (race possible) | `SubprocessLifecycleService` + DB constraint | Add unique partial index + Redis lock |
| Activate session (load draft, snapshot, shell) | `useSessionActivationOrchestration` called ad-hoc from `App.jsx` | `SessionActivationService` | Expose `activate(sessionId, intent)`; emit `sessionActivated` event; no URL knowledge |
| Map activation state to URL/history | `App.jsx` calling `useSessionRouteOrchestration` | `ProcessMapRouter` | Router subscribes to activation events; writes reversible history entries; handles Back/Forward |
| Render breadcrumb UI | `App.jsx` state `subprocessBreadcrumbs` | `SubprocessBreadcrumbProjector` | Read-only component fed by `session.navigation_stack`; loads titles in bulk |
| Render focused element after transition | `bpmnRenderRuntimeLifecycle` reading `window.__SUBPROCESS_FOCUS_ELEMENT_ID__` | `BpmnStage` via props | Pass `focusElementId` explicitly through props/state |
| Context-menu drilldown action | `executeBpmnContextMenuAction` threads callback up to `App.jsx` | Dispatch `navigateToSubprocess` command to coordinator | Remove callback drilling |
| Authz context resolution | Deep inside `_subprocess_request_context`, `_build_breadcrumbs`, `_create_child_session` | Thin authz adapter at service boundary | Pass plain `(user_id, org_id, is_admin)` into domain functions |
| Pure BPMN XML navigation | `bpmn_navigation.py` | Keep in `bpmn_navigation.py` | Ensure no DB access; keep pure |
| Clipboard subprocess paste | `clipboard/materializer.py` + `serializer.py` | Keep in clipboard boundary | Already uses Redis lock; ensure it delegates session-state merge to a dedicated helper |
| Leave guard on session switch | `openSessionWithLeaveGuard` in `App.jsx` | `SessionActivationService` or guard wrapper | Guard belongs next to activation, not in shell component |
| Discussion panel navigation | `NotesMvpPanel` calls `onNavigateToSession` callback | Same, but callback routed through coordinator | Soft-close when target is current session; full navigation when different |

## Layer boundaries after decoupling

```
┌─────────────────────────────────────────────┐
│ UI Layer                                    │
│  SubprocessBreadcrumbs, NotesMvpPanel, etc. │
├─────────────────────────────────────────────┤
│ Application / Orchestration Layer           │
│  SubprocessTransitionCoordinator            │
│  SessionActivationService                   │
│  ProcessMapRouter                           │
├─────────────────────────────────────────────┤
│ Adapter Layer                               │
│  BPMN stage event adapter                   │
│  Context-menu command adapter               │
│  Authz adapter                              │
├─────────────────────────────────────────────┤
│ Domain Layer                                │
│  bpmn_navigation.py                         │
│  SubprocessLifecycleService                 │
├─────────────────────────────────────────────┤
│ Persistence Layer                           │
│  session_repo + unique index + locks        │
└─────────────────────────────────────────────┘
```

## Dependencies that must NOT exist

1. **BPMN stage → Router.** The stage must not know how URLs or history work.
2. **Router → Session activation details.** The router must not call `apiGetSession`; it reacts to activation events.
3. **Backend domain functions → FastAPI `Request`.** Domain code should receive resolved authz context.
4. **Frontend shell → backend API URLs.** API calls live in `lib/api.js`, not in `App.jsx`.
5. **Renderer → global variables.** Focus intent must be explicit.

## Migration order

1. Extract `SubprocessTransitionCoordinator` in frontend (pure refactor, no behavior change).
2. Move router history write behind activation events; fix Back button.
3. Replace global focus variable with explicit prop.
4. Extract `SubprocessLifecycleService` in backend.
5. Add unique index + Redis lock.
6. Add bulk breadcrumb loader.
7. Remove old callbacks and global side-channel.
