# Agent 3 / Reviewer Prompt

## Contour
`perf/diagram-derived-maps-and-render-boundary-v1`

## Run ID
`20260515T141131Z-27998`

## Role
Agent 3 / Reviewer — strict pass/fail with rework loop.

## Read Before Review
1. `PLAN.md`
2. `EXEC_REPORT.md`
3. `DECOMPOSITION_REPORT.md`
4. `DERIVED_MODEL_REPORT.md`
5. `PERFORMANCE_BEFORE_AFTER.md`
6. `IMPLEMENTATION_NOTES.md`
7. `RUNTIME_PROOF_CHECKLIST.md`

## Source Review

### Decomposition-first verification
- [ ] If ProcessStage.jsx or BpmnStage.jsx was modified, verify heavy mapping logic was extracted BEFORE optimization added.
- [ ] ProcessStage.jsx line count must NOT increase (should decrease or stay same).
- [ ] BpmnStage.jsx line count must NOT increase (should decrease or stay same).
- [ ] New modules are bounded and single-responsibility.

### Memoization verification
- [ ] `useDiagramDerivedModel` (or equivalent) exists and returns stable references.
- [ ] Dependency arrays use primitives or stable hashes, NOT `draft` object identity.
- [ ] `interviewDecorSignature` in BpmnStage no longer depends on raw `draft` sub-properties that churn.
- [ ] `useBpmnSettledDecorFanout` effects use stable signatures instead of `draft` sub-objects.

### Selected element verification
- [ ] `selectedElementDetails` uses narrow selector from stable model.
- [ ] Selection updates property/details panel correctly.
- [ ] Selection does NOT trigger full derived model rebuild.

### Scope verification
- [ ] No backend files modified.
- [ ] No `package.json` / `package-lock.json` changes (except dev-only pre-existing).
- [ ] No `.env` changes.
- [ ] No BPMN XML mutation logic changed.
- [ ] No Product Actions / RAG / AG-UI files modified.
- [ ] No secrets exposed.

### Code quality
- [ ] No `console.log` spam (pre-existing debug traces acceptable).
- [ ] No broad refactor outside contour.
- [ ] Build passes.
- [ ] Existing tests still pass or pre-existing failures documented.

## Playwright Runtime Review

### Environment
- Runtime: `http://clearvestnic.ru:5180`
- Session: `wewe` (`4c515d1c6e`) in project `Описание процессов Долгопрудный` (`b1c8a56b6e`)
- Browser: Playwright Chromium

### Scenario A — Idle Diagram
- [ ] Open Diagram; record total DOM, SVG, `.fpcPropertyOverlay`, `.djs-overlay`
- [ ] Compare to baseline; must be stable

### Scenario B — Selection repeated (10 elements)
- [ ] DOM/SVG delta must be ≤ +250 total DOM, ≤ +30 SVG (selection-lite baseline)
- [ ] Property panel updates
- [ ] No visible lag

### Scenario C — Hover repeated
- [ ] No visible lag
- [ ] No console errors
- [ ] No network mutations

### Scenario D — Pan/zoom (5 cycles)
- [ ] DOM/SVG stable
- [ ] Overlay counts stable
- [ ] No duplicates

### Scenario E — Tab churn
- [ ] Analysis ↔ Diagram, XML ↔ Diagram
- [ ] DOM stable on return
- [ ] No PUT/PATCH
- [ ] No versions spam

### Scenario F — Selected details
- [ ] Select element → property panel works
- [ ] Select another → only details update
- [ ] Full derived model does not rebuild (if measurable via instrumentation)

### Regression checks
- [ ] Overlay viewport culling preserved
- [ ] Versions dedupe preserved
- [ ] Non-edit PUT guard preserved
- [ ] Decor-off guard preserved
- [ ] Selection-lite analytics mode preserved
- [ ] Console no new errors

## Strict Verdict

### If ANY issue remains (even minor):
1. Create `CHANGES_REQUESTED`
2. Create `REWORK_REQUEST.md` with specific items
3. No `REVIEW_PASS`

### If ALL criteria pass:
1. Create `REVIEW_REPORT.md`
2. Create `REVIEW_PASS`
3. Document any accepted limitations
