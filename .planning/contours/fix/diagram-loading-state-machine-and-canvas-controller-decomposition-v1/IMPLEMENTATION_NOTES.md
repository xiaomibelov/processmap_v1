# Implementation Notes

## Key Decisions

### 1. Viewer-First Preserved, Ready Signal Added

Previous contour introduced Viewer-first default (`view === "diagram"` → `NavigatedViewer`). This was correct for performance but broke ready-state signaling because only the Modeler runtime called `trackRuntimeStatus`.

**Decision**: Keep Viewer-first. Add explicit `transition("import_success")` after `renderViewer` succeeds. Do NOT revert to Modeler-default.

**Rationale**: Reverting would restore the old heavy Modeler in view mode, undoing the ~300 DOM element reduction. The fix is simpler: wire the missing ready signal.

### 2. State Machine Replaced Boolean

Instead of adding a one-line `setDiagramReady(true)` after Viewer import, we extracted a full state machine.

**Decision**: Create `useDiagramLoadStateMachine` with explicit states, transitions, and timeout.

**Rationale**: Prevents future stuck-loading regressions. Timeout guarantees the UI never stays at skeleton forever. Error state provides diagnostic and retry.

### 3. DiagramLoadBoundary Keeps Children in DOM

Initial implementation of `DiagramLoadBoundary` conditionally rendered children (`isCanvasVisible ? children : null`). This caused `.bpmnCanvas` to be absent from the DOM when `ensureViewer()` ran, so the Viewer was created with a detached container.

**Decision**: Always render children, toggle visibility via `opacity` and `pointer-events`.

**Rationale**: bpmn-js requires the container element to exist at Viewer creation time. Removing and re-adding the canvas div breaks the attachment.

### 4. Minimal BpmnStage Changes

Despite the 5800-line god file, `diagramReady` was only referenced in 3 places:
- State declaration (line 1292)
- Reset effect (line 1501)
- JSX skeleton condition (lines 5770, 5784)

This made replacement safe. No other file referenced `diagramReady`.

### 5. Build Info Fallback Updated

`scripts/generate-build-info.mjs` already sourced `PROCESSMAP_CONTOUR_ID` from env. The stale fallback was the issue.

**Decision**: Update fallback to current contour ID.

**Rationale**: Fastest fix. In production, the env var should be set by CI.

## Trade-offs

| Concern | Decision | Risk |
|---------|----------|------|
| God file not fully decomposed | Only extracted loading UI and state machine | BpmnStage still ~5800 lines, but loading logic is now modular |
| `useBpmnCanvasLifecycle` is thin | Delegates to existing functions via props | May be expanded later; current version satisfies decomposition-first gate |
| Timeout values (10s warm, 20s cold) | Hardcoded in hook, overridable via props | Large diagrams may need longer; can be tuned |
| `transition("import_success")` called after render | Could race with stale guard | Guarded by `isStale()` checks; state machine ignores duplicate transitions |

## Not Done (Out of Scope)

- No backend/schema/storage changes
- No BPMN XML mutation
- No Product Actions / RAG / AG-UI changes
- No stage/prod deploy
- No PR/push/commit
- No broad BpmnStage refactor beyond loading lifecycle
