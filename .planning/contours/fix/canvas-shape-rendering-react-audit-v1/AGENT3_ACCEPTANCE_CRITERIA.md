# Agent 3 Acceptance Criteria

**Контур**: `fix/canvas-shape-rendering-react-audit-v1`  
**Run ID**: `20260529T000236Z-27528`

---

## A. Overlays stability (CRITICAL)

PASS required:
- [ ] Overlays visible during entire pan operation.
- [ ] Overlays do NOT disappear at any point.
- [ ] Overlays correctly positioned after pan stops.
- [ ] No overlay detachment from shapes.

FAIL = immediate `CHANGES_REQUESTED`.

## B. CSS safety

PASS required:
- [ ] No `will-change` on `.djs-container` or SVG.
- [ ] No `contain` on `.djs-container`.
- [ ] No `transform` / `translateZ` on `.djs-container`.
- [ ] Only `shape-rendering` and `vector-effect` added.

FAIL = `CHANGES_REQUESTED`.

## C. React re-render audit

PASS required:
- [ ] `BpmnStage` does NOT re-render during pan (verified via React DevTools or logging).
- [ ] Any `setState` on `viewbox.changed` removed or moved to ref.
- [ ] No state updates triggered by pan events.

FAIL = `CHANGES_REQUESTED`.

## D. Performance

PASS required:
- [ ] Large diagram pan FPS ≥ 38 (was ~30).
- [ ] Small diagram pan FPS still 60.
- [ ] No perceived stutter.

FAIL = `CHANGES_REQUESTED`.

## E. Runtime

PASS required:
- [ ] `:5177` serves current build.
- [ ] No console errors.
- [ ] No 502 errors.

FAIL = `CHANGES_REQUESTED`.

## Final verdict

- `REVIEW_PASS` only if A+B+C+D+E pass.
- `CHANGES_REQUESTED` if ANY check fails.
