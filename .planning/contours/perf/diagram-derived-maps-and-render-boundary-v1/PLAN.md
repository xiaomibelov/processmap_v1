# perf/diagram-derived-maps-and-render-boundary-v1

## GSD Discipline

- GSD availability check performed:
  - `command -v gsd` → `/opt/processmap-test/bin/gsd` ✅
  - `command -v gsd-sdk` → `/opt/processmap-test/bin/gsd-sdk` ✅
  - `test -x /opt/processmap-test/bin/gsd` → `PROCESSMAP_GSD_WRAPPER_FOUND` ✅
  - `test -f /root/.codex/get-shit-done/bin/gsd-tools.cjs` → `CODEX_GSD_TOOLS_FOUND` ✅
  - `find /root/.codex/skills -maxdepth 2 -type d -name 'gsd-*'` → 50+ skills found ✅
  - `gsd --version` / `gsd version` / `gsd -v` → version check failed (unknown subcommand)
- GSD mode used: **GSD_PROCESSMAP_WRAPPER_PLANNING** (`/opt/processmap-test/bin/gsd` available, version subcommand unsupported)
- Commands executed: `gsd usage` (failed), `gsd` without args not tested to avoid side-effects
- Implementation not performed: ✅ CONFIRMED
- Product files not modified: ✅ CONFIRMED (read-only grep/sed used)
- Contour bounded: `perf/diagram-derived-maps-and-render-boundary-v1`
- Decomposition-first rule applied: ✅ CONFIRMED
- Agent 2 / Agent 3 gates prepared: ✅ CONFIRMED (EXECUTOR_PROMPT.md, REVIEWER_PROMPT.md)

## Previous Evidence Source Truth

Reviewed reports from closed contours:

1. `audit/diagram-property-overlays-performance-gsd-v1` — REVIEW_PASS. Overlay DOM inflation, versions head-check spam, non-edit PUT confirmed.
2. `perf/diagram-property-overlays-viewport-culling-v1` — REVIEW_PASS. `.fpcPropertyOverlay` reduced ~180→70.
3. `fix/bpmn-versions-head-check-dedupe-v1` — REVIEW_PASS. versions spam reduced ~80%.
4. `fix/diagram-non-edit-put-bpmn-guard-v1` — REVIEW_PASS. 0 PUT/PATCH from non-edit.
5. `perf/diagram-eventbus-listener-and-raf-coalescing-v1` — REVIEW_PASS. Listener cleanup + RAF coalescing + readySignal stabilization.
6. `audit/diagram-baseline-no-overlays-canvas-profile-v1` — REVIEW_PASS. Selection DOM +3,201 to +3,423 identified as dominant bottleneck.
7. `fix/diagram-decor-pipeline-disable-when-overlays-off-v1` — REVIEW_PASS. Decor skip when overlays off.
8. `feature/diagram-analytics-layer-selection-lite-decomposition-first-v1` — REVIEW_PASS. Selection DOM reduced to +238, SVG to +26, fpcFocusDim=0.

Current user report: Diagram still feels laggy despite selection-lite fix.

## Source / Runtime Truth

- Working dir: `/opt/processmap-test`
- User: `root`
- Host: `clearvestnic.ru`
- Date: `2026-05-15T14:13:06+00:00`
- Git branch: `fix/lockfile-sync-test`
- HEAD: `a9a9d9c5f468d9da63415306da6d34dcd605aa0d`
- origin/main: `d805e1c64c1107b9e3fe6854e031694bf741b187`
- Git status: multiple modified files from previous contours (uncommitted)
- API health: `{"ok":true,"status":"ok",...}` ✅
- Frontend: `HTTP/1.1 200 OK` ✅
- Runtime URL: `http://clearvestnic.ru:5180`
- API URL: `http://clearvestnic.ru:8088`

## Problem Statement

After eliminating the selection DOM/SVG bottleneck, subjective lag persists. The next most likely layer is **JS computation and React churn** from:

1. **Derived maps rebuild too often** in ProcessStage/BpmnStage due to unstable `draft` object identity.
2. **Parent state churn** — ProcessStage recomputes heavy useMemo maps on every render even when source data unchanged.
3. **BpmnStage prop identity churn** — receives new object/array refs every ProcessStage render.
4. **Decor fanout effects refire** — `useBpmnSettledDecorFanout` uses `draft?.nodes`, `draft?.bpmn_meta`, `draft?.notesByElementId` as effect deps; these change identity on every parent render.
5. **Interview decor signature recomputation** — `interviewDecorSignature` in BpmnStage rebuilds on every render because `draft` sub-properties have unstable identities.

Goal: make expensive derived computations run only when underlying **source data** changes, not on pan/zoom/hover/selection/tab visibility.

## God-file / Decomposition Risk

| File | Lines | Risk |
|------|-------|------|
| `ProcessStage.jsx` | 6,898 | **HIGH** — 70+ state values, 14 ref-sync effects, heavy useMemo chains |
| `BpmnStage.jsx` | 5,759 | **HIGH** — 20+ useEffect hooks, interviewDecorSignature, many adapter useMemo hooks |
| `useBpmnSettledDecorFanout.js` | ~200 | **MEDIUM** — receives `draft` directly, fanout effects churn |
| `useInterviewDerivedState.js` | ~1,100 | **MEDIUM** — many XML parsing useMemo hooks |

**Decomposition-first rule**: If logic is embedded in ProcessStage/BpmnStage, Agent 2 must extract it to a dedicated module BEFORE adding memoization. ProcessStage/BpmnStage must not grow larger.

## Source Map Targets

### Candidate 1: ProcessStage derived meta maps
- **Path**: `frontend/src/components/ProcessStage.jsx`
- **Lines**: ~2855–2935
- **Functions**: `nodePathMetaMap`, `flowTierMetaMap`, `robotMetaByElementId`, `robotMetaStatusByElementId`, `robotMetaCounts`, `robotMetaNodeCatalogById`, `hybridLayerMapLive`, `hybridLayerItems`
- **Current role**: Derive element-level metadata from `draft?.bpmn_meta` and `draft?.nodes`
- **Suspected cost**: O(n) map construction on every render; `draft` identity unstable
- **Runs on selection/hover/pan/zoom**: YES — any ProcessStage re-render triggers recomputation
- **Needs decomposition**: YES — extract to `useDiagramElementMetaModel.js`
- **Safe change area**: ProcessStage useMemo extraction, new hook module
- **Forbidden change area**: BPMN XML parsing logic, backend, data shape

### Candidate 2: ProcessStage DOD / quality overlay maps
- **Path**: `frontend/src/components/ProcessStage.jsx`
- **Lines**: ~3782–4180
- **Functions**: `diagramDodSnapshot`, `dodReadinessV1`, `qualityOverlayCatalog`, `qualityOverlayHints`, `diagramHints`, `qualityOverlayRows`, `activeQualityOverlayCount`, `qualityOverlayListItems`
- **Current role**: Build DOD snapshot and quality overlay data for Diagram
- **Suspected cost**: `computeDodSnapshotFromDraft` + `buildDodReadinessV1` are heavy; run on every render
- **Runs on selection/hover/pan/zoom**: YES — any ProcessStage re-render
- **Needs decomposition**: YES — extract to `useDiagramDodQualityModel.js`
- **Safe change area**: Extraction, stable deps
- **Forbidden change area**: DOD computation semantics, backend

### Candidate 3: BpmnStage interviewDecorSignature
- **Path**: `frontend/src/components/process/BpmnStage.jsx`
- **Lines**: ~5481–5495
- **Function**: `interviewDecorSignature` useMemo
- **Current role**: Build signature for interview decor (steps, AI questions, nodes, notes)
- **Suspected cost**: Rebuilds on every BpmnStage render because `draft` sub-properties unstable
- **Runs on selection/hover/pan/zoom**: YES
- **Needs decomposition**: PARTIAL — can be fixed by receiving stable derived model instead of raw `draft`
- **Safe change area**: Dependency array stabilization, derived model injection
- **Forbidden change area**: Decor application logic, bpmn-js integration

### Candidate 4: useBpmnSettledDecorFanout draft dependencies
- **Path**: `frontend/src/features/process/bpmn/stage/orchestration/useBpmnSettledDecorFanout.js`
- **Lines**: ~100–170 (effects section)
- **Functions**: StepTime fanout, RobotMeta fanout, Properties fanout, Selection fanout
- **Current role**: Apply settled decorations after instance is ready
- **Suspected cost**: Effects refire because `draft?.nodes`, `draft?.bpmn_meta` change identity
- **Runs on selection/hover/pan/zoom**: YES
- **Needs decomposition**: NO — can be fixed by stable primitive signatures
- **Safe change area**: Replace `draft` deps with stable version/hash signatures
- **Forbidden change area**: Fanout runtime logic, decorManager.js

### Candidate 5: useInterviewDerivedState XML parsing hooks
- **Path**: `frontend/src/components/process/interview/useInterviewDerivedState.js`
- **Lines**: ~138–165, ~1025–1105
- **Functions**: `laneMetaByNodeFromXml`, `subprocessMetaByNodeFromXml`, `nodeKindByIdFromXml`, `xmlTextAnnotationEntriesByNode`, `xmlTextAnnotationsByNode`, `bpmnOrderMeta`, `xmlNodeOrder`, `flowMetaById`, `aiQuestionsByElement`, `aiQuestionsDiagramSyncByStepId`
- **Current role**: Parse BPMN XML into lookup maps
- **Suspected cost**: DOM parsing on every InterviewStage render if `bpmnXml` identity unstable
- **Runs on selection/hover/pan/zoom**: InterviewStage only; but may churn when switching tabs
- **Needs decomposition**: PARTIAL — if `bpmnXml` string is stable, useMemo already works
- **Safe change area**: Verify bpmnXml string stability; add primitive version key if needed
- **Forbidden change area**: XML parsing logic

## Runtime Baseline Plan

See `RUNTIME_NAVIGATION.md` for detailed navigation.

Agent 2 must capture baseline BEFORE code changes:

| Scenario | What to measure |
|----------|-----------------|
| A — Idle Diagram | total DOM, SVG, `.fpcPropertyOverlay`, `.djs-overlay`, console, network |
| B — Selection repeated (10 elements) | DOM/SVG deltas, property panel speed, lag, network silence |
| C — Hover repeated (10 elements) | lag, console/network, decor map churn if detectable |
| D — Pan/zoom (5 cycles) | DOM/SVG stability, overlay counts, lag |
| E — Parent/tab churn | Analysis↔Diagram, XML↔Diagram, derived model rebuild detectable? |
| F — Selected details | Only selected details update, not full model |

## Target Architecture

Implement a **Diagram Derived Model / Selector Layer**.

### Source data primitives (stable keys)
Instead of depending on `draft` object identity, compute stable primitive keys:
- `sessionId` (string)
- `bpmnXmlHash` or `bpmn_xml_version` (string/number)
- `diagramStateVersion` (number)
- `interviewStepsVersion` (hash of steps array)
- `interviewAnalysisVersion` (hash of analysis object)
- `bpmnMetaVersion` (hash of bpmn_meta object)
- `notesByElementVersion` (hash of notes map)
- `robotMetaVersion` (hash of robot_meta map)
- `hybridLayerVersion` (hash of hybrid layer map)
- `overlaySettingsFlags` (boolean primitives)

### Derived selectors (memoized)
- `elementMetaModel` — robotMeta, nodePathMeta, flowTierMeta, hybridLayerMeta
- `dodQualityModel` — dodSnapshot, readiness, qualityOverlayCatalog, hints
- `interviewDecorModel` — steps, AI questions, notes signature
- `selectedElementDetails` — narrow selector from elementMetaModel + selectedElementId

### Render boundary
- ProcessStage computes derived models once per source-version change.
- BpmnStage receives stable derived model references.
- Pan/zoom/hover/selection do NOT rebuild derived models.
- Property panel reads `selectedElementDetails` from memoized selector.

### Expected module shape
```
frontend/src/features/process/bpmn/stage/derived/
  createDiagramDerivedModel.js      — pure builder from primitives
  useDiagramDerivedModel.js         — hook with stable deps
  diagramDerivedModelSelectors.js   — narrow selectors
  diagramDerivedModelHash.js        — lightweight hash/version helpers
```

## Bounded Implementation Strategy

### Phase 1: Decomposition (MANDATORY if god-file logic touched)

1. **Extract `useDiagramElementMetaModel`** from ProcessStage lines ~2855–2935
   - Move to `frontend/src/features/process/bpmn/stage/derived/useDiagramElementMetaModel.js`
   - Preserve exact computation logic
   - Return `{ nodePathMetaMap, flowTierMetaMap, robotMetaByElementId, robotMetaStatusByElementId, robotMetaCounts, robotMetaNodeCatalogById, hybridLayerMapLive, hybridLayerItems }`
   - Add unit test stub if feasible

2. **Extract `useDiagramDodQualityModel`** from ProcessStage lines ~3782–4180
   - Move to `frontend/src/features/process/bpmn/stage/derived/useDiagramDodQualityModel.js`
   - Preserve exact computation logic
   - Return `{ diagramDodSnapshot, dodReadinessV1, qualityOverlayCatalog, qualityOverlayHints, diagramHints, qualityOverlayRows, activeQualityOverlayCount, qualityOverlayListItems }`

3. **Build `useDiagramDerivedModel`** orchestrator
   - Combines the two extracted hooks + `interviewDecorModel` builder
   - Computes stable source version keys from `draft`
   - Uses primitive keys as useMemo deps

4. **Run build/tests after extraction**
   - `npm run build` must pass
   - Existing tests must pass or pre-existing failures documented

5. **Document in `DECOMPOSITION_REPORT.md`**

### Phase 2: Memoization / Render-boundary optimization

1. **Add stable source keys**
   - Implement lightweight hash/version helpers in `diagramDerivedModelHash.js`
   - Options: `JSON.stringify` + length check for small objects; shallow key concat for large objects; existing `fnv1aHex` if available
   - Must be pure, synchronous, dev-only if expensive

2. **Memoize derived model in ProcessStage**
   - Replace inline useMemo chains with `useDiagramDerivedModel({ draft, sessionId, ... })`
   - Pass derived model to BpmnStage via `bpmnStageProps`

3. **Stabilize BpmnStage props**
   - Ensure `interviewDecorSignature` in BpmnStage depends on stable derived model, not raw `draft`
   - Ensure `useBpmnSettledDecorFanout` receives stable signatures instead of `draft` sub-objects

4. **Split selected element details**
   - `selectedElementDetails` computed via narrow selector from stable `elementMetaModel`
   - Only updates when `selectedElementId` changes, not when full model rebuilds

5. **Stabilize callbacks**
   - ProcessStage callbacks already mostly use `useCallback`; verify no inline lambdas passed to BpmnStage

6. **Tests**
   - Selector memoization unit test: same input → same reference
   - No rebuild on selection test: change selectedElementId without changing source keys → derived model reference stable

7. **Runtime proof**
   - Compare before/after subjective and measurable timings
   - Document in `PERFORMANCE_BEFORE_AFTER.md`

## Acceptance Criteria

1. Decomposition-first: heavy mapping logic extracted if it was in god files; ProcessStage/BpmnStage not made larger.
2. Source map: exact heavy derived maps identified; dependencies documented.
3. Memoization: full derived model does not rebuild on pan/zoom/hover/selection/tab change if source data unchanged.
4. Selected element: selection still updates property/details panel; selected details computed from memoized model or narrow selector; selection-lite remains working.
5. Runtime: Diagram opens normally; selection/hover/pan/zoom stable; no unbounded DOM growth; no new console errors; no PUT/PATCH from view interactions; no versions spam regression.
6. Previous fixes preserved: overlay culling, non-edit guard, versions dedupe, decor-off guard, selection-lite.
7. Build/tests: build passes; relevant tests pass or pre-existing failures documented.
8. Scope: no backend changes; no package changes; no BPMN XML mutation; no Product Actions/RAG/AG-UI changes.
9. Evidence: `PERFORMANCE_BEFORE_AFTER.md`, `DERIVED_MODEL_REPORT.md`, `DECOMPOSITION_REPORT.md` created.

## Non-goals

- Do not replace bpmn-js.
- Do not introduce WebGL/canvas renderer.
- Do not change BPMN XML.
- Do not change backend.
- Do not change Product Actions / RAG / AG-UI.
- Do not redesign Diagram UI.
- Do not change registry/reester actions.
- Do not redo selection-lite architecture unless regression fix requires it.
- Do not change edit mode semantics.
- Do not change save/version/history logic.
- Do not add dependencies.
- Do not add permanent debug logs.
- Do not optimize unrelated app surfaces.

## Agent 2 Execution Plan

See `EXECUTOR_PROMPT.md`.

## Agent 3 Review Plan

See `REVIEWER_PROMPT.md`.

## Risks

| Risk | Mitigation |
|------|------------|
| `draft` object is deeply mutated in-place by existing code | Use defensive hashing (Object.keys length + top-level primitive values) rather than deep equality |
| Stable hash computation itself is expensive | Keep hashing shallow; use existing version fields when available (`draft?.bpmn_state_version`, `draft?.updated_at`) |
| Extraction accidentally changes prop passing order | Preserve exact return shapes; add type-like assertions in tests |
| BpmnStage still receives unstable callbacks from ProcessStage | Audit `bpmnStageProps` for inline lambdas; stabilize with `useCallback` or ref pattern |
| Playwright cannot measure JS execution time accurately | Use `performance.mark/measure` in dev mode; rely on DOM stability as proxy |
| Selection-lite regression | Explicit Playwright test for analytics mode selection DOM counts |

## Gates

- [x] Gate 1 — GSD discipline completed
- [x] Gate 2 — Previous Diagram performance evidence read
- [x] Gate 3 — Source/runtime truth captured
- [x] Gate 4 — Current post-selection-lite bottleneck hypothesis documented
- [x] Gate 5 — God-file/decomposition risk identified
- [x] Gate 6 — Derived maps/source map targets captured
- [x] Gate 7 — Decomposition-first plan defined
- [x] Gate 8 — Bounded memoization/render-boundary strategy defined
- [x] Gate 9 — Acceptance criteria defined
- [x] Gate 10 — Non-goals locked
- [x] Gate 11 — Agent 2 executor prompt ready
- [x] Gate 12 — Agent 3 reviewer prompt ready
- [x] Gate 13 — READY_FOR_EXECUTION marker created
