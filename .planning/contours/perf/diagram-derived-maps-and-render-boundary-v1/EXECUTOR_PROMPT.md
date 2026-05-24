# Agent 2 / Executor Prompt

## Contour
`perf/diagram-derived-maps-and-render-boundary-v1`

## Run ID
`20260515T141131Z-27998`

## Role
Agent 2 / Executor — frontend-only bounded performance changes.

## Read Before Code
1. `PLAN.md`
2. `RUNTIME_NAVIGATION.md`
3. `RUNTIME_PROOF_CHECKLIST.md`
4. `STATE.json`
5. Previous review reports (read-only):
   - `.planning/contours/feature/diagram-analytics-layer-selection-lite-decomposition-first-v1/REVIEW_REPORT.md`
   - `.planning/contours/audit/diagram-baseline-no-overlays-canvas-profile-v1/REVIEW_REPORT.md`
   - `.planning/contours/perf/diagram-eventbus-listener-and-raf-coalescing-v1/REVIEW_REPORT.md`
   - `.planning/contours/fix/diagram-decor-pipeline-disable-when-overlays-off-v1/REVIEW_REPORT.md`

## Source-map Before Code

You MUST identify the exact heavy derived maps/selectors before writing any code:

1. In `ProcessStage.jsx`, locate lines ~2855–2935 and ~3782–4180.
   - List every `useMemo` that depends on `draft` or `draft?.bpmn_meta`.
   - Note which ones produce element-level maps.
   - Note which ones run `computeDodSnapshotFromDraft` or `buildDodReadinessV1`.

2. In `BpmnStage.jsx`, locate `interviewDecorSignature` (~line 5481).
   - List its dependency array.
   - Identify which deps are object identities vs primitives.

3. In `useBpmnSettledDecorFanout.js`, locate all `useEffect` dependency arrays.
   - List which ones depend on `draft` sub-properties.
   - Identify the churn path.

4. In `useInterviewDerivedState.js`, scan for XML parsing `useMemo` hooks.
   - Determine if `bpmnXml` string is stable or changes identity.

## Baseline Before Code

Use Playwright against `http://clearvestnic.ru:5180`:

1. Open session `wewe` (`4c515d1c6e`) in project `Описание процессов Долгопрудный` (`b1c8a56b6e`).
2. Navigate to Diagram tab, ensure analytics/view mode.
3. Record:
   - `document.querySelectorAll('*').length`
   - `document.querySelectorAll('svg *').length`
   - `document.querySelectorAll('.fpcPropertyOverlay').length`
   - `document.querySelectorAll('.djs-overlay').length`
   - Console errors
   - Network PUT/PATCH/versions calls
4. Select 10 BPMN elements; record DOM/SVG deltas.
5. Hover 10 elements; record stability.
6. Pan/zoom 5 cycles; record stability.
7. Switch Analysis↔Diagram, XML↔Diagram; record DOM/network.
8. Document subjective lag notes.

Save baseline to `PERFORMANCE_BEFORE_AFTER.md` (before section).

## Phase 1: Decomposition (MANDATORY)

### 1.1 Extract `useDiagramElementMetaModel`
- Create `frontend/src/features/process/bpmn/stage/derived/useDiagramElementMetaModel.js`
- Move logic from ProcessStage lines ~2855–2935:
  - `nodePathMetaMap`
  - `flowTierMetaMap`
  - `robotMetaByElementId`
  - `robotMetaStatusByElementId`
  - `robotMetaCounts`
  - `robotMetaNodeCatalogById`
  - `hybridLayerMapLive`
  - `hybridLayerItems`
- Preserve exact behavior. Return same shape.
- Use `useMemo` with stable deps inside the hook.

### 1.2 Extract `useDiagramDodQualityModel`
- Create `frontend/src/features/process/bpmn/stage/derived/useDiagramDodQualityModel.js`
- Move logic from ProcessStage lines ~3782–4180:
  - `diagramDodSnapshot`
  - `dodReadinessV1`
  - `qualityOverlayCatalog`
  - `qualityOverlayHints`
  - `diagramHints`
  - `qualityOverlayRows`
  - `activeQualityOverlayCount`
  - `qualityOverlayListItems`
- Preserve exact behavior. Return same shape.

### 1.3 Create `diagramDerivedModelHash.js`
- Create `frontend/src/features/process/bpmn/stage/derived/diagramDerivedModelHash.js`
- Implement lightweight hash/version helpers:
  - `buildBpmnMetaVersionKey(bpmnMeta)` — shallow hash of top-level keys + array lengths
  - `buildInterviewVersionKey(interview)` — shallow hash of steps length, analysis keys, notes keys
  - `buildDiagramSourceKey({ sessionId, bpmnXml, bpmnMeta, interview, nodes, ... })` — composite primitive key
- Keep hashing cheap. Prefer existing version fields (`bpmn_state_version`, `updated_at`) when present.

### 1.4 Create `useDiagramDerivedModel` orchestrator
- Create `frontend/src/features/process/bpmn/stage/derived/useDiagramDerivedModel.js`
- Compose `useDiagramElementMetaModel` + `useDiagramDodQualityModel`
- Compute stable `sourceKey` from primitives
- Return `{ elementMetaModel, dodQualityModel, sourceKey }`

### 1.5 Replace in ProcessStage
- Import `useDiagramDerivedModel`
- Replace inline useMemo chains with the hook
- Pass derived model sub-objects to BpmnStage via existing prop paths
- Ensure ProcessStage.jsx line count does NOT increase

### 1.6 Build/tests after extraction
- `cd frontend && npm run build`
- Run existing tests; document pre-existing failures
- If tests fail, fix extraction bugs before proceeding to Phase 2

### 1.7 Document
- Write `DECOMPOSITION_REPORT.md`:
  - What was extracted
  - From where (file, line ranges)
  - To where (new files)
  - Behavior preserved evidence (build/tests)
  - Line count delta in god files

## Phase 2: Memoization / Render-boundary Optimization

### 2.1 Stabilize ProcessStage derived model deps
- In `useDiagramDerivedModel`, ensure dependency array uses ONLY primitive values / stable hashes.
- Do NOT depend on `draft` object identity.

### 2.2 Stabilize BpmnStage `interviewDecorSignature`
- Modify `interviewDecorSignature` useMemo in BpmnStage.jsx to depend on stable derived model signature instead of raw `draft` sub-properties.
- Option A: Pass `interviewDecorModel` from ProcessStage (pre-computed in `useDiagramDerivedModel`).
- Option B: Build `interviewDecorModel` inside BpmnStage using stable primitive deps.
- Preferred: Option A (keeps BpmnStage thinner).

### 2.3 Stabilize `useBpmnSettledDecorFanout` deps
- Replace `draft?.nodes`, `draft?.bpmn_meta`, `draft?.notesByElementId` effect deps with stable signatures from derived model.
- Keep `readySignal` primitive-based (already fixed in previous contour).
- Keep `view` and `diagramDisplayMode` deps (these legitimately change).

### 2.4 Narrow selected element selector
- In ProcessStage, compute `selectedElementDetails` via narrow selector from stable `elementMetaModel` + `selectedElementId`.
- Ensure this does NOT rebuild the full model when `selectedElementId` changes.

### 2.5 Verify callback stability
- Audit `bpmnStageProps` construction in ProcessStage for inline lambdas.
- If found, wrap with `useCallback` or ref pattern.
- `useStableProcessDiagramOverlayLayersProps` already memoizes props; do not break it.

### 2.6 Tests
- Add unit test for selector memoization (same input → same reference).
- Add test verifying no rebuild when `selectedElementId` changes but source keys stable.
- If test infrastructure is incompatible, document and skip with reason.

### 2.7 Runtime proof
- Re-run all baseline scenarios from Phase 1.
- Record after metrics in `PERFORMANCE_BEFORE_AFTER.md`.
- Target: subjective lag reduction; measurable DOM/SVG stability; no regression.

## Deliverables

- `EXEC_REPORT.md` — what was done, what was blocked
- `DECOMPOSITION_REPORT.md` — extraction details
- `DERIVED_MODEL_REPORT.md` — model shape, dependencies, stability proof
- `PERFORMANCE_BEFORE_AFTER.md` — runtime evidence
- `IMPLEMENTATION_NOTES.md` — any deviations from plan
- `READY_FOR_REVIEW` — marker file

If blocked:
- `EXEC_BLOCKED.md` — reason, attempted fixes, recommendation
- No `READY_FOR_REVIEW`.

## Hard Rules

- No backend changes.
- No package changes.
- No BPMN XML mutation.
- No Product Actions / RAG / AG-UI changes.
- No `.env` changes.
- No secrets in output.
- No commit/push/PR from this session.
- Decomposition-first: god-file logic extracted BEFORE optimization added.
- Preserve all previous fixes (overlay culling, versions dedupe, non-edit guard, decor-off guard, selection-lite).
