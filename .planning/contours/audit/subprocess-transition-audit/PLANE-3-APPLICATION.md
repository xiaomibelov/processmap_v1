# Subprocess Transition Architecture — PLANE 3: APPLICATION

## Component map (current)

```
┌─────────────────────────────────────────────────────────────────┐
│ App.jsx                                                         │
│  ├─ openSessionWithLeaveGuard                                   │
│  ├─ navigateToSubprocess                                        │
│  ├─ returnToParent                                              │
│  ├─ subprocessBreadcrumbs (state)                               │
│  ├─ focusElementId (state)                                      │
│  ├─ popstate listener                                           │
│  └─ passes callbacks down to AppShell / BpmnStage / NotesPanel  │
├─────────────────────────────────────────────────────────────────┤
│ AppShell.jsx / BpmnStage.jsx / ProcessStage.jsx                 │
│  ├─ bindSubprocessNavigationEvents                              │
│  ├─ runDiagramContextAction                                     │
│  └─ render BPMN, forward onNavigateToSubprocess                 │
├─────────────────────────────────────────────────────────────────┤
│ useSessionActivationOrchestration.js                            │
│  └─ openSession, snapshot restore, session state machine        │
├─────────────────────────────────────────────────────────────────┤
│ useSessionRouteOrchestration.js                                 │
│  └─ URL parsing, history push/replace, seeding                  │
├─────────────────────────────────────────────────────────────────┤
│ useSessionShellOrchestration.js                                 │
│  └─ shellSessionId, UI state, selection continuity              │
└─────────────────────────────────────────────────────────────────┘
        │
        ▼
Backend routers/sessions.py
        │
        ▼
session_service.py
  ├─ navigate_to_subprocess
  ├─ return_to_parent
  ├─ _resolve_child_bpmn_xml
  ├─ _create_child_session
  └─ _build_breadcrumbs
        │
        ▼
bpmn_navigation.py (pure XML utilities)
```

## Who currently manages transitions

| Concern | Current owner | Should be owned by |
|---------|---------------|--------------------|
| Detect drilldown click | `bindSubprocessNavigationEvents` + `BpmnStage` | BPMN stage event adapter |
| Decide to navigate | `App.jsx` | Subprocess transition coordinator |
| Resolve target child | Backend `session_service.py` | Subprocess lifecycle service |
| Activate session | `useSessionActivationOrchestration` (called by App) | Session activation service |
| Update URL/history | `App.jsx` calling `useSessionRouteOrchestration` | Router reacting to activation |
| Render breadcrumb | `App.jsx` state | Breadcrumb projector UI component |
| Render focus | `bpmnRenderRuntimeLifecycle` reading global | BPMN stage props |

## State machine (recommended)

Introduce an explicit `SubprocessTransitionState` in the frontend coordinator:

```
Idle
  │
  │ onDrilldownRequested
  ▼
Resolving ────────► Failed (error toast)
  │
  │ onResolved(childId, targetElementId, breadcrumbs)
  ▼
Activating ───────► Failed (rollback URL)
  │
  │ onActivated
  ▼
Routing
  │
  ▼
Idle
```

And a backend `SubprocessLifecycle` state machine:

```
ParentLoaded
  │
  │ validate element
  ▼
ChildResolved (existing | new)
  │
  │ acquire lock
  ▼
ChildCommitted
  │
  │ build projection
  ▼
Completed
```

## Event/command bus (recommended)

Replace imperative callbacks with a small command bus inside the application layer:

```ts
type TransitionCommand =
  | { type: 'navigateToSubprocess'; elementId: string; targetElementId?: string }
  | { type: 'returnToParent' }
  | { type: 'restoreFromUrl'; route: ProcessMapRoute };
```

The coordinator is the single consumer. It emits domain events:

```ts
type TransitionEvent =
  | { type: 'transition.resolved'; childId: string; targetElementId: string; breadcrumbs: Breadcrumb[] }
  | { type: 'transition.activated'; sessionId: string }
  | { type: 'transition.routed'; route: ProcessMapRoute }
  | { type: 'transition.failed'; reason: string }
  | { type: 'transition.returned'; parentId: string; elementIdInParent: string };
```

## Saga / orchestration style

The transition is short-lived and synchronous enough that a full distributed saga is overkill. However, it already has the shape of a local saga:

1. Frontend issues resolve command.
2. Backend handles find-or-create with lock.
3. Frontend activates session.
4. Frontend updates history.
5. Frontend updates UI.

A lightweight **coordinator/saga** in the frontend (plain async function or XState machine) plus a **transaction script** in the backend is the right granularity. Temporal/Zeebe would be excessive for this local flow unless we later add long-running cross-session approvals or async AI-generated subprocess creation.

## Application-layer boundaries to enforce

1. **BPMN stage is a renderer, not a navigator.** It emits `drilldownRequested` and `elementFocused` events; it never calls routing or session APIs.
2. **Session activation is a service, not a component.** It exposes `activateSession(id, intent)` and emits state changes; it does not know about URLs.
3. **Router is a projection of activation state.** It writes the URL when activation succeeds; it does not drive activation.
4. **Subprocess coordinator is the only cross-cutting orchestrator.** It sequences resolve → activate → route → focus.
5. **Backend subprocess lifecycle service owns hierarchy invariant.** It is the only place that creates child sessions and writes `parent_session_id` / `navigation_stack`.

## Current event flow (problematic)

```
click .bjs-drilldown
  -> bindSubprocessNavigationEvents callback ref
    -> BpmnStage onNavigateToSubprocess
      -> App.jsx navigateToSubprocess
        -> apiNavigateToSubprocess
        <- {childId, targetElementId, breadcrumbs}
        -> setSubprocessBreadcrumbs
        -> setFocusElementId
        -> pushSessionSelectionToUrl
        -> window.__SUBPROCESS_FOCUS_ELEMENT_ID__ = ...
        -> openSession(childId)
          -> setRequestedSessionId
          -> apiGetSession
          -> draft updated
            -> selection sync effect writes URL again
            -> shell orchestration resets
            -> BPMN stage re-renders
              -> bpmnRenderRuntimeLifecycle reads global focus
```

This flow has multiple writers to URL/state and no rollback.

## Recommended event flow

```
click .bjs-drilldown
  -> BPMN stage emits drilldownRequested(elementId)
    -> SubprocessTransitionCoordinator.dispatch({type:'navigateToSubprocess', elementId})
      -> resolve via API
      <- {childId, targetElementId, breadcrumbs}
      -> SessionActivator.activate(childId)
        -> draft updated
      -> Router.onActivationSuccess writes reversible history entry
      -> BPMN stage receives focusElementId prop
      -> BreadcrumbProjector renders from session.navigation_stack
```

With this flow, the URL is written once, after activation succeeds, and the history entry preserves the parent.
