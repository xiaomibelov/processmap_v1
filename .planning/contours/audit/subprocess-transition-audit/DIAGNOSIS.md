# Subprocess Transition Architecture — DIAGNOSIS

## Executive summary
Subprocess drilldown in ProcessMap currently works for the happy path, but the transition path is not a first-class architectural boundary. Routing, session activation, BPMN rendering, breadcrumb UI, and backend session lifecycle are entangled in a few large modules (`App.jsx`, `session_service.py`). The most visible symptom is that the browser **Back** button does not return from a child subprocess session to its parent; instead it drops the user to the project session list. Less visible but equally important are race conditions on child-session creation, N+1 breadcrumb queries, and a mutable global side-channel used to pass focus intent to the canvas renderer.

This document isolates the concrete coupling points, races, and responsibility violations that must be decoupled before subprocess transitions can be considered reliable and reusable.

---

## Symptom map

| Symptom | Where it hurts | Evidence |
|---------|----------------|----------|
| Browser Back from child session lands on project list, not parent | UX / navigation contract | `pushSessionSelectionToUrl` replaces the current history entry with `sessionId=""` before pushing the child entry; the `popstate` handler has no `parentSessionId` from history state to restore the parent (`frontend/src/app/useSessionRouteOrchestration.js:61`, `frontend/src/App.jsx:3361`) |
| Possible duplicate child sessions for the same `(parent, element)` | Data consistency | `navigate_to_subprocess` does `find_by_parent_element` then `create` with no lock/transaction (`backend/app/services/session_service.py:868-881`) |
| Breadcrumbs load session titles one by one | Backend performance | `_build_breadcrumbs` loops over `navigation_stack` and calls `session_repo.load` per crumb (`backend/app/services/session_service.py:830-837`) |
| Drilldown URL is pushed before the session is activated | Recovery / error handling | `navigateToSubprocess` calls `pushSessionSelectionToUrl` and then `openSession`; if `openSession` fails, the URL is already pointing to an unloaded session (`frontend/src/App.jsx:1169-1179`) |
| Focus intent passed via `window.__SUBPROCESS_FOCUS_ELEMENT_ID__` | Coupling / testability | `App.jsx` writes a global; `bpmnRenderRuntimeLifecycle.js` reads it to scroll/highlight after import (`frontend/src/App.jsx:1177`, `frontend/src/features/process/bpmn/stage/runtime/bpmnRenderRuntimeLifecycle.js`) |
| `App.jsx` mixes routing, activation, guards, subprocess navigation, and context-menu wiring | Maintainability | 3,700-line component owns `navigateToSubprocess`, `returnToParent`, `openSessionWithLeaveGuard`, `popstate`, `subprocessBreadcrumbs`, `focusElementId`, discussion panel bridges, etc. |
| `session_service.py` mixes CRUD, analytics, presence, AI, clipboard, and subprocess navigation | Backend maintainability | Same module contains `create_session`, `navigate_to_subprocess`, `_create_child_session`, `_build_breadcrumbs`, plus many unrelated endpoints |

---

## Coupling points

### 1. Routing ↔ session activation
`useSessionRouteOrchestration` owns URL parsing and history writing, but `App.jsx` decides when to write the URL and then separately calls `openSession`. The URL is the **leading** artifact in `navigateToSubprocess` rather than a consequence of a successful session activation. This inversion makes it impossible to roll back the route when activation fails.

### 2. Subprocess navigation ↔ BPMN rendering
The BPMN stage is told which session to render via props (`draftSessionId`), but it is also expected to know how to focus an element after a transition because `App.jsx` stashed `__SUBPROCESS_FOCUS_ELEMENT_ID__` on `window`. The renderer therefore has implicit knowledge of the transition protocol.

### 3. Frontend ↔ backend hierarchy semantics
The frontend reconstructs breadcrumbs from the API response and from `parentSessionId` in the URL. The backend stores `navigation_stack` on the `Session` row. There is no shared "hierarchy projector" model; both sides independently rebuild the same conceptual breadcrumb.

### 4. Session lifecycle ↔ BPMN XML extraction
`session_service.py` both creates the child session record and resolves the child BPMN XML by scanning project sessions and parsing XML. The navigation service therefore depends on repository internals, XML parsing, and legacy helpers (`_legacy_main._recompute_session`).

### 5. Authz ↔ domain logic
`session_access_from_request` and `_subprocess_request_context` are called deep inside pure-ish helpers (`_build_breadcrumbs`, `_create_child_session`), threading `Request` objects into domain logic.

---

## Race conditions

### Duplicate child creation
```python
existing = session_repo.find_by_parent_element(session_id, element_id, ...)
if existing:
    ...
else:
    child = _create_child_session(...)
```
Two concurrent navigate requests can both pass the `find` check and create two child sessions for the same parent element. There is no uniqueness constraint or distributed lock protecting the `(parent_session_id, element_id_in_parent)` pair.

### Overlapping frontend transitions
`navigateToSubprocess` has no request-sequence guard. If a user double-clicks a drilldown icon, the first API response may overwrite breadcrumbs/focus and call `openSession` after the second transition has already started. `openSession` itself uses `openSessionReqSeqRef`, but the surrounding navigation wrapper does not coordinate with it.

### Read-then-write repair
When reusing an existing child session, the service may discover that the stored `bpmn_xml` lacks a `<bpmn:definitions>` wrapper, resolve it again, and save. A navigation that should be read-only therefore mutates state.

---

## Cyclic / implicit dependencies

- `App.jsx` imports `useSessionActivationOrchestration`, which uses `openSession`, which is then wrapped by `openSessionWithLeaveGuard` back in `App.jsx`. Activation state and leave-guard decisions are circularly defined.
- `App.jsx` imports `bindSubprocessNavigationEvents`, passing a ref-based callback that eventually calls back into `App.jsx`’s `navigateToSubprocess`.
- Backend `session_service.py` imports `app._legacy_main` to recompute and dump sessions, tying modern subprocess logic to legacy normalization.

---

## Single-responsibility violations

| Module | Responsibilities it currently owns | Responsibility it should own |
|--------|-----------------------------------|------------------------------|
| `App.jsx` | Router, session activation wrapper, subprocess coordinator, leave guard, context-menu wiring, discussion panel bridges, breadcrumb/focus UI state | Application shell composition only |
| `useSessionRouteOrchestration` | URL parsing, URL writing, history seeding, parent/child history stack shaping | URL ↔ route state mapping only |
| `useSessionActivationOrchestration` | Session loading, snapshot restore, projects/sessions refresh, workspace session open, local session creation | Session activation state machine only |
| `session_service.py` | Session CRUD, analytics, presence, AI endpoints, clipboard, subprocess navigation/lifecycle | Backend application services coordination; subprocess lifecycle should be delegated |
| `bpmn_navigation.py` | Pure BPMN XML utilities | Pure BPMN navigation domain (already close) |
| `bindSubprocessNavigationEvents` | DOM event binding + callback invocation | Event translation only; should not know router |

---

## Risk heat map

| Risk | Likelihood | Impact | Mitigation priority |
|------|------------|--------|---------------------|
| Browser Back breaks user mental model | High | High | 1 — fix history stack / popstate contract |
| Duplicate child sessions corrupt hierarchy | Medium | High | 1 — add lock/unique constraint |
| URL/session desync on failed activation | Medium | Medium | 2 — make activation lead, URL follow |
| N+1 breadcrumb queries slow deep hierarchies | High | Medium | 2 — bulk projector + cache |
| Global focus side-channel breaks SSR/tests | Medium | Medium | 2 — explicit focus intent in props/state |
| God modules block future features (BPMN 123, game mode) | High | High | 1 — separate canvas adapter from session shell |

---

## What must be true after refactoring

1. A transition command is a single unit: resolve target → acquire lock → activate session → update URL → render.
2. The browser history stack contains a reversible parent entry so Back always returns to the parent session.
3. Child session creation is idempotent and protected against races.
4. Breadcrumbs are produced by a read-only projector that can load the stack in bulk.
5. The BPMN stage receives explicit `{ sessionId, focusElementId }` props; no globals.
6. `App.jsx` no longer contains subprocess transition logic.
