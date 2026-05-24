# audit/diagram-baseline-no-overlays-canvas-profile-v1

## GSD Discipline

- **GSD availability result**: AVAILABLE
- **Commands executed**:
  - `command -v gsd` → `/opt/processmap-test/bin/gsd`
  - `command -v gsd-sdk` → `/opt/processmap-test/bin/gsd-sdk`
  - `test -x /opt/processmap-test/bin/gsd` → `PROCESSMAP_GSD_WRAPPER_FOUND`
  - `test -f /root/.codex/get-shit-done/bin/gsd-tools.cjs` → `CODEX_GSD_TOOLS_FOUND`
  - `find /root/.codex/skills -maxdepth 2 -type d -name 'gsd-*'` → 50+ GSD skills present
- **Mode used**: `GSD_PROCESSMAP_WRAPPER_PLANNING`
- **Confirmation**: implementation не выполнялся
- **Confirmation**: product files не менялись
- **Confirmation**: contour bounded (`audit/diagram-baseline-no-overlays-canvas-profile-v1`)
- **Confirmation**: Agent 2 / Agent 3 gates prepared

## Previous Evidence Source Truth

### Related closed contours (all REVIEW_PASS)

1. **audit/diagram-property-overlays-performance-gsd-v1**
   - Findings: Diagram does NOT remount on tab switch; tab switch is CSS `display` toggle only.
   - Overlay DOM inflation confirmed: 8,025 → 10,795 nodes, 17 → 197 `.djs-overlay`, 0 → 180 `.fpcPropertyOverlay`.
   - `/bpmn/versions?limit=1` spam confirmed (26+ calls in ~4 min).
   - non-edit `PUT /bpmn` observed once.

2. **perf/diagram-property-overlays-viewport-culling-v1**
   - `.fpcPropertyOverlay` count reduced from ~180 to ~70 in default viewport.
   - Pan/zoom counts stable, no duplicates, no PUT/PATCH from pan/zoom.
   - Review confirmed culling responds to viewport size.

3. **fix/bpmn-versions-head-check-dedupe-v1**
   - `/bpmn/versions?limit=1` spam reduced ~80%.
   - Tab switching produced 0 extra limit=1 calls.
   - Overlay interactions produced 0 versions calls.

4. **fix/diagram-non-edit-put-bpmn-guard-v1**
   - 4-layer frontend defense implemented.
   - Diagram idle, pan/zoom, selection/hover, tab switch, XML ↔ Diagram, property panel open produced 0 PUT /bpmn and 0 PATCH /sessions.

5. **perf/diagram-eventbus-listener-and-raf-coalescing-v1**
   - eventBus.on/off cleanup verified, RAF coalescing implemented.
   - readySignal stabilized with primitive instance IDs.
   - Pan/zoom, selection, hover, tab return, stress loop stable.
   - No network mutations.
   - **User reports subjective improvement is small.**

## Source / Runtime Truth

- **Working directory**: `/opt/processmap-test`
- **User**: `root`
- **Host**: `clearvestnic.ru`
- **Timestamp**: `2026-05-15T11:24:58+00:00`
- **Git branch**: `fix/lockfile-sync-test`
- **HEAD**: `a9a9d9c5f468d9da63415306da6d34dcd605aa0d`
- **origin/main**: `d805e1c64c1107b9e3fe6854e031694bf741b187`
- **Git status**: Multiple pre-existing frontend modifications from previous contours; no new changes for this contour.
- **Frontend runtime**: `http://clearvestnic.ru:5180` → HTTP 200 OK
- **API runtime**: `http://clearvestnic.ru:8088` → health `{"ok":true,"status":"ok",...}`
- **Test session** (from previous audits): `wewe` (`4c515d1c6e`) in project `Описание процессов Долгопрудный` (`b1c8a56b6e`)

## Problem Statement

After five successful performance-fix contours, the Diagram/BPMN canvas still feels subjectively slow even when visible property overlays are off. We need a deeper baseline profile to identify the true bottleneck before committing to the next fix contour.

Key questions:
1. Does plain bpmn-js/SVG canvas lag without ProcessMap overlays/decor?
2. Does the ProcessMap decor/overlay pipeline run even when overlays are visually off?
3. Are heavy derived maps recomputed on pan/zoom/selection/render?
4. Is there React render churn in ProcessStage/BpmnStage?
5. Is the cost in JS scripting, SVG layout/repaint, React render, or network?
6. Is there a test-runtime vs production-like behavior gap?
7. Is a different renderer needed, or can the existing pipeline be optimized?

Goal: evidence-based recommendation for the next fix contour.

## Profiling Modes

Agent 2 must compare at minimum 4 modes:

### Mode 1 — Normal current Diagram
- Current runtime without special changes.
- Property overlays state as in normal user mode.
- Measure pan/zoom/selection/hover.

### Mode 2 — Overlays visually OFF
- Use UI toggle or state to turn visible overlays off.
- Check `.fpcPropertyOverlay` count, decor pipeline activity, pan/zoom latency, selection latency.

### Mode 3 — ProcessMap decor pipeline isolated/disabled if possible without product change
- Use existing UI/debug/toggle if available.
- If no safe toggle exists, Agent 2 must NOT modify product code.
- Browser-level inspection / temporary console experiments only if safe and non-persistent.
- Goal: understand behavior without ProcessMap decor pipeline.

### Mode 4 — Pure-ish bpmn-js/SVG baseline
- No property overlays, no extra ProcessMap decorations if possible, no side panel interactions.
- Just pan/zoom/select.
- If impossible without code change, document limitation and source-based estimate.

### Optional Mode 5 — Large vs small session comparison
- Find small and larger diagrams if available.
- Compare element count, SVG node count, pan/zoom latency.
- If only one session available, document.

## Runtime Scenarios

Agent 2 must execute profiling via Playwright/browser where feasible.

### Scenario A — Baseline open
1. Open runtime.
2. Open session with Diagram.
3. Open Diagram tab.
4. Wait loaded/idle.
5. Capture: time to visible canvas, total DOM nodes, SVG node count, `.djs-overlay` count, `.fpcPropertyOverlay` count, console errors, network mutations.

### Scenario B — Pan/zoom latency
1. Perform 5 pan/zoom cycles.
2. Measure: visible lag, time until overlay/SVG stable, DOM count before/after, overlay count before/after, network/mutation count, console errors.

### Scenario C — Selection latency
1. Select 10 BPMN elements.
2. Measure: response time, DOM/overlay counts, React/render symptoms, no mutations.

### Scenario D — Hover latency
1. Hover 10 BPMN elements.
2. Measure: flicker, UI delay, console errors, event/render storm symptoms.

### Scenario E — Tab return
1. Diagram → Analysis → Diagram.
2. Diagram → XML → Diagram.
3. Measure: canvas responsiveness after return, overlay rehydrate behavior, DOM/overlay counts, no network/mutation regression.

### Scenario F — Overlays OFF comparison
1. Turn overlays off if possible.
2. Repeat B/C/D.
3. Compare to overlays ON.
4. Critical question: Is canvas still slow when `.fpcPropertyOverlay` count is 0?

### Scenario G — Decor pipeline source/runtime check
1. Determine if overlay/decor calculations still happen when overlays off.
2. Use source map and browser evidence.
3. If runtime cannot directly show it, document source-level evidence.

### Scenario H — Chrome Performance / trace if feasible
- Capture short trace during pan/zoom and selection.
- Identify: Scripting, Rendering, Painting, Layout, Long Tasks, React-related work if visible.
- If tracing not feasible, document fallback.

## Measurement Plan

### A. DOM/SVG/overlay counts
Browser snippets:
```js
document.querySelectorAll('*').length
document.querySelectorAll('svg *').length
document.querySelectorAll('.djs-overlay').length
document.querySelectorAll('.fpcPropertyOverlay').length
document.querySelectorAll('[data-element-id]').length
```

### B. BPMN element count
- Use bpmn-js APIs if reachable from app/debug globals.
- If not reachable, estimate via DOM/source: `elementRegistry` count, SVG shape count, BPMN XML element count if safe.

### C. Network safety
For each scenario:
- PUT /bpmn count
- PATCH /sessions count
- /bpmn/versions?limit=1 count
- failed requests
- total request count if useful

### D. Main-thread / interaction timing
- `performance.now` around scripted interactions if possible
- Playwright timing around pan/zoom/selection
- Chrome trace summary
- Long task observation if accessible

### E. React/render churn
- Preferred non-invasive: source-level analysis of props/deps
- Use existing debug counters/logs if present
- Do not add permanent debug code

### F. Derived map cost
- Source-level inspect of functions building element/property/decor maps
- Check whether `useMemo` exists, dependencies, rebuild on pan/zoom/selection/tab switch
- Check whether map keys use stable primitive versions/hashes

## Source Map Targets

Agent 2 must fill exact source map for each candidate:

| # | Path | Function/Hook | What it does | Baseline impact? | Runs with overlays off? | Likely cost | Recommendation |
|---|------|---------------|--------------|------------------|------------------------|-------------|----------------|
| 1 | `frontend/src/components/process/BpmnStage.jsx` | `BpmnStage` (forwardRef) | Main diagram component; hosts viewer/modeler, decor APIs, imperative API | High | Yes | High if re-renders | Inspect prop churn and instance lifecycle |
| 2 | `frontend/src/components/ProcessStage.jsx` | `ProcessStage` | Parent shell; state orchestration, tab management, hybrid drawio, save conflict | High | Yes | High if state churn propagates | Inspect tab state, hybrid visible, shellVm |
| 3 | `frontend/src/features/process/bpmn/stage/decor/decorManager.js` | `applyPropertiesOverlayDecor`, `buildOverlayGeometry`, `readOverlayCanvasZoom`, `readElementBounds` | Overlay creation, layout, viewport culling | Direct | Maybe (pipeline may still build) | O(n) over `registry.getAll()` | Verify if called when overlays visually off |
| 4 | `frontend/src/features/process/bpmn/stage/decor/overlayLayoutModel.js` | `buildOverlayGeometry`, `readOverlayCanvasZoom`, `readElementBounds` | Geometry math for overlay positioning | Direct | Maybe | Math + DOM read | Check if invoked even when overlays hidden |
| 5 | `frontend/src/features/process/bpmn/stage/orchestration/useBpmnSettledDecorFanout.js` | `useBpmnSettledDecorFanout` | Fanout hook for notes, stepTime, robotMeta, properties, selection | Direct | Yes (fanout logic runs) | Effect firing on readySignal | Verify readySignal stability; check if fanout runs when overlays off |
| 6 | `frontend/src/features/process/bpmn/stage/orchestration/wireBpmnStageRuntimeEvents.js` | `bindViewerStageEvents`, `bindModelerStageEvents`, `scheduleRafForInstance` | EventBus listener binding, RAF coalescing | Direct | Yes | Listener count + RAF scheduling | Already cleaned up in previous contour; verify no remaining leaks |
| 7 | `frontend/src/features/process/stage/controllers/useBpmnCanvasController.js` | `useBpmnCanvasController` | Canvas controller bridging bpmnRef and hostRef | Medium | Yes | Ref churn | Check dependency array stability |
| 8 | `frontend/src/features/process/stage/orchestration/useProcessStageHybrid.js` | `useProcessStageHybrid` | Hybrid drawio/BPMN orchestration | Medium | Yes (mounted even when hidden) | State updates on hybrid visibility | Check if offscreen work continues |
| 9 | `frontend/src/features/process/stage/orchestration/state/useProcessStageLocalState.js` | `useProcessStageLocalState` | Aggregates mode, action, dialog, panel state | Medium | Yes | Re-composition on any sub-state change | Inspect whether local state churn triggers parent render |
| 10 | `frontend/src/features/process/hooks/useBpmnSync.js` | `saveFromModeler`, hash guards | Sync hook with XML hash early-guard | Low | Yes | Hash computation | Already guarded; verify hash cost is negligible |
| 11 | `frontend/src/features/process/hooks/useDiagramMutationLifecycle.js` | `queueDiagramMutation` | Mutation scheduler with non-edit filters | Low | Yes | Filter logic | Already guarded; verify negligible |
| 12 | `frontend/src/features/process/bpmn/coordinator/createBpmnCoordinator.js` | `doFlush`, `persistRaw`, `isNonExplicitReason` | Coordinator with hash-guarded flush | Low | Yes | Hash + flush logic | Already guarded; verify negligible |

Additional candidate areas to inspect:
- `frontend/src/features/process/stage/ui/ProcessDiagramOverlayLayers.jsx` — BpmnStage wrapper
- `frontend/src/features/process/stage/controllers/useProcessStageShellController.js` — Shell controller
- `frontend/src/features/process/stage/controllers/useProcessStageRuntimeGlue.js` — Runtime glue
- Any `useMemo`/`useCallback`/`useEffect` in BpmnStage/ProcessStage with unstable deps

## Hypotheses

Agent 2 must rank these based on evidence:

| ID | Hypothesis | How to test |
|----|-----------|-------------|
| H1 | Pure bpmn-js/SVG cost is high enough to lag | Mode 4 baseline; compare DOM/SVG counts vs pan/zoom lag |
| H2 | Decor pipeline remains active when overlays visually off | Mode 2 vs Mode 3; source map of `decorManager` calls; console stack traces during pan/zoom |
| H3 | Derived property/decor maps rebuild too often | Source map of `useMemo` deps in BpmnStage/ProcessStage; check if maps rebuild on pan/zoom/selection |
| H4 | React parent render churn (ProcessStage/BpmnStage) | Source inspect prop changes; count re-render triggers; check `useProcessStageLocalState` churn |
| H5 | CSS/SVG repaint cost dominates | Chrome trace if feasible; measure layout/paint time vs scripting |
| H6 | Selection/hover triggers heavy recalculation | Scenario C/D with overlays OFF; check if selection still causes DOM/SVG churn |
| H7 | Tab visible/hidden CSS toggle still runs hidden pipeline | Mode 1 with Analysis tab active; check if Diagram-related effects/hooks continue firing |
| H8 | Test runtime factor amplifies lag | Compare Playwright subjective feel vs user report; check server load |
| H9 | Large diagram scale exceeds bpmn-js comfort zone | Mode 5; element count vs latency correlation |
| H10 | Recent guard layers add small overhead | Source review of 4-layer guard; measure if guard checks run on every event |

## Expected Outputs

Agent 2 must produce inside the contour folder:

- `EXEC_REPORT.md`
- `BASELINE_PROFILE_REPORT.md`
- `SOURCE_MAP.md`
- `RUNTIME_EVIDENCE.md`
- `HYPOTHESES_RANKING.md`
- `NEXT_CONTOUR_RECOMMENDATION.md`
- `READY_FOR_REVIEW`
- `evidence/` directory with screenshots, counts, network summary, console summary, performance trace summary, interaction timings, decor-off comparison

Project Atlas mirror:
`/srv/obsidian/project-atlas/ProcessMap/Audits/Diagram Baseline No Overlays Canvas Profile.md`

If blocked: create `EXEC_BLOCKED.md`, do not create `READY_FOR_REVIEW`.

## Agent 2 Execution Plan

1. Read PLAN.md, RUNTIME_NAVIGATION.md, RUNTIME_PROOF_CHECKLIST.md, STATE.json, previous contour review reports.
2. Capture source/runtime truth (repeat git status, runtime health, DOM baseline).
3. Execute profiling modes/scenarios:
   - Normal current Diagram
   - Overlays visually OFF
   - Decor pipeline isolation if safe
   - Pure-ish bpmn-js baseline if possible
   - Optional small vs large diagram comparison
4. Measure all metrics per Measurement Plan.
5. Rank hypotheses with evidence.
6. Create decision matrix and recommend ONE primary next contour + ONE backup.
7. Do NOT fix code.
8. Create required reports and READY_FOR_REVIEW.

## Agent 3 Review Plan

1. Read all Agent 2 outputs.
2. Verify:
   - reports exist and are concrete
   - runtime evidence is present (counts, network, console)
   - source map is concrete with paths and functions
   - hypotheses ranked with evidence
   - final recommendation is actionable
   - no product code changed
   - no secrets
   - no commit/push/PR/deploy
3. Optional Playwright spot-check: run one pan/zoom scenario, verify counts/network claims.
4. Fail if:
   - report is generic
   - no real runtime evidence
   - no comparison between overlays on/off
   - no source map of derived maps/decor pipeline
   - no recommendation
   - recommendation jumps to canvas/WebGL without evidence
   - product files changed
   - missing Project Atlas audit note
5. If fail: create CHANGES_REQUESTED and REWORK_REQUEST.md.
6. If pass: create REVIEW_REPORT.md and REVIEW_PASS.

## Non-goals

- Do NOT write product code.
- Do NOT merge, deploy, or open a PR.
- Do NOT modify package.json / lock files.
- Do NOT mutate BPMN XML.
- Do NOT mutate durable truth (DB, .env, registries).
- Do NOT modify Product Actions AI.
- Do NOT modify AG-UI.
- Do NOT modify RAG.
- Do NOT create a new optimization fix in this contour.
- Do NOT change Diagram implementation.
- Do NOT change overlay pipeline.
- Do NOT change save/version logic.
- Do NOT do canvas/WebGL rewrite.
- Do NOT run MCP repair.
- Do NOT fix GSD in this contour.
- Do NOT read or output secrets.

## Risks

1. **Working tree contamination**: The `fix/lockfile-sync-test` branch has many pre-existing modifications from previous contours. Agent 2 must not accidentally measure local uncommitted changes as baseline. Prefer deployed runtime (`clearvestnic.ru:5180`) for behavioral measurements.
2. **Overlay toggle state ambiguity**: Previous audit noted "СлоиOFF" toggle may not respond reliably in Playwright. Agent 2 must document actual `.fpcPropertyOverlay` count rather than assuming toggle state.
3. **No direct paint profiling**: If Chrome trace is not feasible, the paint vs scripting split will be inferred from source and DOM counts, not direct measurement.
4. **Single session bias**: Previous audits used session `wewe` (~15–20 visible elements). Large-diagram behavior may differ; extrapolation is approximate.
5. **Subjective vs objective gap**: User perception of slowness may not correlate with measurable metrics. Agent 2 must document both.

## Gates

- [x] Gate 1 — GSD discipline completed
- [x] Gate 2 — Previous Diagram performance evidence read
- [x] Gate 3 — Source/runtime truth captured
- [x] Gate 4 — Profiling scenarios defined
- [x] Gate 5 — Measurement plan defined
- [x] Gate 6 — Source map targets defined
- [x] Gate 7 — Hypotheses defined
- [x] Gate 8 — Non-goals locked
- [x] Gate 9 — Agent 2 executor prompt ready
- [x] Gate 10 — Agent 3 reviewer prompt ready
- [x] Gate 11 — READY_FOR_EXECUTION marker created
