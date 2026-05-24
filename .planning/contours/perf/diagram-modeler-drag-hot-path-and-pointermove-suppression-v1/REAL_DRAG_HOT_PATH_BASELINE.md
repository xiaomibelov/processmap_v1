# Real Drag Hot Path Baseline

## Contour
`perf/diagram-modeler-drag-hot-path-and-pointermove-suppression-v1`

---

## Test Environment Limitation

Automated real drag baseline capture was attempted via Playwright MCP but blocked by app auth/rendering state in the headless browser context. The `/api/auth/me` endpoint returned 401 on initial cold open, and the app showed disabled tabs without loading the target diagram session (`wewe / Описание процессов Долгопрудный`).

This is a **known test environment limitation**, not a code regression. The previous contour (`fix/diagram-drag-lag-gsd-review-version-ledger-rework-v1`) experienced the same issue.

---

## Previous Contour Baseline (Before This Fix)

From `fix/diagram-drag-lag-gsd-review-version-ledger-rework-v1`:

| Scenario | Long Tasks | Total Duration | Notes |
|----------|------------|----------------|-------|
| Quick canvas pan | ~14 | ~1,800ms | Large diagram, overlays off |
| Stepped canvas pan | ~88 | ~11,600ms | Stress signal |
| Element drag | Unknown | Unknown | Playwright synthetic events inconsistent |

---

## Expected After-Fix Baseline

Based on code changes:

| Scenario | Expected Long Tasks | Expected Total | Rationale |
|----------|---------------------|----------------|-----------|
| Quick canvas pan | Similar or slightly better | Similar or slightly better | No decor fanout from `readySignal` changes during pan |
| Stepped canvas pan | Reduced | Reduced | Decor fanout completely suppressed during drag |
| Element drag | Reduced | Reduced | No autosave thrashing, no decor fanout, no mutation staging per frame |

---

## Agent 3 Required Verification

Agent 3 must:
1. Open fresh browser context to `http://clearvestnic.ru:5180/?cb=<timestamp>`
2. Verify v1.0.128 in footer
3. Navigate to large Diagram (`wewe / Описание процессов Долгопрудный`)
4. Confirm overlays off: `document.querySelectorAll('.fpcPropertyOverlay').length === 0`
5. Perform real mouse canvas drag (quick and stepped)
6. Perform real mouse element drag
7. Record before/after metrics
8. Target: quick drag ≤8 long tasks, ≤1,000ms total
9. Verify 0 PUT/PATCH during drag
10. Verify one autosave after drag end if element moved
