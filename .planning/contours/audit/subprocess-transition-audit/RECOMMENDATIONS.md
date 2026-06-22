# Subprocess Transition Architecture — RECOMMENDATIONS

## Priority 1 — Fix correctness now

### 1.1 Make browser Back return to the parent session
**Problem:** `pushSessionSelectionToUrl` replaces the current entry with `sessionId=""` before pushing the child, so Back lands on the project list.
**Fix:** Stop replacing the parent entry. Push the child entry while preserving the parent entry. Seed the parent entry with internal route state if needed. Update the `popstate` handler to restore the parent session from the URL when the next session differs.
**Effort:** Small (frontend only).
**Owner:** Frontend router + `App.jsx` popstate handler.

### 1.2 Prevent duplicate child sessions
**Problem:** `find_by_parent_element` → `create` is racy.
**Fix:**
- Add unique partial index: `(project_id, parent_session_id, element_id_in_parent)`.
- Wrap find-or-create in a Redis lock keyed by `subprocess:create:{parent_id}:{element_id}`.
- Catch unique-violation / lock errors and return the existing child.
**Effort:** Small.
**Owner:** Backend `SubprocessLifecycleService`.

### 1.3 Remove the global focus side-channel
**Problem:** `window.__SUBPROCESS_FOCUS_ELEMENT_ID__` couples App and renderer via a mutable global.
**Fix:** Pass `focusElementId` explicitly to `BpmnStage` / `ProcessStage` and let the stage scroll/highlight after import.
**Effort:** Small.
**Owner:** Frontend BPMN stage + App shell.

## Priority 2 — Reduce coupling and improve performance

### 2.1 Introduce `SubprocessTransitionCoordinator` (frontend)
**Problem:** `App.jsx` sequences API call → state updates → URL → activation inline.
**Fix:** Create a coordinator that owns the transition state machine (`Idle → Resolving → Activating → Routing → Idle`). It dispatches commands from BPMN stage/context menu and emits events for the router and activation service.
**Effort:** Medium.
**Owner:** Frontend application layer.

### 2.2 Make the router react to activation, not drive it
**Problem:** `navigateToSubprocess` writes URL before activation completes.
**Fix:** `ProcessMapRouter` listens to `sessionActivated` events and writes the URL/history only after successful activation. Failed activation rolls back the route.
**Effort:** Medium.
**Owner:** Frontend routing layer.

### 2.3 Extract `SubprocessLifecycleService` (backend)
**Problem:** `session_service.py` is a god module.
**Fix:** Move `navigate_to_subprocess`, `return_to_parent`, `_resolve_child_bpmn_xml`, `_create_child_session`, `_build_breadcrumbs` into a dedicated service. Keep `bpmn_navigation.py` pure. Add a bulk loader for breadcrumb titles.
**Effort:** Medium.
**Owner:** Backend domain layer.

### 2.4 Bulk-load breadcrumb sessions
**Problem:** `_build_breadcrumbs` loads sessions one by one.
**Fix:** Repository method `load_many(session_ids)`; projector builds crumbs in memory.
**Effort:** Small.
**Owner:** Backend repository + projector.

## Priority 3 — Future-proof the architecture

### 3.1 Introduce a transition event log
**Problem:** No durable trace of drilldown/return events.
**Fix:** Add `subprocess_transitions` table or append-only event stream for observability and recovery.
**Effort:** Medium.
**Owner:** Backend persistence.

### 3.2 Validate `navigation_stack` invariants on read
**Problem:** Stack can drift after copy/paste or manual edits.
**Fix:** Projector validates continuity and tolerates broken frames gracefully.
**Effort:** Small.
**Owner:** Backend projector + frontend breadcrumb component.

## Technology options analysis

The audit considered four classes of solutions for managing subprocess transitions.

### Option A — Custom lightweight orchestrator (recommended)
- **What:** Plain async coordinator in the frontend + a backend transaction script with Redis lock.
- **Pros:** Fits current stack (React + FastAPI + Redis), no new runtime dependency, minimal learning curve, full control over URL/history semantics.
- **Cons:** Must be built and maintained in-house; no ready-made observability.
- **Best for:** Current ProcessMap where transitions are short, synchronous, and tightly coupled to UI/URL.

### Option B — XState for frontend state machine
- **What:** Model `SubprocessTransitionCoordinator` and `SessionActivationService` as XState actors.
- **Pros:** Explicit states, guards, and actions; excellent for complex UI flows; good TypeScript support.
- **Cons:** Adds bundle size and conceptual overhead; backend still needs lock/transaction.
- **Best for:** If the transition flow grows more branches (loading states, error recovery, cancellation, analytics).

### Option C — Temporal / Camunda / Zeebe saga orchestration
- **What:** Treat each transition as a durable saga step.
- **Pros:** Strong guarantees, observability, retries, long-running workflows.
- **Cons:** Heavy operational overhead; overkill for a sub-second synchronous user action; requires new infrastructure.
- **Best for:** Future scenarios like AI-generated subprocess creation requiring human approval, or cross-org async transitions.

### Option D — BPMN engine native subprocess navigation
- **What:** Rely on bpmn-js or a server-side BPMN engine to manage subprocess planes.
- **Pros:** Standard BPMN semantics; could simplify XML handling.
- **Cons:** bpmn-js is a renderer, not a session manager; Camunda/Flowable would replace large parts of ProcessMap's custom session model.
- **Best for:** A ground-up rewrite, not an incremental refactor.

## Recommended combination

**Primary:** Custom lightweight orchestrator (Option A) for the full transition lifecycle.
**Enhancement:** Optionally model the frontend coordinator with XState (Option B) if the team wants explicit state charts and better testability.
**Deferred:** Temporal/Zeebe (Option C) only if subprocess creation becomes long-running or multi-actor.
**Rejected:** BPMN engine native navigation (Option D) because it conflicts with ProcessMap's session-centric data model.

## Implementation roadmap

| Phase | Deliverable | Est. effort | Acceptance criteria |
|-------|-------------|-------------|---------------------|
| 0 | Audit + plan (this contour) | Done | 5-plane proof, separation map, recommendations |
| 1 | Fix Back button + remove global focus | 1–2 days | `subprocess-navigation.spec.mjs` passes with browser-back test |
| 2 | Add unique index + Redis lock | 1 day | Concurrent drilldown creates exactly one child session |
| 3 | Extract frontend coordinator + reactive router | 3–4 days | `App.jsx` no longer contains transition logic; all existing E2E pass |
| 4 | Extract backend `SubprocessLifecycleService` + bulk loader | 2–3 days | Unit tests pass; breadcrumb loads in 1 query |
| 5 | Add transition event log + invariant validation | 2 days | Events persisted; broken stacks handled gracefully |
| 6 | Review, E2E, merge | 2 days | User approval, PR merged, stage verified |

## Open questions for user / next contour

1. Should subprocess child sessions be visible in the project session list, or hidden until drilled into?
2. Should deleting a parent session cascade-delete child subprocess sessions?
3. Is there a requirement to support deep linking to arbitrary levels (grandchild) with a single URL?
4. Does the team want to adopt XState now, or keep plain async coordinators?
