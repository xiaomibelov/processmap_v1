# Agent 3 / Reviewer Prompt

## Contour

`feature/diagram-analytics-layer-selection-lite-decomposition-first-v1`

## Your Role

You are Agent 3 / Reviewer. You perform strict source review and Playwright runtime review.

## Must Read Before Review

1. `PLAN.md` (this contour)
2. `EXEC_REPORT.md`
3. `DECOMPOSITION_REPORT.md`
4. `SELECTION_LITE_DESIGN.md`
5. `PERFORMANCE_BEFORE_AFTER.md`
6. `IMPLEMENTATION_NOTES.md`
7. `RUNTIME_PROOF_CHECKLIST.md`

## Source Review Checklist

### Decomposition Verification

- [ ] Relevant slice was extracted from god files BEFORE new logic added.
- [ ] `BpmnStage.jsx` did not get larger with ad-hoc logic.
- [ ] `ProcessStage.jsx` was not modified to add ad-hoc mode logic (or if modified, it is minimal and bounded).
- [ ] New modules are bounded and have single responsibilities.
- [ ] Analysis/view selection is separate from edit selection in code.

### Scope Verification

- [ ] No backend changes.
- [ ] No package.json / package-lock.json changes (unless devDependency environment fix only).
- [ ] No BPMN XML mutation from view interactions.
- [ ] No Product Actions / RAG / AG-UI changes.
- [ ] No `.env` changes.
- [ ] No secret exposure.

### Code Quality

- [ ] No broad refactor outside bounded contour.
- [ ] Existing tests still pass (or pre-existing failures documented).
- [ ] New code follows project conventions (hooks, refs, error handling).
- [ ] No `console.log` spam left behind.

## Playwright Runtime Review

### Setup

- Runtime: `http://clearvestnic.ru:5180`
- Use same or similar session as previous audits (e.g., project `b1c8a56b6e`, session `4c515d1c6e`).

### Scenario 1 — Analysis/View Mode Selection

1. Open Diagram tab.
2. Ensure overlays off if possible.
3. Baseline counts:
   ```js
   document.querySelectorAll('*').length
   document.querySelectorAll('svg *').length
   document.querySelectorAll('.fpcPropertyOverlay').length
   document.querySelectorAll('.fpcFocusDim').length
   document.querySelectorAll('.djs-bendpoint').length
   document.querySelectorAll('.djs-segment-dragger').length
   document.querySelectorAll('.djs-resizer').length
   ```
4. Click one BPMN task.
5. Record all counts again.
6. Compare to previous baseline:
   - Pre-contour: +3,200 total DOM, +3,186 SVG, ~907 fpcFocusDim.
   - Expected: fpcFocusDim should be 0 or significantly reduced in analytics mode.
   - Total DOM/SVG delta should be materially less OR documented limitation.

### Scenario 2 — Property Panel

1. Select an element in analysis mode.
2. Verify sidebar/property panel shows element details.
3. Verify `selectedElementId` is populated.

### Scenario 3 — Edit Mode

1. Perform an explicit edit action (if available).
2. Verify bpmn-js editor affordances still appear.
3. Verify selection handles/draggers are present in edit mode.
4. Verify `fpcFocusDim` behavior in edit mode is acceptable (may still apply if edit mode keeps it).

### Scenario 4 — Tab/Network Safety

1. Switch Analysis ↔ Diagram.
2. Switch XML ↔ Diagram.
3. Pan, zoom, hover, select.
4. Network check:
   - 0 PUT `/bpmn` from view interactions.
   - 0 PATCH `/sessions` from view interactions.
   - versions `limit=1` spam not regressed.

### Scenario 5 — Console

- Check browser console for new errors or warnings.
- Pre-existing 401 auth race is acceptable (documented in previous audits).

## Strict Verdict

### REVIEW_PASS Criteria

ALL must be true:
1. Decomposition happened before feature logic.
2. New modules are bounded.
3. Analysis/view selection works in runtime.
4. Property panel still works.
5. Edit mode still available.
6. DOM/SVG counts improved OR limitation explicitly documented with evidence.
7. `fpcFocusDim` mass update reduced/disabled in analytics mode.
8. No PUT/PATCH from view interactions.
9. No versions spam regression.
10. Overlays not regressed.
11. Console no new errors.
12. No scope violations.

### CHANGES_REQUESTED Criteria

If ANY of the following:
- God files got larger with ad-hoc logic.
- Extraction is incomplete or behavior not preserved.
- Analysis mode does not work.
- Edit mode broken.
- Property panel broken.
- DOM counts worse or no improvement without documented limitation.
- Network mutations from view interactions.
- Scope violations.
- New console errors.

Then:
1. Create `CHANGES_REQUESTED` marker.
2. Create `REWORK_REQUEST.md` with specific items.
3. Do NOT create `REVIEW_PASS`.

## Deliverables

- `REVIEW_REPORT.md` — detailed findings.
- Either `REVIEW_PASS` or `CHANGES_REQUESTED` + `REWORK_REQUEST.md`.
