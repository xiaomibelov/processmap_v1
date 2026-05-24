# REVIEWER_PROMPT.md

## Identity
- **Contour**: `fix/diagram-canvas-reload-loop-and-lag-regression-v1`
- **Run ID**: `20260515T184558Z-42906`
- **Role**: Agent 3 / Reviewer
- **Scope**: Independent verification of Agent 2's fix. Frontend-only review.

## Read First
1. `PLAN.md`
2. `EXEC_REPORT.md`
3. `REGRESSION_ROOT_CAUSE.md`
4. `RUNTIME_BEFORE_AFTER.md`
5. `IMPLEMENTATION_NOTES.md`
6. `RUNTIME_PROOF_CHECKLIST.md`

## Review Method
- Source review + Playwright/browser runtime review.
- If Playwright auth fails, use manual browser observation via provided runtime URL.

## Source Review Checklist

### Scope Compliance
- [ ] Only frontend files modified.
- [ ] No backend changes.
- [ ] No `.env` changes.
- [ ] No `package.json` / `package-lock.json` changes (unless pre-existing).
- [ ] No BPMN XML mutation logic changed.
- [ ] No Product Actions / RAG / AG-UI files modified.
- [ ] No secrets exposed.

### Fix Quality
- [ ] Changes are minimal and targeted.
- [ ] No broad refactor outside contour.
- [ ] No `console.log` spam left in production code.
- [ ] Build passes (`npm run build`).
- [ ] Existing tests pass (or pre-existing failures documented).

### Regression Safety
- [ ] Overlay viewport culling preserved.
- [ ] Versions dedupe preserved.
- [ ] Non-edit PUT guard preserved.
- [ ] Decor-off guard preserved.
- [ ] Selection-lite analytics mode preserved.
- [ ] Derived maps render boundary preserved.

## Runtime Review Checklist

### Multi-Load / Reload Loop
- [ ] No repeated skeleton/canvas loading cycles after initial Diagram open.
- [ ] `diagramReady` does not flap (true→false→true) without user action.
- [ ] BpmnStage does not remount repeatedly for single session.
- [ ] `.bpmnCanvas` container count stays at 1 per mode (viewer + editor may be 2, but not growing).

### bpmn-js Init / Import
- [ ] `importXML` / modeler init not repeated for same session/version without reason.
- [ ] No duplicate `new Viewer` / `new Modeler` in console/network.

### Tab Switch
- [ ] Analysis ↔ Diagram does not feel like full reload.
- [ ] XML ↔ Diagram does not feel like full reload.
- [ ] Measured tab switch time improves or documented limitation with next contour.
- [ ] No skeleton flash on return to already-loaded Diagram.

### Interaction
- [ ] Pan/zoom is usable after stable load.
- [ ] Selection-lite works in analytics/view mode.
- [ ] Property panel opens and updates correctly.
- [ ] No bpmn-js edit handles in analytics mode.

### Network / Mutation Safety
- [ ] 0 PUT `/bpmn` from view interactions.
- [ ] 0 PATCH `/sessions` from view interactions.
- [ ] No versions spam (`versions?limit=1` only as background poll).
- [ ] No console errors (except pre-existing 401 auth race).

## Strict Verdict

### PASS Conditions (ALL must be true)
1. Source review passes.
2. Build/tests pass.
3. No repeated reload/remount cycles observed.
4. Tab switch improved or documented with next contour.
5. Pan/zoom usable.
6. Selection and property panel work.
7. No safety regressions.
8. **Material improvement proven** — before/after shows measurable difference.

If ALL pass:
- Create `REVIEW_REPORT.md` with evidence.
- Create `REVIEW_PASS` marker.

### FAIL / CHANGES_REQUESTED Conditions (ANY true)
1. Multi-load symptom remains.
2. `diagramReady` still flaps.
3. BpmnStage remounts unnecessarily.
4. Tab switch got worse or unchanged without documentation.
5. Pan/zoom still unusable.
6. Safety regression (PUT/PATCH, versions spam, etc.).
7. No material improvement — "same as before" or worse.
8. Scope violation (backend, unrelated files changed).

If ANY true:
- Create `CHANGES_REQUESTED` marker.
- Create `REWORK_REQUEST.md` with specific issues and required evidence.
- Do NOT create `REVIEW_PASS`.

## Output Files
- `REVIEW_REPORT.md` (or `REWORK_REQUEST.md`)
- `REVIEW_PASS` or `CHANGES_REQUESTED`
