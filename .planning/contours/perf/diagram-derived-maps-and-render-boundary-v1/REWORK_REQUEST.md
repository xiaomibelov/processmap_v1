# REWORK_REQUEST.md

## Contour
`perf/diagram-derived-maps-and-render-boundary-v1`

## Run ID
`20260515T141131Z-27998`

## Required Changes

### Item 1: BpmnStage `interviewDecorSignature` useMemo dependency array

**Location**: `frontend/src/components/process/BpmnStage.jsx`, lines ~5484–5497

**Current code**:
```javascript
const interviewDecorSignature = useMemo(
  () => interviewDecorSignatureProp || buildInterviewDecorSignature(draft, aiQuestionsModeEnabled, diagramDisplayMode),
  [
    interviewDecorSignatureProp,
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

**Problem**: Even though `interviewDecorSignatureProp` is passed from ProcessStage as a stable primitive string, the dependency array still includes raw `draft` sub-properties (`draft?.nodes`, `draft?.interview?.steps`, etc.) that change identity on every parent render. This causes the `useMemo` to re-evaluate on every BpmnStage render, defeating the render-boundary optimization.

**Expected behavior**: When `interviewDecorSignatureProp` is present (which it always is in current usage), the useMemo should depend ONLY on the prop. When the prop is absent, it should fall back to the old deps.

**Suggested fix** (minimal):
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

**Acceptance criteria**:
- [ ] `interviewDecorSignature` useMemo does NOT re-evaluate on pan/zoom/hover/selection when `interviewDecorSignatureProp` is stable
- [ ] Fallback path still works if prop is ever null/undefined
- [ ] Build passes
- [ ] Existing tests pass
- [ ] Runtime selection DOM delta remains within baseline

## Items verified as PASS (no rework needed)

- Decomposition-first extraction of `useDiagramElementMetaModel` ✅
- Decomposition-first extraction of `useDiagramDodQualityModel` ✅
- `diagramDerivedModelHash.js` helpers ✅
- `useBpmnSettledDecorFanout` stable key deps ✅
- ProcessStage line count reduction ✅
- Build & tests ✅
- Runtime DOM/SVG stability ✅
- Regression guards preserved ✅
