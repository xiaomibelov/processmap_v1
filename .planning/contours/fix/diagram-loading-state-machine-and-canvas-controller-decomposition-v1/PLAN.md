# fix/diagram-loading-state-machine-and-canvas-controller-decomposition-v1

## GSD Discipline

- GSD command: `/opt/processmap-test/bin/gsd` — FOUND
- GSD tools: `/root/.codex/get-shit-done/bin/gsd-tools.cjs` — FOUND
- Skills directory: `/root/.codex/skills` — 90+ gsd-* skills found
- Agents directory: `/root/.codex/agents` — found
- Mode: **GSD_PROCESSMAP_WRAPPER_PLANNING**
- Implementation: NOT started
- Product files: NOT modified
- Contour: bounded to Diagram loading lifecycle + visible version marker
- Decomposition-first: REQUIRED
- Agent 2 / Agent 3 gates: prepared in this plan

## Source / Runtime Truth

### Workspace
- pwd: `/opt/processmap-test`
- user: `root`
- host: `clearvestnic.ru`
- date: `2026-05-15T21:40:53+00:00`

### Git
- branch: `fix/lockfile-sync-test`
- HEAD: `a9a9d9c5f468d9da63415306da6d34dcd605aa0d`
- origin/main: `d805e1c64c1107b9e3fe6854e031694bf741b187`
- dirty files: 34 modified (pre-existing from prior contours), plus untracked planning/tools files
- diff stat: ~2,530 insertions / ~1,496 deletions across frontend, docker-compose, .env

### Runtime (clearvestnic.ru:5180)
- Gateway: `processmap_test-gateway-1` → `0.0.0.0:5180->80/tcp`
- API health: `{"ok":true,"status":"ok",...}`
- 5180 HTTP: `200 OK`
- build-info.json:
  ```json
  {
    "branch": "fix/lockfile-sync-test",
    "sha": "a9a9d9c5f468d9da63415306da6d34dcd605aa0d",
    "shaShort": "a9a9d9c",
    "timestamp": "2026-05-15T21:26:58.810Z",
    "contourId": "fix/diagram-visible-version-and-large-canvas-lag-v1",
    "dirty": true,
    "host": "clearvestnic.ru"
  }
  ```
- **CRITICAL**: `contourId` in build-info.json is STALE — it still contains `fix/diagram-visible-version-and-large-canvas-lag-v1` instead of the current contour. This proves the runtime was built by a previous contour and may carry stale assumptions.
- Served JS: `assets/index-BPfA3QiR.js` (matches local dist)
- Served CSS: `assets/index-N6LiXuk7.css` (matches local dist)

### Docker
- processmap_test-gateway-1: Up 29 min
- processmap_test-frontend-1: Up 4 hours
- processmap_test-api-1: Up 36 hours
- processmap_test-postgres-1: Up 36 hours (healthy)
- processmap_test-redis-1: Up 36 hours (healthy)

## User Screenshot Regression

### Observation
- URL: `http://clearvestnic.ru:5180`
- Diagram tab selected
- Toolbar visible
- Canvas area shows grey skeleton/placeholder
- Text visible: **"Загрузка диаграммы…"**
- Diagram is NOT rendered
- Canvas is NOT usable

### Significance
This is a **P0 regression**. The application is in a broken state for end users. Previous Agent 3 reviews issued REVIEW_PASS, yet the user-visible state remains stuck at loading. This contour must treat all prior REVIEW_PASS verdicts as insufficient and establish new, stricter gates.

### Hard Acceptance
- Loading skeleton may appear briefly (≤ 2s warm, ≤ 5s cold).
- After reasonable timeout, canvas must either:
  1. Render diagram and become usable; or
  2. Show explicit error state with diagnostic and retry action.
- **Endless "Загрузка диаграммы…" is FAILURE.**

### Review Timeout Policy
- Warm Diagram tab switch: **10 seconds**
- Cold session open: **20 seconds**
- If still stuck: **CHANGES_REQUESTED** — no exceptions.

## Previous Contours / Contradictory Review Evidence

### Prior Contours Reviewed
1. `fix/diagram-visible-version-and-large-canvas-lag-v1` → REVIEW_PASS (Agent 3, 2026-05-15T21:30Z)
2. `fix/diagram-5180-version-proof-and-canvas-lag-regression-v1` → REVIEW_PASS
3. `fix/diagram-canvas-reload-loop-and-lag-regression-v1` → REVIEW_PASS
4. `perf/diagram-initial-load-skeleton-and-lazy-hydration-v1` → REVIEW_PASS (with auth barrier caveat)

### Contradictions
- Previous reviews claimed:
  - "Viewer-first improved pan/zoom and version marker"
  - "No skeleton flash on return to Diagram"
  - "Diagram layer returned to Viewer mode after XML tab"
  - "0 new console errors"
- User screenshot **directly contradicts** these claims: canvas is stuck at loading.
- Possible explanations:
  - Agent 3 Playwright auth failed on some contours, relying on Agent 2 evidence only.
  - Review tested a different code path or cached state.
  - Viewer-first changes broke ready-state signaling in a way not caught by previous tests.
  - `buildProcessDiagramOverlayLayersProps.js` now passes `view: "diagram"` but `BpmnStage` render effect may not correctly set `diagramReady` for the Viewer path.

### Policy
- **Do not trust previous REVIEW_PASS.**
- Fresh browser proof is mandatory.
- Screenshot-state failure blocks REVIEW_PASS unconditionally.

## Visible Version Requirement

### Current State
- Version marker exists in `AppShell.jsx` footer: `Версия v1.0.126 · a9a9d9c · 15.05.2026, 21:26`
- Fixed bottom-right badge also exists (small, `zIndex: 9999`).
- **Problem**: When Diagram is stuck loading, the footer may be below the fold or obscured. The bottom-right badge is tiny and easily missed in screenshots.

### Requirement
- Version marker must be visible **in the same screenshot** that shows the Diagram tab.
- If footer/bottom badge is not clearly visible during loading, a **top/header/debug chip** must be added.
- Marker must show:
  - App version (e.g. `v1.0.126`)
  - Git short SHA
  - Build timestamp
  - Contour/build id
- `build-info.json` and `window.__PROCESSMAP_BUILD_INFO__` must be preserved.
- `contourId` in build-info must be updated to reflect the **current contour** at build time.

### Target Placement
- `TopBar.jsx` near ProcessMap brand, OR
- A dedicated `DiagramRuntimeVersionBadge` rendered inside the Diagram toolbar area, OR
- ProcessStageHeader area when Diagram tab is active.

## Diagram Loading Lifecycle Problem

### Root Problem Statement
The Diagram loading lifecycle is **not trustworthy**:
1. `diagramReady` is a single `useState(false)` boolean in `BpmnStage.jsx`.
2. Viewer-first changes introduced separate `viewerReadyRef` and `modelerReadyRef`.
3. The render effect branches on `view === "diagram"` → Viewer, `view === "editor"` → Modeler.
4. It is **unclear** whether `setDiagramReady(true)` is ever called after Viewer `importXML` succeeds.
5. If `diagramReady` stays `false`, `DiagramSkeleton` ("Загрузка диаграммы…") remains forever.
6. There is **no timeout**, **no error boundary**, and **no explicit state machine**.
7. Previous contours added `useDiagramStagedHydration` and `useDeferredDecorFanout`, but these may not integrate correctly with the new Viewer-first path.

### Evidence from Source Map
```
BpmnStage.jsx:1292   const [diagramReady, setDiagramReady] = useState(false);
BpmnStage.jsx:1501   setDiagramReady(false);
BpmnStage.jsx:1721   setDiagramReady((prev) => (prev === nextReady ? prev : nextReady));
BpmnStage.jsx:5770   {diagramReady ? ( ... canvas ... ) : null}
BpmnStage.jsx:5784   {!diagramReady ? <DiagramSkeleton /> : null}
```

```
BpmnStage.jsx:1370   const modelerReadyRef = useRef(false);
BpmnStage.jsx:1371   const viewerReadyRef = useRef(false);
```

```
BpmnStage.jsx:5413   const viewerHasDefinitions = !!viewerRef.current && hasDefinitionsLoaded(viewerRef.current);
BpmnStage.jsx:5414   const viewerReady = !!viewerRef.current && !!viewerReadyRef.current && viewerHasDefinitions;
```

**Hypothesis**: `viewerReady` is computed locally inside the render effect, but `setDiagramReady` may only be triggered by Modeler-specific callbacks (e.g. `modelerReadyRef` → `setDiagramReady(true)`), leaving the Viewer path without a ready signal.

## Source Map Targets

### A. BpmnStage.jsx — PRIMARY TARGET
- **Path**: `frontend/src/components/process/BpmnStage.jsx`
- **Role**: God file containing all viewer/modeler lifecycle, diagramReady state, skeleton condition
- **Loading relation**: `diagramReady` boolean controls skeleton; `setDiagramReady(false)` resets; `setDiagramReady(nextReady)` updates
- **Current risk**: ~5,800 lines. Single boolean for readiness. Viewer/Modeler paths may not both signal ready.
- **Extraction target**: Extract loading state machine, canvas lifecycle controller, import controller
- **Safe change area**: Lines ~1290-1330 (state decls), ~1500-1730 (ready logic), ~5360-5430 (render effect), ~5770-5784 (JSX skeleton)

### B. ProcessStage.jsx — TAB SHELL
- **Path**: `frontend/src/components/ProcessStage.jsx`
- **Role**: Parent shell that hosts BpmnStage, manages tabs, passes `view` prop
- **Loading relation**: `tab === "diagram"` triggers Diagram view; `flushFromActiveTab` on switch
- **Current risk**: Tab switch may reset or delay BpmnStage readiness via prop changes
- **Extraction target**: `useProcessTabs` stabilization if tab switch causes remount/reset
- **Safe change area**: Lines ~1970 (flush), ~2899-3355 (BpmnStage props), ~5045-5102 (leave flush), ~6239-6256 (tab rendering)

### C. DiagramSkeleton.jsx — SKELETON UI
- **Path**: `frontend/src/features/process/bpmn/stage/load/DiagramSkeleton.jsx`
- **Role**: Pure UI component showing "Загрузка диаграммы…"
- **Loading relation**: Rendered when `!diagramReady`
- **Current risk**: None by itself, but it is the visible symptom
- **Extraction target**: Keep as-is or wrap inside new `DiagramLoadBoundary`
- **Safe change area**: Whole file (~12 lines)

### D. useDiagramStagedHydration.js — STAGED HYDRATION
- **Path**: `frontend/src/features/process/bpmn/stage/load/useDiagramStagedHydration.js`
- **Role**: State machine: `loading` → `canvas_ready` → `decor_loading` → `fully_ready`
- **Loading relation**: Provides staged callbacks; used by deferred fanout
- **Current risk**: May not be wired to Viewer import success; may be orphaned by previous contour refactors
- **Extraction target**: Merge into unified loading state machine or keep if properly integrated
- **Safe change area**: Whole file (~49 lines)

### E. useDeferredDecorFanout.js — DEFERRED FANOUT
- **Path**: `frontend/src/features/process/bpmn/stage/load/useDeferredDecorFanout.js`
- **Role**: Wraps `useBpmnSettledDecorFanout` with `requestIdleCallback` deferral
- **Loading relation**: Invokes `onCanvasReady` / `onDecorLoading` callbacks
- **Current risk**: May delay or swallow ready signals; fallback timers may race
- **Extraction target**: Evaluate if it is part of the stuck-loading cause
- **Safe change area**: Whole file (~158 lines)

### F. buildProcessDiagramOverlayLayersProps.js — VIEW PROP
- **Path**: `frontend/src/features/process/stage/orchestration/buildProcessDiagramOverlayLayersProps.js`
- **Role**: Builds `bpmnStageProps` including `view: "diagram" | "editor" | "xml"`
- **Loading relation**: `view` determines BpmnStage render branch
- **Current risk**: Already corrected in previous contour to pass `"diagram"` for Diagram tab
- **Extraction target**: None needed; verify it stays correct
- **Safe change area**: Line ~51

### G. AppShell.jsx / TopBar.jsx — VERSION MARKER
- **Paths**: `frontend/src/components/AppShell.jsx`, `frontend/src/components/TopBar.jsx`
- **Role**: Footer version link + bottom-right badge (AppShell); brand header (TopBar)
- **Loading relation**: Footer may be hidden during loading; badge is tiny
- **Current risk**: Version not clearly visible in screenshot state
- **Extraction target**: Add persistent top/header/debug chip or TopBar augmentation
- **Safe change area**: AppShell lines ~352-368; TopBar near brand area

### H. useProcessTabs.js — TAB CONTROLLER
- **Path**: `frontend/src/features/process/hooks/useProcessTabs.js`
- **Role**: Manages active tab, save-on-switch, projection recompute
- **Loading relation**: Tab switch may trigger save/flush that stalls diagram readiness
- **Current risk**: Pre-existing ~2-3s tab switch latency; may reset loading state
- **Extraction target**: Stabilize if tab switch causes BpmnStage remount or ready reset
- **Safe change area**: Verify no forced remount on `tab` change

## Decomposition-First Plan

### Phase 1 — Source Forensic (Agent 2)
Before any code change, Agent 2 must:
1. Read BpmnStage.jsx lines ~1290-1730 (ready state declarations and setters).
2. Read BpmnStage.jsx lines ~5360-5430 (render effect branching on `view`).
3. Trace every call to `setDiagramReady`.
4. Determine: when `view === "diagram"`, what event/callback sets `diagramReady = true`?
5. Determine: does `viewerReadyRef.current = true` ever trigger `setDiagramReady(true)`?
6. Determine: does `useDiagramStagedHydration` or `useDeferredDecorFanout` block ready state?

### Phase 2 — Extract Loading State Machine
Create `frontend/src/features/process/bpmn/stage/load/useDiagramLoadStateMachine.js`:
- States: `idle`, `initializing`, `importing`, `canvas-ready`, `hydrating-secondary`, `ready`, `error`, `timeout`
- Replace `diagramReady` boolean with derived state from the machine.
- Expose: `loadState`, `isCanvasVisible`, `isSkeletonVisible`, `isError`, `errorReason`, `lastTransitionAt`
- Integrate with both Viewer and Modeler import success/error callbacks.
- Add explicit timeout (10s warm / 20s cold) transitioning to `timeout` state.

### Phase 3 — Extract Canvas Lifecycle Controller
Create `frontend/src/features/process/bpmn/stage/load/useBpmnCanvasLifecycle.js`:
- Responsibilities:
  - `ensureViewer()` — create NavigatedViewer once per container key
  - `ensureModeler()` — create Modeler once per container key
  - `importXml(viewerOrModeler, xml)` — track in-flight, publish success/error
  - `destroy()` — clean teardown
  - `getInstance(kind)` — stable access
- Keep refs stable; do not recreate on unrelated prop changes.
- Publish events: `canvas:lifecycle:import:start`, `:success`, `:error`, `:destroy`

### Phase 4 — Extract DiagramLoadBoundary
Create `frontend/src/features/process/bpmn/stage/load/DiagramLoadBoundary.jsx`:
- Responsibilities:
  - Render `DiagramSkeleton` ONLY for `initializing | importing` states AND within timeout.
  - Render canvas container for `canvas-ready | ready | error | timeout`.
  - Render `DiagramRuntimeErrorPanel` for `error | timeout` with diagnostic and retry.
  - Never hide already-visible canvas during secondary hydration.

### Phase 5 — Extract/Fix Visible Version Marker
Modify `TopBar.jsx` or create `frontend/src/features/process/stage/ui/DiagramRuntimeVersionBadge.jsx`:
- Show `appVersion + shaShort + timestamp + contourId`
- Render in top toolbar or ProcessStageHeader when Diagram tab active.
- Must be visible even when canvas is loading.
- Update `scripts/generate-build-info.mjs` to accept `PROCESSMAP_CONTOUR_ID` from env (already partially done, but verify it writes current contour).

### Phase 6 — Fix Ready Event for Viewer-First
- Ensure Viewer `importXML` success sets `canvas-ready` / `ready`.
- Ensure Modeler `importXML` success also sets `ready` when in edit mode.
- Do NOT require Modeler ready when `view === "diagram"`.
- Separate `viewerReady` and `modelerReady` internally, but expose unified `loadState`.

### Phase 7 — Validate & Proof
- Rebuild 5180.
- Fresh browser screenshot.
- Verify version marker visible.
- Verify no stuck loading.
- Verify pan/zoom, selection, property panel.
- Verify tab switch stability.

## Runtime Reproduction Plan

### Scenario A — Screenshot Reproduction
1. Fresh browser context (Playwright or manual).
2. Navigate to `http://clearvestnic.ru:5180/?cb=<timestamp>`.
3. Authenticate if needed.
4. Open session `wewe` in project `Описание процессов Долгопрудный` (or any session with Diagram).
5. Click Diagram tab.
6. Observe: is "Загрузка диаграммы…" visible? For how long?
7. Screenshot after 10s.
8. Record result.

### Scenario B — Warm Tab Switch Stuck
1. From Analysis tab, switch to Diagram.
2. Wait 10 seconds.
3. If still "Загрузка диаграммы…" → record FAILURE.
4. From XML tab, switch to Diagram.
5. Wait 10 seconds.
6. Same failure check.

### Scenario C — State Counters (Dev/Test)
Record:
- BpmnStage mount count
- `ensureViewer()` call count
- `ensureModeler()` call count
- `importXML` call count (viewer + modeler)
- `diagramReady` transitions (or new `loadState` transitions)
- Skeleton visible duration
- `.djs-container` count
- `svg` element count

### Scenario D — After Fix
Repeat A-C. Must pass:
- Canvas visible within timeout
- No endless loading
- Version marker visible
- Pan/zoom usable
- Selection-lite works
- No PUT/PATCH from view interactions
- No console JS errors

## Instrumentation / Counters Plan

Agent 2 may add a **debug-safe** runtime diagnostic object:
- Object: `window.__PM_DIAGRAM_RUNTIME__`
- Content (non-secret):
  ```js
  {
    loadState: "ready",
    sessionId: "...",
    runtimeKey: "viewer|modeler",
    viewerReady: true,
    modelerReady: false,
    importCount: 1,
    lastImportStartedAt: "...",
    lastImportFinishedAt: "...",
    lastError: null,
    canvasReady: true,
    skeletonVisible: false,
    diagramReadyTransitions: [...]
  }
  ```
- Must NOT include BPMN XML content.
- Must NOT include tokens/secrets.
- Gate behind `import.meta.env.DEV || window.location.host === "clearvestnic.ru:5180"`.
- No permanent noisy `console.log` spam.

## Hypotheses

| Rank | Hypothesis | Likelihood | Test |
|------|-----------|------------|------|
| H1 | `setDiagramReady(true)` is only triggered by Modeler-ready callback; Viewer import success does not flip it. | **HIGH** | Search all `setDiagramReady` callers; verify Viewer path has a caller. |
| H2 | `diagramReady` is reset to `false` by a parent re-render or tab switch, and Viewer path never re-flips it. | HIGH | Trace `setDiagramReady(false)` callers; check tab switch / prop change. |
| H3 | `importXML` fails silently in Viewer path; error swallowed, skeleton remains. | MEDIUM | Add error logging around Viewer `importXML`; check console. |
| H4 | Viewer/Modeler lifecycle split broke ready event wiring. Previous modeler callback was reused but viewer callback is missing or mis-wired. | HIGH | Compare `bindViewerStageEvents` vs `bindModelerStageEvents` ready handlers. |
| H5 | BpmnStage remounts on tab switch, resetting all refs/state. | MEDIUM | Check `.djs-container` count stability; check React key on BpmnStage. |
| H6 | `useProcessTabs` save-on-switch delays or blocks diagram readiness. | MEDIUM | Profile tab switch sequence; check if flush blocks render. |
| H7 | Visible version marker is in footer/badge and not visible during loading. | CONFIRMED | Screenshot shows toolbar but no obvious version in top area. |
| H8 | 5180 serves correct build, but UI readiness is broken. Version proof ≠ canvas ready. | CONFIRMED | build-info.json SHA matches HEAD, but canvas stuck. |
| H9 | Large SVG is slow after ready, but current problem is **loading-state failure first**. | MEDIUM | Separate concerns: fix loading state machine before optimizing SVG perf. |

## Bounded Fix / Rollback Strategy

### Allowed Fixes (Option A-E, G)
- **A**: Replace `diagramReady` boolean with explicit `useDiagramLoadStateMachine`.
- **B**: Fix ready event for Viewer-first — Viewer `importXML` success must set canvas ready.
- **C**: Keep canvas container mounted after first paint; skeleton must not hide canvas.
- **D**: Add timeout/error boundary — show diagnostic after timeout.
- **E**: Add top visible version marker.
- **G**: Stabilize `useProcessTabs` if tab switch resets loading state.

### Conditional Fix (Option F)
- **F**: Revert viewer-first ONLY if it is proven irreparably broken for readiness signaling.
- Condition: If H1/H4 are true and cannot be fixed by adding a Viewer-ready callback, revert to Modeler-default for diagram view, but keep selection-lite improvements if possible.
- Do NOT preserve broken viewer-first just because it improved metrics.

### Rollback
- If any extraction causes test failures or runtime instability:
  - Revert extracted modules.
  - Fall back to in-place minimal fix inside BpmnStage.jsx (still bounded to ready-state wiring).
  - Document rollback in EXEC_BLOCKED.md.

## Acceptance Criteria

Agent 3 may pass only if ALL are true:

### Version
1. Visible version marker is visible in top/header or clearly visible while Diagram loads.
2. Marker includes app version + short SHA + timestamp/build info.
3. `/build-info.json` matches source HEAD.
4. `window.__PROCESSMAP_BUILD_INFO__` matches source HEAD.
5. `contourId` in build-info matches **this contour**.
6. Fresh browser 5180 proof captured.

### Loading
7. Diagram does not remain stuck at "Загрузка диаграммы…".
8. Warm Diagram tab must render canvas or error within 10 seconds.
9. Cold Diagram open must render canvas or error within 20 seconds.
10. If error occurs, it must be explicit and diagnostic, not endless spinner.
11. Skeleton does not flap repeatedly.
12. Canvas does not disappear/reappear repeatedly.
13. `.djs-container` count stable after ready.

### Lifecycle
14. `importXML` / viewer / modeler init not repeated unnecessarily.
15. Viewer-ready / modeler-ready / diagram-ready states are documented.

### Interaction
16. Pan/zoom works after ready.
17. Selection-lite works.
18. Property panel works.
19. Overlays-off scenario works.
20. No bpmn-js edit handles in view mode unless edit mode explicitly active.

### Safety
21. 0 PUT `/bpmn` from view interactions.
22. 0 PATCH `/sessions` from view interactions.
23. No versions spam regression.
24. No backend/schema/storage changes.
25. No BPMN XML mutation.
26. No Product Actions/RAG/AG-UI changes.
27. Build/tests pass.

### Strict
28. If Agent 3 sees the screenshot state (stuck loading) after timeout → **CHANGES_REQUESTED**.
29. If only source review passes but browser stuck → **CHANGES_REQUESTED**.
30. If version marker is hidden/not visible → **CHANGES_REQUESTED**.
31. If no material user-visible improvement → **CHANGES_REQUESTED**.

## Non-goals

- No Product Actions changes.
- No registry/reестр changes.
- No AG-UI changes.
- No RAG changes.
- No stage/prod deploy.
- No PR/merge/push.
- No backend/schema/storage unless blocked and explicitly justified.
- No BPMN XML semantics change.
- No WebGL/canvas replacement.
- No cosmetic-only skeleton change.
- No unrelated CSS tweaks.
- No broad app refactor outside Diagram loading/version surface.

## Agent 2 Execution Plan

1. **Read** PLAN.md, RUNTIME_NAVIGATION.md, RUNTIME_PROOF_CHECKLIST.md, STATE.json, latest contour reports.
2. **Capture** source/runtime truth (branch, HEAD, dirty files, build marker).
3. **Reproduce** stuck loading on 5180 with fresh browser + screenshot.
4. **Forensic** BpmnStage.jsx ready-state wiring:
   - Every `setDiagramReady` call site.
   - Viewer import success path.
   - Modeler import success path.
   - `useDiagramStagedHydration` integration.
5. **Decompose**:
   - Extract `useDiagramLoadStateMachine`.
   - Extract `useBpmnCanvasLifecycle` (or refactor existing `ensureViewer`/`ensureModeler`).
   - Create `DiagramLoadBoundary`.
   - Create/move `DiagramRuntimeVersionBadge`.
6. **Fix**:
   - Wire Viewer `importXML` success to state machine.
   - Add timeout/error state.
   - Ensure top version marker.
   - Fix or revert viewer-first if unfixable.
7. **Validate**:
   - Build/tests.
   - Fresh 5180 browser proof.
   - All acceptance criteria.
8. **Report**:
   - EXEC_REPORT.md
   - DECOMPOSITION_REPORT.md
   - LOADING_STATE_MACHINE_REPORT.md
   - RUNTIME_VERSION_VISIBLE_PROOF.md
   - STUCK_LOADING_ROOT_CAUSE.md
   - RUNTIME_BEFORE_AFTER.md
   - IMPLEMENTATION_NOTES.md
   - READY_FOR_REVIEW

If blocked: EXEC_BLOCKED.md, no READY_FOR_REVIEW.

## Agent 3 Review Plan

1. **Read** all Agent 2 reports.
2. **Source review**: verify extraction quality, no scope violations.
3. **Runtime version review**:
   - Fresh 5180, cache-bust.
   - `build-info.json` SHA matches HEAD.
   - `contourId` matches this contour.
   - `window.__PROCESSMAP_BUILD_INFO__` verified.
   - UI marker visible in top/header.
4. **Playwright/browser review**:
   - Open Diagram tab.
   - Wait up to 10s warm / 20s cold.
   - **FAIL** if still "Загрузка диаграммы…".
   - Test tab switch (Analysis ↔ Diagram, XML ↔ Diagram).
   - Test pan/zoom.
   - Test selection/property panel.
   - Inspect network: 0 PUT/PATCH from view.
   - Inspect console: 0 new errors.
5. **Verdict**:
   - Pass → REVIEW_REPORT.md + REVIEW_PASS.
   - Fail → CHANGES_REQUESTED with specific evidence.

## Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| BpmnStage.jsx is 5,800+ line god file | HIGH | Decomposition-first: extract modules before modifying logic. |
| Previous viewer-first changes intertwined | HIGH | Forensic trace before fix; revert if unfixable. |
| Playwright auth barrier (previously failed) | MEDIUM | Use manual browser + curl + DOM snippets for proof. |
| Dirty working tree (34 files) | MEDIUM | Stay bounded; do not touch unrelated dirty files. |
| build-info contourId stale | LOW | Fix `generate-build-info.mjs` to use current env var. |
| Tab switch latency masks fix | MEDIUM | Test cold open separately from warm tab switch. |
| Tests depend on `diagramReady` boolean | MEDIUM | Update tests to match new state machine; keep backward compat if possible. |

## Gates

- [x] Gate 1 — GSD discipline completed
- [x] Gate 2 — source/runtime truth captured
- [x] Gate 3 — user screenshot regression documented
- [x] Gate 4 — runtime version proof requirement defined
- [x] Gate 5 — Diagram loading lifecycle source map targets defined
- [x] Gate 6 — decomposition-first module plan defined
- [x] Gate 7 — stuck-loading reproduction plan defined
- [x] Gate 8 — loading state machine acceptance criteria defined
- [x] Gate 9 — rollback/rework strategy defined
- [x] Gate 10 — Agent 2 executor prompt ready
- [x] Gate 11 — Agent 3 reviewer prompt ready
- [x] Gate 12 — READY_FOR_EXECUTION marker created
