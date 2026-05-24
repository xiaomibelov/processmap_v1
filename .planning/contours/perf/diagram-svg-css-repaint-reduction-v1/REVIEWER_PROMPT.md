# Agent 3 Reviewer Prompt — perf/diagram-svg-css-repaint-reduction-v1

## Identity
You are Agent 3 / Reviewer for ProcessMap.

## Scope
Review the execution of `perf/diagram-svg-css-repaint-reduction-v1` for correctness, boundedness, performance, and regression safety.

## Contour
perf/diagram-svg-css-repaint-reduction-v1

## Run ID
20260515T160840Z-33357

## Working Directory
/opt/processmap-test

## Must Read
1. `/opt/processmap-test/.planning/contours/perf/diagram-svg-css-repaint-reduction-v1/PLAN.md`
2. `/opt/processmap-test/.planning/contours/perf/diagram-svg-css-repaint-reduction-v1/EXEC_REPORT.md`
3. `/opt/processmap-test/.planning/contours/perf/diagram-svg-css-repaint-reduction-v1/REPAINT_SOURCE_MAP.md`
4. `/opt/processmap-test/.planning/contours/perf/diagram-svg-css-repaint-reduction-v1/PERFORMANCE_BEFORE_AFTER.md`
5. `/opt/processmap-test/.planning/contours/perf/diagram-svg-css-repaint-reduction-v1/IMPLEMENTATION_NOTES.md`
6. `/opt/processmap-test/.planning/contours/perf/diagram-svg-css-repaint-reduction-v1/RUNTIME_PROOF_CHECKLIST.md`
7. `DECOMPOSITION_REPORT.md` if present.

## Source Review Checklist

- [ ] Repaint-heavy CSS selectors were identified and addressed.
- [ ] Changes are bounded to Diagram CSS/highlight/analytics selection modules.
- [ ] No changes to backend files.
- [ ] No changes to `package.json` / `package-lock.json` (unless pre-existing and documented).
- [ ] No BPMN XML mutation logic changed.
- [ ] No Product Actions / RAG / AG-UI files modified.
- [ ] No `.env` changes introduced.
- [ ] No secrets exposed.
- [ ] No god-file bloat (BpmnStage / ProcessStage line counts flat or reduced, not increased).
- [ ] `selectionFocusDecor.js` and `elementSelectionEmitter.js` not regressed.
- [ ] `useDiagramDerivedModel` and derived-map modules not regressed.
- [ ] `wireBpmnStageRuntimeEvents.js` analytics mode path intact.
- [ ] No `console.log` spam in new/modified files.

## Playwright Runtime Review Checklist

Environment:
- Runtime: `http://clearvestnic.ru:5180`
- Session: `wewe` (`4c515d1c6e`) in project `Описание процессов Долгопрудный` (`b1c8a56b6e`)
- Browser: Playwright Chromium
- Overlays: OFF (`include_overlay=0`)

Scenarios:

- [ ] **Scenario A — Idle Diagram**
  - [ ] Total DOM ≈ 8,025 (within ±50).
  - [ ] SVG ≈ 2,392 (within ±20).
  - [ ] `.fpcPropertyOverlay` = 0.
  - [ ] `.djs-overlay` stable.
  - [ ] `.fpcFocusDim` = 0.
  - [ ] `.djs-bendpoint` = 0.
  - [ ] `.djs-segment-dragger` = 0.

- [ ] **Scenario B — Selection Repaint**
  - [ ] Click 10 BPMN elements.
  - [ ] DOM delta ≤ +250 (selection-lite baseline).
  - [ ] SVG delta ≤ +30.
  - [ ] `.fpcAnalyticsSelected` count low (1–2).
  - [ ] No visible flicker/regression.
  - [ ] Property panel updates correctly.
  - [ ] 0 PUT `/bpmn`.
  - [ ] 0 PATCH `/sessions`.

- [ ] **Scenario C — Hover Repaint**
  - [ ] Hover 10 BPMN elements.
  - [ ] No visible lag or flicker.
  - [ ] No PUT/PATCH.

- [ ] **Scenario D — Pan/Zoom**
  - [ ] 5 pan/zoom cycles.
  - [ ] DOM counts stable.
  - [ ] Overlays stable.
  - [ ] No new console errors.

- [ ] **Scenario E — Network / Regression**
  - [ ] No `versions?limit=1` spam beyond background polls.
  - [ ] No PUT `/bpmn` from clicks/hover/pan.
  - [ ] No PATCH `/sessions` from clicks/hover/pan.
  - [ ] Console no new errors (pre-existing 401 auth race is acceptable).

## Regression Checks

- [ ] Overlay viewport culling preserved (`decorManager.js` viewport culling logic intact).
- [ ] Versions dedupe preserved (`bpmnVersionsListRequestRef` + cooldown ref in `ProcessStage`).
- [ ] Non-edit PUT guard preserved (`suppressEmitDiagramMutationRef` + wiring guards).
- [ ] Decor-off guard preserved (`propertiesOverlayDidClearRef` in `useBpmnSettledDecorFanout`).
- [ ] Selection-lite analytics mode preserved (`wireBpmnStageRuntimeEvents.js` branches correctly).
- [ ] Derived maps / render boundary preserved (`interviewDecorSignature` stable dep, `useDiagramDerivedModel` stable refs).

## Verdict Rules

### REVIEW_PASS conditions (ALL must be true)
1. Source review checklist passes.
2. Runtime review checklist passes.
3. Performance before/after shows improvement OR at minimum no regression + clear source proof of reduced expensive CSS churn.
4. No scope violations.
5. No regressions to previous Diagram fixes.

### CHANGES_REQUESTED conditions (ANY of these)
1. Source review finds unbounded changes.
2. Runtime review finds DOM/SVG regression.
3. `fpcFocusDim` mass return in analytics mode.
4. `djs-bendpoint` / `djs-segment-dragger` appear in analytics mode.
5. PUT/PATCH from view interactions.
6. Versions spam regression.
7. Visible highlight/selection regression.
8. Console new errors.
9. Build or test failures.
10. Previous fix regressed.

### Actions
- If **REVIEW_PASS**: create `REVIEW_REPORT.md` and `REVIEW_PASS` marker.
- If **CHANGES_REQUESTED**: create `REWORK_REQUEST.md` and `CHANGES_REQUESTED` marker. Do NOT create `REVIEW_PASS`.
