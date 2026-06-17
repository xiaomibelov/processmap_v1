# WORKER_REPORT — fix/sub-process-navigation

## Status
✅ Implemented and verified on test stand.

## Commits
- `c8e21003` fix(subprocess-navigation): use single click on call activity to navigate
- `e9ccae51` fix(subprocess-navigation): bind click handler to both viewer and modeler
- `889606a2` test(e2e): add Playwright check for subprocess navigation from canvas
- `f7d37ba6` docs(fix/sub-process-navigation): contour artifacts
- `df7a6bd6` fix(subprocess-navigation): add native DOM click fallback and debug logging

## Changes
### `frontend/src/components/process/BpmnStage.jsx`
- Removed viewer-only inline `v.on("element.click", ...)`.
- Added `bindSubprocessNavigationEvents(v, onNavigateToSubprocessRef)` after `bindViewerStageEvents`.
- Added `bindSubprocessNavigationEvents(m, onNavigateToSubprocessRef)` after `bindModelerStageEvents`.

### `frontend/src/features/process/bpmn/stage/orchestration/bindSubprocessNavigationEvents.js` (new)
- Registers `element.click` handler with priority `3000`.
- Filters elements by `bpmn:CallActivity` type (checks both `el.type` and `el.businessObject?.$type`).
- Calls `onNavigateToSubprocessRef.current(elementId)` when clicked.
- **Native DOM click fallback**: listens on canvas container in capture phase, resolves clicked `.djs-element` via `elementRegistry`, triggers navigation if it is a CallActivity.
- Marks CallActivity SVG groups with `fpc-call-activity-clickable` class after render.
- Optional debug logging via `window.__FPC_DEBUG_SUBPROCESS__ = true` or `localStorage.fpc_debug_subprocess = 1`.

### `frontend/src/features/process/bpmn/stage/styles/subprocessNavigation.css`
- Added `.fpc-call-activity-clickable { cursor: pointer; }`.

### `scripts/e2e/check_subprocess_click.mjs` (new)
- Playwright E2E scenario with org-selection handling, screenshots on failure.

## Verification
### Backend tests
```
29 passed, 4 warnings in 8.58s
```

### Frontend build
```
✓ built in 19.76s
```

### E2E
```
[e2e] current url http://clearvestnic.ru:5177/app?project=0715811eb7&session=547f33d6ea&parent=4fe9e94289&focus=SubTask_1
[e2e] SUCCESS: subprocess navigation from canvas works
```

### Test stand
- Deployed version: `df7a6bd6` on http://clearvestnic.ru:5177.
- Verified via Playwright from local environment.

## Known limitations
- Only `bpmn:CallActivity` triggers drill-down. Embedded `bpmn:SubProcess` shapes are not clickable for navigation in this contour.
