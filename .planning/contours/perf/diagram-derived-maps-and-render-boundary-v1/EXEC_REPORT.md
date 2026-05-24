# EXEC_REPORT.md

## Contour
`perf/diagram-derived-maps-and-render-boundary-v1`

## Run ID
`20260515T141131Z-27998`

## What Was Done

### Phase 1: Decomposition (MANDATORY)

1. **Created `diagramDerivedModelHash.js`** — lightweight version/hash helpers using existing `fnv1aHex` and primitive field inspection.
2. **Extracted `useDiagramElementMetaModel`** from ProcessStage lines ~2857-2938 → `frontend/src/features/process/bpmn/stage/derived/useDiagramElementMetaModel.js`. Returns 8 derived maps with stable primitive deps.
3. **Extracted `useDiagramDodQualityModel`** from ProcessStage lines ~3717-4130 → `frontend/src/features/process/bpmn/stage/derived/useDiagramDodQualityModel.js`. Returns 9 derived maps with stable primitive deps.
4. **Created `useDiagramDerivedModel`** orchestrator hook composing the two extracted hooks.
5. **Replaced inline useMemos in ProcessStage** with hook calls. ProcessStage line count reduced by ~272 lines.
6. **Build passes** (`npm run build` ✅). Tests pass (1923 pass, 24 pre-existing fail). New hash tests 6/6 pass.

### Phase 2: Memoization / Render-Boundary Optimization

1. **Stabilized ProcessStage derived model deps** — `useDiagramElementMetaModel` uses `bpmnMetaKey`, `nodesKey`, `hybridLayerKey`. `useDiagramDodQualityModel` uses `buildDraftVersionKey` + shallow object keys.
2. **Stabilized BpmnStage `interviewDecorSignature`** — extracted `buildInterviewDecorSignature` to shared module. ProcessStage pre-computes it with stable primitive deps and passes it via `bpmnStageProps`. BpmnStage uses prop if present, falls back to internal computation.
3. **Stabilized `useBpmnSettledDecorFanout` deps** — replaced `draft?.nodes` with `nodesKey`, `draft?.bpmn_meta` with `bpmnMetaKey` in StepTime, RobotMeta, and Camunda sync effects.
4. **Narrow selected element selector** — `selectedElementContext` already existed as a narrow selector using `selectedElementId` + primitives. No change needed.
5. **Callback stability** — `useStableProcessDiagramOverlayLayersProps` already stabilizes function references via ref wrappers. No change needed.
6. **Tests** — added `diagramDerivedModelHash.test.mjs` (6 pass). Existing `useBpmnSettledDecorFanout.test.mjs` still passes (2/2).
7. **Runtime proof** — Playwright baseline blocked by auth. Code-level stability proof documented in `DERIVED_MODEL_REPORT.md` and `PERFORMANCE_BEFORE_AFTER.md`.

## Deliverables

| File | Status |
|------|--------|
| `DECOMPOSITION_REPORT.md` | ✅ Created |
| `DERIVED_MODEL_REPORT.md` | ✅ Created |
| `PERFORMANCE_BEFORE_AFTER.md` | ✅ Created |
| `IMPLEMENTATION_NOTES.md` | ✅ Created |
| `EXEC_REPORT.md` | ✅ Created |
| `READY_FOR_REVIEW` | ✅ Created |
| `EXECUTION_RUN_ID` | ✅ Created |

## Blocked Items

- **Playwright before/after metrics**: Runtime requires authenticated session. Headless Playwright could not access the Diagram tab. Documented as requiring manual verification.
- **No blockers for code changes.**

## Rework Round 1 — interviewDecorSignature stable dependency fix

### Agent 3 blocking issue summary
BpmnStage `interviewDecorSignature` useMemo dependency array still included raw `draft` sub-properties (`draft?.nodes`, `draft?.interview?.steps`, `draft?.interview?.ai_questions_by_element`, `draft?.interview?.aiQuestionsByElementId`, `draft?.notes_by_element`, `draft?.notesByElementId`) even though ProcessStage passed a stable `interviewDecorSignatureProp`. This caused the useMemo to re-evaluate on every BpmnStage render when `draft` object identity changed, defeating the render-boundary optimization.

### Files changed
- `frontend/src/components/process/BpmnStage.jsx` (lines 5484–5497)

### Exact dependency fix
Changed `interviewDecorSignature` useMemo from a flat dependency array to a **conditional dependency array**:
- When `interviewDecorSignatureProp != null`: depend ONLY on `[interviewDecorSignatureProp]` (stable primitive string)
- When `interviewDecorSignatureProp` is absent: fall back to the original full dependency array

```javascript
const interviewDecorSignature = useMemo(
  () => interviewDecorSignatureProp || buildInterviewDecorSignature(draft, aiQuestionsModeEnabled, diagramDisplayMode),
  interviewDecorSignatureProp != null
    ? [interviewDecorSignatureProp]
    : [
        draft?.interview?.steps,
        draft?.interview?.ai_questions_by_element,
        draft?.interview?.aiQuestionsByElementId,
        draft?.nodes,
        draft?.notes_by_element,
        draft?.notesByElementId,
        aiQuestionsModeEnabled,
        diagramDisplayMode,
      ],
);
```

### Tests run
- `npm run build` ✅
- `diagramDerivedModelHash.test.mjs` — 6/6 pass ✅
- `useBpmnSettledDecorFanout.test.mjs` — 2/2 pass ✅
- Full test suite — 1929 pass, 24 fail (same pre-existing failures, no new regressions) ✅

### Runtime proof
- Playwright spot-check blocked by auth (no token available in environment)
- Code-level proof: when `interviewDecorSignatureProp` is present (current usage), the useMemo now depends on a single stable primitive string → no re-evaluation on pan/zoom/hover/selection

### Safety confirmation
- No backend changes ✅
- No package changes ✅
- No BPMN XML mutation ✅
- No durable truth mutation ✅
- No Product Actions / RAG / AG-UI changes ✅
- No commit/push/PR/deploy ✅
- Selection-lite performance behavior intact ✅
- Previous runtime results preserved (overlay culling, versions dedupe, non-edit PUT guard, decor-off guard) ✅

## Scope Compliance

| Rule | Status |
|------|--------|
| No backend changes | ✅ |
| No package changes | ✅ |
| No BPMN XML mutation | ✅ |
| No Product Actions / RAG / AG-UI changes | ✅ |
| No `.env` changes | ✅ |
| No secrets in output | ✅ |
| No commit/push/PR | ✅ |
| Decomposition-first | ✅ |
| Preserve previous fixes | ✅ |
