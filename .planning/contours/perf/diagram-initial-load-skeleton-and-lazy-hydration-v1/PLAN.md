# perf/diagram-initial-load-skeleton-and-lazy-hydration-v1

## GSD Discipline

- GSD availability result: **AVAILABLE**
- Commands executed:
  - `command -v gsd` → `/opt/processmap-test/bin/gsd`
  - `command -v gsd-sdk` → `/opt/processmap-test/bin/gsd-sdk`
  - `test -x /opt/processmap-test/bin/gsd` → `PROCESSMAP_GSD_WRAPPER_FOUND`
  - `test -f /root/.codex/get-shit-done/bin/gsd-tools.cjs` → `CODEX_GSD_TOOLS_FOUND`
  - `find /root/.codex/skills -maxdepth 2 -type d -name 'gsd-*'` → 50+ skills found
  - `find /root/.codex/agents -maxdepth 2 -type d -name 'gsd-*'` → agents found
- Mode used: **GSD_PROCESSMAP_WRAPPER_PLANNING**
- Path includes `/opt/processmap-test/bin` before execution.
- `gsd usage` returned "Unknown command: usage", but `gsd` binary is executable and skills are present.
- Implementation: **NOT performed** by Agent 1.
- Product files: **NOT modified** by Agent 1.
- Contour: **bounded** to frontend performance optimization for Diagram initial load and lazy hydration.
- Decomposition-first: **required and enforced** if god files are touched.
- Agent 2 / Agent 3 gates: **prepared** in this plan.

## Previous Evidence Source Truth

Source contours reviewed:

1. `audit/diagram-post-optimization-runtime-profile-v1` — **REVIEW_PASS**
   - Initial load: **6,540 ms** to diagram-ready.
   - Tab switch (Analysis ↔ Diagram): **4.6–6.4 s** toAnalysis, **3.9–4.1 s** toDiagram.
   - XML ↔ Diagram: **4.1–4.9 s**.
   - Baseline overlays OFF: DOM **8,025** / SVG **2,392**.
   - Network: 0 PUT `/bpmn`, 0 PATCH `/sessions`, 4–5 background `versions?limit=1` polls.
   - Console: 1 pre-existing 401 on `/api/auth/refresh`.
   - Primary next contour: **this contour**.
   - Backup: `perf/diagram-property-panel-render-boundary-v1`.
   - Rejected: `research/diagram-alternative-renderer-canvas-webgl-fit-v1` (zero evidence SVG cannot meet targets).

2. `perf/diagram-derived-maps-and-render-boundary-v1` — **REVIEW_PASS**
   - Extracted derived models from ProcessStage:
     - `diagramDerivedModelHash.js`
     - `useDiagramElementMetaModel.js`
     - `useDiagramDodQualityModel.js`
     - `useDiagramDerivedModel.js` (orchestrator)
     - `buildInterviewDecorSignature.js`
   - ProcessStage reduced: 6,898 → 6,626 lines (-272).
   - BpmnStage flat: 5,759 → 5,765 (+6, within margin).
   - Stable refs via primitive version keys (`bpmnMetaKey`, `nodesKey`, `hybridLayerKey`).

3. `perf/diagram-svg-css-repaint-reduction-v1` — **REVIEW_PASS**
   - 43 drop-shadow rules reduced/removed.
   - 4 box-shadow rules reduced.
   - No React component changes.

Other preserved passes:
- `perf/diagram-property-overlays-viewport-culling-v1`
- `fix/bpmn-versions-head-check-dedupe-v1`
- `fix/diagram-non-edit-put-bpmn-guard-v1`
- `perf/diagram-eventbus-listener-and-raf-coalescing-v1`
- `fix/diagram-decor-pipeline-disable-when-overlays-off-v1`
- `feature/diagram-analytics-layer-selection-lite-decomposition-first-v1`

## Source / Runtime Truth

| Check | Value |
|-------|-------|
| pwd | `/opt/processmap-test` |
| whoami | `root` |
| hostname | `clearvestnic.ru` |
| date | `2026-05-15T17:33:39+00:00` |
| git branch | `fix/lockfile-sync-test` |
| HEAD | `a9a9d9c5f468d9da63415306da6d34dcd605aa0d` |
| origin/main | `d805e1c64c1107b9e3fe6854e031694bf741b187` |
| API health | `{"ok":true,"status":"ok",...}` |
| Frontend | HTTP/1.1 200 OK |
| Runtime frontend | `http://clearvestnic.ru:5180` |
| Runtime API | `http://clearvestnic.ru:8088` |

Uncommitted changes present (pre-existing on `fix/lockfile-sync-test`):
- `frontend/src/components/ProcessStage.jsx` (M)
- `frontend/src/components/process/BpmnStage.jsx` (M)
- `frontend/package.json`, `package-lock.json` (M)
- Multiple other files from prior contours.

## Problem Statement

Initial Diagram load takes **~6.5 seconds** to `diagram-ready`. Tab switch takes **4–6 seconds**. Network is clean. No mutation spam. The bottleneck is **initialization and React hydration churn**, not rendering engine.

Likely sources:
1. **Session shell hydrates too much before Diagram first paint** — ProcessStage.jsx builds massive prop objects and renders NotesPanel + ProcessPanels + all controls before canvas is visible.
2. **BpmnStage waits for non-critical data** — decor pipelines, property overlays, derived models all compete with canvas initialization.
3. **Property panel / side panels hydrate before canvas usable** — NotesPanel.jsx (3,286 lines) with 40+ useMemo hooks runs on every selection and tab switch.
4. **Overlays/decor/analytics modules initialize too early** — `useBpmnSettledDecorFanout` fires all fanouts (notes, stepTime, robotMeta, properties, selection) immediately on `readySignal`.
5. **Parent shell re-renders on tab switch** — ProcessStage.jsx re-computes all overlay layers props, derived models, and panel views when switching Analysis → Diagram.
6. **Large state objects passed through ProcessStage → BpmnStage** — `buildProcessDiagramOverlayLayersProps` constructs a massive `bpmnStageProps` object on every render.
7. **No visible skeleton/loading feedback** — user sees blank or stale state for seconds.

## Critical Load Path Hypotheses

| ID | Hypothesis | Evidence | Confidence |
|----|-----------|----------|------------|
| H1 | ProcessStage rebuilds all derived models and panel props on tab switch, causing 4–6s delay | DOM stable at 8,025 before/after switch, but subjective lag is high; ProcessStage has 6,626 lines of prop drilling | **High** |
| H2 | BpmnStage `diagramReady` is blocked by synchronous decor application after import | `useBpmnSettledDecorFanout` runs 5 fanout effects immediately on `readySignal`; `applyFullBpmnDecorSet` may run synchronously | **High** |
| H3 | NotesPanel (property panel) useMemo storm runs before canvas is visible | 3,286 lines, 40+ useMemo hooks, all fire when `selectedElementId` or `draft` changes during initial load | **Medium-High** |
| H4 | `buildProcessDiagramOverlayLayersProps` creates new object references on every ProcessStage render, causing BpmnStage re-render cascade | Function returns fresh object every call; BpmnStage receives `draft` and many prop objects | **Medium-High** |
| H5 | No skeleton state exists; user perceives load as worse than it is | `diagramReady ? null : <nothing>` — BpmnStage shows nothing until ready | **High** |
| H6 | Derived model hooks (`useDiagramElementMetaModel`, `useDiagramDodQualityModel`) compute heavy maps before canvas first paint | These hooks run in ProcessStage and consume `bpmnMeta`, `nodes`, `draft` | **Medium** |

## Source Map Targets

### Critical Path — Canvas First Paint

| File | Role | Lines | Blocks First Paint | Deferrable | Decomposition Need | Risk |
|------|------|-------|-------------------|------------|-------------------|------|
| `frontend/src/components/ProcessStage.jsx` | Session tab shell; renders BpmnStage, NotesPanel, ProcessPanels, all controls | 6,626 | Yes (parent re-render cost) | Partial (shell stays, panels can defer) | **High** — god file; extraction-first mandatory | High |
| `frontend/src/components/process/BpmnStage.jsx` | BPMN canvas; `diagramReady` state; viewer/modeler init; all decor refs | 5,765 | Yes (core canvas) | Partial (canvas no, decor yes) | **High** — god file; decor logic extraction possible | High |
| `frontend/src/features/process/hooks/useProcessTabs.js` | Tab switch logic with flush, replay, busy states | 1,035 | Yes (tab switch latency) | No (core logic) | Low | Medium |
| `frontend/src/features/process/stage/orchestration/buildProcessDiagramOverlayLayersProps.js` | Builds all BpmnStage props | 297 | Yes (object churn) | Partial (can memoize) | Low | Medium |
| `frontend/src/features/process/bpmn/stage/decor/decorManager.js` | Decor application manager | 1,804 | Yes (synchronous decor) | Partial (defer non-critical) | Medium | Medium |

### Non-Critical — Deferrable After Canvas First Paint

| File | Role | Lines | Blocks First Paint | Deferrable | Decomposition Need | Risk |
|------|------|-------|-------------------|------------|-------------------|------|
| `frontend/src/components/NotesPanel.jsx` | Property/sidebar panel; massive useMemo surface | 3,286 | No | **Yes** | Medium | Medium |
| `frontend/src/features/process/bpmn/stage/orchestration/useBpmnSettledDecorFanout.js` | Fanout: notes, stepTime, robotMeta, properties, selection | 201 | Yes (fires immediately) | **Yes** (all non-selection fanouts) | Low | Low |
| `frontend/src/features/process/bpmn/stage/derived/useDiagramElementMetaModel.js` | Element meta maps (nodePath, flowTier, robotMeta) | ~80 | No | **Yes** | Low (already extracted) | Low |
| `frontend/src/features/process/bpmn/stage/derived/useDiagramDodQualityModel.js` | DOD/quality overlay maps | ~120 | No | **Yes** | Low (already extracted) | Low |
| `frontend/src/features/process/quality/useQualityDerivation.js` | Quality hints/lint | ~130 | No | **Yes** | Low | Low |
| `frontend/src/features/process/coverage/useCoverageDerivation.js` | Coverage matrix | ~150 | No | **Yes** | Low | Low |
| `frontend/src/features/process/stage/ui/ProcessPanels.jsx` | Attention panel, top panels | 643 | No | **Yes** | Low | Low |
| `frontend/src/components/sidebar/ElementSettingsControls.jsx` | Element settings sidebar | 2,436 | No | **Yes** | Medium | Medium |
| `frontend/src/features/process/bpmn/stage/playbackAdapter.js` | Playback overlays | 983 | No | **Yes** | Medium | Medium |
| `frontend/src/features/process/stage/controllers/usePlaybackController.js` | Playback controller | 1,569 | No | **Yes** | Low | Low |

## Runtime Baseline Plan

Agent 2 must measure before/after with these scenarios:

### Scenario A — Cold Open to Diagram
1. Fresh browser context if possible.
2. Navigate to session `wewe` (`4c515d1c6e`) directly if URL known.
3. Measure:
   - `navigationStart`
   - Session shell visible
   - Diagram tab selected
   - Skeleton visible (if implemented)
   - BPMN canvas visible (`.djs-container` present)
   - `diagram-ready` marker present
   - Overlays/decor ready (`.fpcPropertyOverlay`, `.fpcAnalyticsSelected`)
   - Property panel usable

### Scenario B — Warm Tab Switch to Diagram
1. Open session `wewe`.
2. Switch Analysis → Diagram.
3. Measure:
   - Click time
   - First visual feedback
   - Canvas visible
   - `diagram-ready`
4. Repeat 3 times.

### Scenario C — XML ↔ Diagram
1. Diagram → XML → Diagram.
2. Measure same metrics.

### Scenario D — After Canvas First Paint
1. Once canvas visible, test:
   - Pan/zoom
   - Analytics selection
   - Property panel open
2. Verify deferred hydration does not break interactions.

### Scenario E — Network/Mutation Safety
Track:
- PUT `/bpmn`
- PATCH `/sessions`
- `/bpmn/versions?limit=1`
- Failed requests

## Target Loading Model

### Stage 0 — Session Shell
- Show stable page shell immediately.
- No blocking full-screen churn.

### Stage 1 — Diagram Skeleton
- Show lightweight skeleton/placeholder immediately when Diagram tab requested.
- Title/toolbar visible.
- No misleading full reload feel.
- **Implementation**: Add `DiagramSkeleton` component rendered inside BpmnStage when `!diagramReady`.
- **Placement**: Inside `bpmnStack` but before canvas layers, or as an overlay that hides when `diagramReady`.

### Stage 2 — Canvas First Paint
- Import/render BPMN XML.
- Show canvas as soon as usable.
- Pan/zoom available.
- Basic analytics selection available.
- **Implementation**: Ensure `renderViewerDiagram` / `renderModelerDiagram` complete and `setDiagramReady(true)` fires ASAP.
- **Critical**: Do NOT block `setDiagramReady` on decor fanout.

### Stage 3 — Non-Critical Hydration (Deferred)
Deferred after canvas first paint:
- Property overlays (`applyPropertiesOverlayDecor`)
- Robot meta overlays (`applyRobotMetaDecor`)
- Step time overlays (`applyStepTimeDecor`)
- User notes overlays (`applyUserNotesDecor`)
- Property panel details (NotesPanel heavy computation)
- DOD/quality/completeness models
- Heavy secondary tabs/panels
- **Implementation**: Use `requestIdleCallback` (with `setTimeout` fallback) to schedule deferred fanout. Use a staged state machine in BpmnStage or a new `useDeferredBpmnDecor` hook.

### Stage 4 — Idle/Deferred Enhancements
- Low-priority derived maps refresh
- Optional badges
- Background status checks
- **Implementation**: Lowest priority `requestIdleCallback` queue.

## Bounded Implementation Strategy

Agent 2 should implement a **combined Strategy A + C + D**:

### Phase 1: Decomposition (if god files touched)

**Rule**: If ProcessStage.jsx or BpmnStage.jsx must be modified for lazy hydration logic, extract FIRST.

Extracted modules (suggested):
1. `features/process/bpmn/stage/load/DiagramSkeleton.jsx` — lightweight skeleton UI.
2. `features/process/bpmn/stage/load/useDiagramStagedHydration.js` — staged hydration state machine.
3. `features/process/bpmn/stage/load/useDeferredDecorFanout.js` — wraps `useBpmnSettledDecorFanout` with deferred scheduling.
4. `features/process/stage/orchestration/useStableDiagramTabBoundary.js` — memo boundary to isolate Diagram tab from parent shell re-renders.

**Extraction rules**:
- Behavior-preserving first.
- Build and test after each extraction.
- Document in `DECOMPOSITION_REPORT.md`.

### Phase 2: Skeleton + Staged Ready UI (Strategy A)

In BpmnStage.jsx:
- Add `DiagramSkeleton` component.
- Render skeleton when `!diagramReady`.
- Skeleton should show:
  - Gray placeholder blocks for canvas area
  - Subtle pulse animation (CSS-only, no new deps)
  - Optional: "Загрузка диаграммы…" text

In ProcessStage.jsx:
- Wrap BpmnStage host in a stable container that does not re-render on unrelated state changes.

### Phase 3: Defer Non-Critical Decor (Strategy C)

In BpmnStage.jsx or extracted `useDeferredDecorFanout.js`:
- Split decor fanout into:
  - **Immediate**: selection focus (required for interaction)
  - **Deferred**: notes, stepTime, robotMeta, properties overlays
- Use `requestIdleCallback` with `setTimeout(fn, 0)` fallback.
- Maintain `deferredHydrationStage` state: `'canvas_ready' | 'decor_loading' | 'fully_ready'`.

In `useBpmnSettledDecorFanout.js`:
- Add `deferred` flag to each fanout.
- Selection fanout runs immediately.
- Others run after idle callback.

### Phase 4: Parent Shell Render Boundary (Strategy D)

In ProcessStage.jsx:
- Wrap the `bpmnStageHostRef` container and `ProcessStageDiagramControls` in a `React.memo` or custom memo boundary.
- Ensure `buildProcessDiagramOverlayLayersProps` output is memoized (it may already be via `useStableProcessDiagramOverlayLayersProps`).
- Verify that tab switch from Analysis → Diagram does NOT trigger full NotesPanel re-computation unless necessary.
- Consider wrapping `NotesPanel` in its own memo boundary with shallow-prop comparison.

### Phase 5: Property Panel Lazy Hydration (Strategy B)

In NotesPanel.jsx or ProcessStage.jsx:
- NotesPanel can render a lightweight skeleton while `selectedElementId` is stabilizing.
- Heavy `useMemo` computations (e.g., `drawioAnchorValidationState`, `selectedBpmnOverlayCompanionSummary`) can be deferred via `useDeferredValue` or conditional computation.
- **Caution**: NotesPanel is 3,286 lines. Do NOT broad-refactor. Only add boundary/memo at the ProcessStage → NotesPanel prop interface.

## Acceptance Criteria

Agent 3 should pass only if:

1. **Initial load**:
   - User gets immediate visual feedback / skeleton.
   - Canvas first paint improves or is clearly separated from non-critical readiness.
   - Measured before/after times documented in `PERFORMANCE_BEFORE_AFTER.md`.

2. **Tab switch**:
   - Analysis → Diagram and XML → Diagram show faster visible feedback.
   - No 4–6 second blank/heavy reload feel unless documented limitation remains.

3. **Functionality**:
   - Diagram opens.
   - Pan/zoom works after canvas first paint.
   - Analytics selection works.
   - Property panel works after hydration.
   - Overlays work after deferred hydration if enabled.

4. **Safety**:
   - 0 PUT `/bpmn` from load/tab switch/view interactions.
   - 0 PATCH `/sessions` from load/tab switch/view interactions.
   - No versions spam regression.
   - No backend changes.
   - No BPMN XML mutation.
   - No Product Actions / RAG / AG-UI changes.

5. **Previous fixes preserved**:
   - Overlay viewport culling.
   - Selection-lite.
   - Derived maps (primitive key deps).
   - Repaint reduction (CSS).
   - Non-edit mutation guard.

6. **Decomposition**:
   - If ProcessStage/BpmnStage touched, extraction-first was followed.
   - No god-file bloat.

7. **Build/tests**:
   - Build passes.
   - Relevant tests pass or pre-existing failures documented.

## Non-goals

- Do not replace bpmn-js.
- Do not introduce WebGL/canvas renderer.
- Do not change BPMN XML.
- Do not change backend.
- Do not change Product Actions / RAG / AG-UI.
- Do not redesign Diagram UI broadly.
- Do not change registry/reester actions.
- Do not change edit mode semantics except preserving it through lazy load.
- Do not change save/version/history logic.
- Do not add dependencies.
- Do not add permanent debug logs.
- Do not hide real loading failures behind skeleton forever.
- Do not optimize unrelated app surfaces.

## Agent 2 Execution Plan

Agent 2 must:

1. **Read**: PLAN.md, RUNTIME_NAVIGATION.md, RUNTIME_PROOF_CHECKLIST.md, STATE.json, post-optimization audit reports.
2. **Source-map before code**: Confirm critical vs non-critical load path from this plan.
3. **Baseline before code**: Run Scenarios A–E. Record timings, DOM/SVG counts, network safety.
4. **Phase 1: Decomposition if needed**:
   - Extract `DiagramSkeleton.jsx`.
   - Extract `useDiagramStagedHydration.js` or equivalent.
   - Extract `useDeferredDecorFanout.js` if BpmnStage.jsx would otherwise grow.
   - Build and test after extraction.
5. **Phase 2: Skeleton + staged ready**:
   - Add skeleton to BpmnStage.
   - Ensure skeleton hides cleanly when `diagramReady`.
6. **Phase 3: Lazy hydration**:
   - Defer non-critical decor fanout.
   - Add `deferredHydrationStage` state.
   - Use `requestIdleCallback` / `setTimeout` fallback.
7. **Phase 4: Render boundary**:
   - Memoize Diagram tab content in ProcessStage.
   - Stabilize `buildProcessDiagramOverlayLayersProps` output.
8. **Phase 5: Validation**:
   - Build/tests.
   - Playwright runtime before/after.
   - Timing evidence.
   - No regressions.
9. **Create deliverables**:
   - `EXEC_REPORT.md`
   - `DECOMPOSITION_REPORT.md` (if extraction happened)
   - `LOAD_PATH_SOURCE_MAP.md`
   - `PERFORMANCE_BEFORE_AFTER.md`
   - `IMPLEMENTATION_NOTES.md`
   - `READY_FOR_REVIEW`

If blocked: create `EXEC_BLOCKED.md`, no `READY_FOR_REVIEW`.

## Agent 3 Review Plan

Agent 3 must:

1. **Read**: PLAN.md, EXEC_REPORT.md, LOAD_PATH_SOURCE_MAP.md, PERFORMANCE_BEFORE_AFTER.md, IMPLEMENTATION_NOTES.md, DECOMPOSITION_REPORT.md (if present), RUNTIME_PROOF_CHECKLIST.md.
2. **Source review**:
   - Verify bounded implementation.
   - Verify decomposition-first if god files touched.
   - Verify no scope violations.
   - Verify previous fixes preserved.
3. **Playwright runtime review**:
   - Measure cold/warm Diagram load.
   - Measure tab switch.
   - Verify skeleton/visual feedback.
   - Verify canvas first paint.
   - Verify pan/zoom/selection/property panel after hydration.
   - Verify no PUT/PATCH.
   - Verify no versions spam regression.
   - Verify console no new errors.
4. **Strict verdict**:
   - If even minor issue remains: create `CHANGES_REQUESTED`, `REWORK_REQUEST.md`, no `REVIEW_PASS`.
   - If pass: create `REVIEW_REPORT.md`, `REVIEW_PASS`.

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| God-file extraction breaks existing tests | Medium | High | Run tests after each extraction; preserve existing exports/signatures |
| Skeleton CSS conflicts with bpmn-js canvas | Low | Medium | Use absolute-positioned overlay outside `.djs-container` tree |
| Deferred decor causes visible "pop-in" | Medium | Medium | Stage decor gradually; keep selection immediate |
| Tab switch still slow due to deep ProcessStage re-render | High | High | Memo boundary is the primary fix; measure before/after |
| `requestIdleCallback` not called in busy main thread | Medium | Low | Fallback to `setTimeout(fn, 0)` ensures eventual hydration |
| Playwright auth barrier prevents measurement | Medium | Medium | Use localStorage token injection; document if blocked |

## Gates

- [x] Gate 1 — GSD discipline completed
- [x] Gate 2 — Post-optimization audit reviewed
- [x] Gate 3 — Source/runtime truth captured
- [x] Gate 4 — Initial-load critical path source map captured
- [x] Gate 5 — Parent shell / tab-switch source map captured
- [x] Gate 6 — God-file/decomposition risk identified
- [x] Gate 7 — Bounded lazy-hydration strategy defined
- [x] Gate 8 — Acceptance criteria defined
- [x] Gate 9 — Non-goals locked
- [x] Gate 10 — Agent 2 executor prompt ready
- [x] Gate 11 — Agent 3 reviewer prompt ready
- [ ] Gate 12 — READY_FOR_EXECUTION marker created (final step)
