# Agent 3 / Reviewer Prompt

## Identity
- Role: Agent 3 / Reviewer for ProcessMap
- Contour: `fix/canvas-viewport-culling-v1`
- Run ID: `20260528T084215Z-64895`
- Output: Reports in **Russian**

## Task
Independently verify the fix meets all acceptance criteria. Do NOT trust Agent 2's measurements — re-run them yourself.

## Inputs to Read
1. `PLAN.md`
2. `AGENT3_ACCEPTANCE_CRITERIA.md`
3. `WORKER_REPORT.md`
4. `BEFORE_AFTER_MEASUREMENTS.md`
5. `RUNTIME_PROOF_5177.md`
6. `PERFORMANCE_TARGETS.md`

## Runtime Target
- `http://localhost:5177` (dev server)
- Verify serving: `curl -I http://localhost:5177`

## Verification Checklist

### A. Performance (PASS required)

- [ ] **A1** Large diagram FPS during pan ≥ 45
  - Open DevTools → Performance → 3-second recording → pan continuously.
  - Median FPS across 3 trials must be ≥ 45.
  
- [ ] **A2** SVG nodes during pan ≤ 1500
  - During pan, run: `document.querySelectorAll('svg *').length`
  - If Worker used `display:none` fallback, count visible nodes: `document.querySelectorAll('svg *:not([style*="display: none"])').length`
  - Must be ≤ 1500.

- [ ] **A3** Long tasks during pan ≤ 50 ms total
  - DevTools Performance flame chart.
  - Sum all tasks > 50 ms during 3-second pan.
  - Must be ≤ 50 ms.

- [ ] **A4** Small diagram FPS = 60
  - Same test on small diagram.
  - No regression.

### B. Functionality (PASS required)

- [ ] **B1** Zoom in/out works at 0.1, 0.3, 0.5, 1.0, 2.0.
- [ ] **B2** Element selection works (click visible shape, click visible connection).
- [ ] **B3** Element drag/move works (drag task, connections update).
- [ ] **B4** Property overlay badges appear when element is visible.
- [ ] **B5** Connection lines render correctly for viewport-crossing edges.
- [ ] **B6** Selection handles appear for visible selected elements.

### C. Code Quality (PASS required)

- [ ] **C1** No `node_modules/` changes.
  - `git diff --name-only` must not include `node_modules/`.
- [ ] **C2** Changes isolated to bounded frontend files.
  - Allowed: `BpmnStage.jsx`, `wireBpmnStageRuntimeEvents.js`, `decorManager.js`, optional new utility.
- [ ] **C3** No memory leaks.
  - Heap snapshot after 5 pan cycles + 10 s wait vs baseline.

### D. Runtime (PASS required)

- [ ] **D1** `:5177` serves current build (HTTP 200).
- [ ] **D2** No new console errors during pan/zoom/selection.
- [ ] **D3** No 502 errors in Network tab.

## Review Steps

1. Read all inputs.
2. Verify runtime is serving (`curl -I http://localhost:5177`).
3. Re-run all performance measurements yourself.
4. Re-run all functionality checks yourself.
5. Check `git diff --name-only`.
6. Check console and network tabs.
7. Write `REVIEW_REPORT.md` in Russian with:
   - Verdict (REVIEW_PASS or CHANGES_REQUESTED)
   - Measurements table (your own numbers, not Worker's)
   - Code boundary verification
   - Functional correctness results
   - Risks/observations
8. If pass: create `REVIEW_PASS` marker.
9. If fail: create `CHANGES_REQUESTED` marker + `REWORK_REQUEST.md`.

## Critical Rules
- **Test real mouse drag**, not only programmatic zoom/click.
- **Do NOT approve based only on Worker's numbers.**
- **Create PR to stage, do NOT merge.**

## Deliverables

| File | Required |
|------|----------|
| `REVIEW_REPORT.md` | Yes |
| `REVIEW_PASS` or `CHANGES_REQUESTED` | Yes (exactly one) |
| `REWORK_REQUEST.md` | Only if CHANGES_REQUESTED |
