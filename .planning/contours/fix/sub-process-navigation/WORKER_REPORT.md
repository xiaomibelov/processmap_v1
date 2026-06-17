# WORKER_REPORT — fix/sub-process-navigation

## Status
✅ Deployed and verified on test stand.

## Commits
- `c8e21003` fix(subprocess-navigation): use single click on call activity to navigate
- `e9ccae51` fix(subprocess-navigation): bind click handler to both viewer and modeler
- `889606a2` test(e2e): add Playwright check for subprocess navigation from canvas
- `f7d37ba6` docs(fix/sub-process-navigation): contour artifacts
- `df7a6bd6` fix(subprocess-navigation): add native DOM click fallback and debug logging
- `5bdf0847` fix(backend): wrap extracted subprocess XML in bpmn:definitions with proper namespaces
- `fc089edc` fix(backend,e2e): regenerate invalid child XML and robust org selection
- `00271d09` test(e2e): robust org selection wait before BPMN canvas check
- `26df6304` feat(subprocess-navigation): enable drill-down for CallActivity and SubProcess via context menu and preview modal
- `3f1bafd5` fix(backend): allow embedded SubProcess navigation when calledElement is absent
- `8c9d6920` fix(auth): unify refresh cookie path to /, atomic refresh-token writes, and regenerate build-info on deploy
- `0491d9b1` fix(backend): read parent session title from dict in subprocess breadcrumbs
- `282c2ee9` fix(backend): extract user id and admin flag from dict in subprocess request context
- `0491d9b1` fix(frontend): breadcrumb parent name from dict/session object
- `8ca81ebc` fix(frontend): remove legacy fixed height on processShell to prevent canvas collapse
- `2558a34e` fix(frontend): wrap top stack in appTopStack for stable subprocess drill-down layout

## Changes
### Frontend
#### `frontend/src/components/process/BpmnStage.jsx`
- Removed viewer-only inline `v.on("element.click", ...)`.
- Added `bindSubprocessNavigationEvents(v, onNavigateToSubprocessRef)` after `bindViewerStageEvents`.
- Added `bindSubprocessNavigationEvents(m, onNavigateToSubprocessRef)` after `bindModelerStageEvents`.
- Passed `onNavigateToSubprocess` into the BPMN context-menu action executor.

#### `frontend/src/features/process/bpmn/stage/orchestration/bindSubprocessNavigationEvents.js`
- Registers `element.click` handler with priority `3000`.
- Filters navigable elements by `bpmn:CallActivity` and `bpmn:SubProcess` types (checks both `el.type` and `el.businessObject?.$type`).
- Calls `onNavigateToSubprocessRef.current(elementId)` when clicked.
- **Native DOM click fallback**: listens on canvas container in capture phase, resolves clicked `.djs-element` via `elementRegistry`, triggers navigation if it is a CallActivity or SubProcess.
- Marks navigable SVG groups with `fpc-call-activity-clickable` class after render.
- Optional debug logging via `window.__FPC_DEBUG_SUBPROCESS__ = true` or `localStorage.fpc_debug_subprocess = 1`.

#### `frontend/src/features/process/bpmn/stage/styles/subprocessNavigation.css`
- Added `.fpc-call-activity-clickable { cursor: pointer; }`.

#### `frontend/src/features/process/bpmn/context-menu/schema/bpmnContextMenuSchemas.js`
- Added new `call_activity` context-menu kind with `navigate_to_subprocess` action.
- Added `navigate_to_subprocess` action to the `subprocess` kind.

#### `frontend/src/features/process/bpmn/context-menu/bpmnContextMenuActionMatrix.js`
- `resolveBpmnContextTargetKind` returns `call_activity` for `bpmn:CallActivity`.
- Quick-edit name is enabled for `call_activity`.

#### `frontend/src/features/process/bpmn/context-menu/executeBpmnContextMenuAction.js`
- Accepts `onNavigateToSubprocess` and handles `navigate_to_subprocess` action for CallActivity and SubProcess.

#### `frontend/src/features/process/bpmn/context-menu/BpmnSubprocessPreviewModal.jsx`
- Shows a primary **"Перейти в подпроцесс"** button when the preview target is a CallActivity or SubProcess.

#### `frontend/src/features/process/stage/orchestration/buildProcessDiagramOverlayLayersProps.js`
- Passes `onNavigateToSubprocess` through to the subprocess preview modal props.

### Backend
#### `backend/app/services/bpmn_navigation.py`
- Added `_wrap_process_fragment(process_el, source_root)` to wrap extracted `<bpmn:process>` (and normalized `<bpmn:subProcess>`) fragments into a valid `<bpmn:definitions>` document.
- Registers `bpmn`, `bpmndi`, `dc`, `di`, `xsi` namespace prefixes before serialization to avoid `ns0` prefixes.
- Copies the matching `BPMNDiagram`/`BPMNPlane` and shape/edge children when available; otherwise emits a minimal empty diagram so bpmn-js can render with auto-layout.
- Embedded `bpmn:subProcess` fragments are normalized to `<bpmn:process>` so the standalone BPMN viewer can parse them.

#### `backend/app/services/session_service.py`
- `navigate_to_subprocess` now validates that an existing child session's `bpmn_xml` contains a `<bpmn:definitions>` wrapper.
- Legacy child sessions created before the backend fix are automatically re-extracted and updated on the next navigation.
- Fixed embedded `bpmn:subProcess` navigation: `_resolve_child_bpmn_xml` now falls back to `extract_subprocess_xml` even when `calledElement` is absent.

#### `backend/app/_legacy_main.py` and `backend/app/auth.py`
- Fixed constant session logout: legacy auth endpoints now set/clear the `refresh_token` cookie at `Path=/` and explicitly delete the old `Path=/api/auth/` cookie.
- Refresh-token JSON file writes are now atomic (temp-file + rename) to avoid corruption during concurrent refreshes.

#### `backend/app/services/session_service.py`
- Fixed subprocess breadcrumb parent name: `_build_breadcrumbs` now reads `title` from both dict and Pydantic session objects.
- Fixed `_subprocess_request_context` to correctly extract `id` and `is_admin` from the dict stored in `request.state.auth_user`.

#### E2E
- Added `/root/scripts/e2e/check_subprocess_element_click.mjs` — full Playwright scenario for SubProcess drill-down, breadcrumb/back-button, and return to parent.

#### `deploy/deploy.sh` and `frontend/scripts/generate-build-info.mjs`
- Deploy now regenerates `frontend/public/build-info.json` from the actual git SHA/branch/timestamp, so the deployed build metadata is accurate.

#### `frontend/src/components/AppShell.jsx`
- Wrapped `TopBar`, `SubprocessBreadcrumbs`, `AppUpdateBanner` and session nav notice in `.appTopStack` so the top row grows naturally without pushing the workspace out of the viewport.

#### `frontend/src/styles/tailwind.css`
- `.appRoot` now uses `grid-rows-[auto_minmax(0,1fr)_auto]` and `.appTopStack` uses `flex min-h-0 flex-col`, letting the workspace shrink correctly when breadcrumbs appear.

#### `frontend/src/styles/app/02/02-05-layout-shell-topbar.css`
- Removed legacy `height: calc(100vh - 56px - 38px);` from `.processShell` which caused canvas collapse when breadcrumb row appeared.

#### `frontend/src/features/process/SubprocessBreadcrumbs.jsx`
- Renders only when breadcrumb chain has >= 2 items; shows back button, clickable parent crumb(s), and bold current subprocess name.

### E2E
#### `scripts/e2e/check_subprocess_click.mjs`
- Playwright E2E scenario with robust org-selection handling and screenshots on failure.

## Verification
### Backend tests (relevant)
```
15 passed, 5 warnings in 2.09s
```
- `tests/test_subprocess_navigation.py`
- `tests/test_bpmn_navigation_helpers.py`

### Frontend unit tests
```
# tests 42
# pass 42
# fail 0
```

### Frontend build
```
✓ built in 20.60s
```

### E2E — CallActivity drill-down
```
[e2e] current url http://clearvestnic.ru:5177/app?project=0715811eb7&session=547f33d6ea&parent=4fe9e94289&focus=SubTask_1
[e2e] SUCCESS: subprocess navigation from canvas works
```

### E2E — SubProcess drill-down, breadcrumbs and back navigation
```
[e2e] current url http://clearvestnic.ru:5177/app?project=0715811eb7&session=922b770080&parent=8fdd4a0084&focus=SubTask_1
[e2e] child session 922b770080
[e2e] back button visible true
[e2e] breadcrumb text ←E2E SubProcess …>Подпроцесс: SubProcess_1
[e2e] returned to parent ...
[e2e] SUCCESS: SubProcess drill-down and back navigation works
```

### Layout verification
- Manual/browser check: BPMN canvas fills the available workspace both before and after breadcrumb row appears.
- No empty gap below the top header; no canvas collapse after drill-down.

### Test stand
- Deployed version: `2558a34e` on http://clearvestnic.ru:5177.
- Verified via Playwright from local environment.

### Known issues
- Auth 401 in browsers with stale `refresh_token` cookies: clear site cookies/localStorage and log in again. E2E with a clean browser state passes.

## Known limitations
- Drill-down is supported for `bpmn:CallActivity` and `bpmn:SubProcess` shapes.
- Other BPMN link types (sequence/message flow, associations) do not trigger navigation.
