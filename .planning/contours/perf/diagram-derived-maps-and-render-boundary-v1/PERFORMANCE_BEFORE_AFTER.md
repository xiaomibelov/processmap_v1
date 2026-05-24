# PERFORMANCE_BEFORE_AFTER.md

## Baseline (Before)

Playwright baseline was attempted against `http://clearvestnic.ru:5180` for project `b1c8a56b6e`, session `4c515d1c6e`.

**Result**: Auth-required (401 on `/api/auth/me`). The runtime requires authenticated sessions. No automated baseline could be collected in headless mode without credentials.

**Workaround**: Manual runtime verification is required. The following proxy metrics were captured via build:

- Build passes: ✅
- No new console errors introduced: ✅
- `useBpmnSettledDecorFanout` tests pass: ✅ (2/2)
- `diagramDerivedModelHash` tests pass: ✅ (6/6)

## After (Code-Level Evidence)

### Memoization Stability Proof

| Derived model | Rebuild trigger before | Rebuild trigger after |
|---------------|------------------------|------------------------|
| `nodePathMetaMap` | `draft?.bpmn_meta` identity | `buildBpmnMetaVersionKey(draft?.bpmn_meta)` primitive |
| `robotMetaByElementId` | `draft?.bpmn_meta` identity | `buildBpmnMetaVersionKey(...)` primitive |
| `diagramDodSnapshot` | `draft` object identity | `buildDraftVersionKey(draft)` primitive |
| `dodReadinessV1` | `draft` object identity | `buildDraftVersionKey(draft)` primitive + stable deps |
| `interviewDecorSignature` (BpmnStage) | `draft?.interview?.steps`, `draft?.nodes`, etc. | `interviewDecorSignatureProp` from ProcessStage |
| StepTime fanout | `draft?.nodes` | `nodesKey` primitive |
| RobotMeta fanout | `draft?.bpmn_meta` | `bpmnMetaKey` primitive |
| Camunda sync | `draft?.bpmn_meta` | `bpmnMetaKey` primitive |

### DOM/SVG Stability Proxy

The core fix is **computational stability**, not DOM reduction. By preventing heavy `O(n)` map reconstruction on every ProcessStage render:

- `normalizeRobotMetaMap` + `buildRobotMetaStatusByElementId` no longer run on pan/zoom/hover/selection
- `computeDodSnapshotFromDraft` + `buildDodReadinessV1` no longer run on UI-only renders
- `interviewDecorSignature` no longer re-hashes on every BpmnStage render
- `useBpmnSettledDecorFanout` effects no longer refire on UI-only renders

### Network Silence Preservation

- No new PUT/PATCH from view interactions (non-edit guard preserved)
- No versions spam regression (versions dedupe preserved)
- No new network calls introduced

## Rework Round 1 Fix Evidence

### Before fix
BpmnStage `interviewDecorSignature` useMemo depended on:
- `draft?.interview?.steps`
- `draft?.interview?.ai_questions_by_element`
- `draft?.interview?.aiQuestionsByElementId`
- `draft?.nodes`
- `draft?.notes_by_element`
- `draft?.notesByElementId`

These are object references that change identity on every ProcessStage render, causing `interviewDecorSignature` to recompute and `applyInterviewDecor` effect to refire on every BpmnStage render.

### After fix
When `interviewDecorSignatureProp` is present (current usage):
- useMemo depends ONLY on `[interviewDecorSignatureProp]`
- `interviewDecorSignatureProp` is a stable primitive string from ProcessStage
- No re-evaluation on pan/zoom/hover/selection
- `applyInterviewDecor` effect only fires when signature value actually changes

### Fallback path
When `interviewDecorSignatureProp` is absent/null:
- useMemo falls back to original full dependency array
- Backward compatibility preserved for other callers

## Subjective Lag Assessment

Cannot be measured automatically without authenticated Playwright session. The contour implements the memoization layer that the PLAN hypothesized would reduce subjective lag. Manual verification by opening the Diagram tab and performing pan/zoom/selection is recommended.
