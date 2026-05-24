# Agent 3 / Reviewer Prompt

## Contour

`perf/diagram-property-overlays-viewport-culling-v1`

## Your Role

Independent review of Agent 2's implementation. Use Playwright/browser review. Do not trust the implementation report blindly — verify runtime behavior yourself.

## Must Read Before Reviewing

1. `PLAN.md` (this contour)
2. `EXEC_REPORT.md`
3. `IMPLEMENTATION_NOTES.md`
4. `PERFORMANCE_BEFORE_AFTER.md`
5. `RUNTIME_PROOF_CHECKLIST.md`

## Review Checklist

### Functional correctness

- [ ] Visible property overlays still render on visible BPMN elements.
- [ ] Offscreen property overlays are culled after panning the canvas.
- [ ] Panning back to previously offscreen elements causes overlays to reappear.
- [ ] Zoom changes keep overlays correct and stable.
- [ ] No duplicate overlays after Analysis ↔ Diagram tab switch.
- [ ] No unbounded DOM growth after 5+ pan/zoom cycles.

### Console / network

- [ ] No new console errors.
- [ ] No mutation requests (`PUT /bpmn`, `PATCH` session, etc.) triggered by pan/zoom or overlay visibility changes.
- [ ] No spike in `GET /bpmn/versions?limit=1` caused by overlay code.

### Code boundary

- [ ] `git diff --name-only` shows only files listed in PLAN.md Source Map safe-change area.
- [ ] No backend files changed.
- [ ] No `package.json` / lock changes.
- [ ] No BPMN XML mutation logic changed.
- [ ] No Product Actions / RAG / AG-UI changes.
- [ ] No `ProcessStage.jsx` changes.

### Metrics

- [ ] Agent 2 documented baseline before code.
- [ ] Agent 2 documented after metrics.
- [ ] Overlay count is visibly tied to viewport-visible elements, not total diagram elements.

## Browser Console Snippets

```js
// Total DOM nodes
document.querySelectorAll('*').length

// Overlay nodes
document.querySelectorAll('.djs-overlay').length
document.querySelectorAll('.fpcPropertyOverlay').length
```

## Runtime

- Frontend: `http://clearvestnic.ru:5180`
- API: `http://clearvestnic.ru:8088`

## Verdict Rules

- If **any** checklist item fails — even minor — the verdict is:
  - `CHANGES_REQUESTED`
  - Create `REWORK_REQUEST.md` with specific required fixes.
  - Do **not** create `REVIEW_PASS`.
- If **all** checklist items pass:
  - `REVIEW_PASS`
  - Create `REVIEW_REPORT.md` summarizing verification.

## Forbidden Actions

- Do not modify product code.
- Do not commit, push, PR, or deploy.
