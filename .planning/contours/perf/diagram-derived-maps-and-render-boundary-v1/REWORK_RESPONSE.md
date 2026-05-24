# REWORK_RESPONSE — perf/diagram-derived-maps-and-render-boundary-v1

## Rework Round
1

## Blocking Issue Addressed
Agent 3 found that BpmnStage `interviewDecorSignature` useMemo dependency array still included raw `draft` sub-properties (`draft?.nodes`, `draft?.interview?.steps`, `draft?.interview?.ai_questions_by_element`, `draft?.interview?.aiQuestionsByElementId`, `draft?.notes_by_element`, `draft?.notesByElementId`) even though ProcessStage passed a stable `interviewDecorSignatureProp`. This caused the useMemo to re-evaluate on every BpmnStage render when `draft` object identity changed, defeating the render-boundary optimization.

## Fix
Changed `interviewDecorSignature` useMemo in BpmnStage from a flat dependency array to a **conditional dependency array**:

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

- When `interviewDecorSignatureProp` is present (current usage): useMemo depends ONLY on the stable primitive string → no re-evaluation on pan/zoom/hover/selection
- When `interviewDecorSignatureProp` is absent: falls back to original full dependency array → backward compatibility preserved

## Files Changed

| File | Change | Reason |
|------|--------|--------|
| `frontend/src/components/process/BpmnStage.jsx` (lines 5484–5497) | Conditional useMemo dependency array | Primary fix — stable prop path vs fallback path |

## Validation

```bash
cd /opt/processmap-test/frontend && npm run build
```
Result: ✅ Build passes

```bash
cd /opt/processmap-test/frontend && node --test src/features/process/bpmn/stage/derived/diagramDerivedModelHash.test.mjs src/features/process/bpmn/stage/orchestration/useBpmnSettledDecorFanout.test.mjs
```
Result: ✅ 8/8 pass

```bash
cd /opt/processmap-test/frontend && node --test $(find src -name "*.test.mjs" | tr '\n' ' ')
```
Result: ✅ 1929 pass, 24 fail (same pre-existing failures, no new regressions)

## Runtime Proof
Playwright spot-check blocked by auth (no token available). Code-level stability proof:
- `interviewDecorSignatureProp` is a stable primitive string from ProcessStage
- When present, BpmnStage useMemo depends ONLY on `[interviewDecorSignatureProp]`
- `draft` object identity changes do NOT trigger re-evaluation
- `applyInterviewDecor` effect only fires when signature value actually changes

## Safety
- [x] no backend changes
- [x] no package changes
- [x] no BPMN XML mutation
- [x] no durable truth mutation
- [x] no Product Actions / RAG / AG-UI changes
- [x] no commit/push/PR/deploy
- [x] selection-lite performance behavior intact
- [x] previous runtime results preserved

## Ready for Review
READY_FOR_REVIEW marker recreated for Agent 3 re-review.
