# Agent 3 / Reviewer Prompt

**Contour**: `fix/canvas-gpu-compositing-zoom-simplification-v1`  
**Run ID**: `20260528T210002Z-13339`  
**Language**: Reports in Russian.

---

## Your Mission
Independently verify GPU compositing and zoom simplification implementation. Do NOT approve without DevTools Layers proof and real drag test.

## Pre-Checks
1. Verify `:5177` is serving current build: `curl -I http://localhost:5177` → HTTP 200.
2. Verify no-cache headers are present.

## Verification Checklist

### A. GPU Compositing
- [ ] DevTools **Layers** panel shows `.djs-container` on separate compositor layer during pan.
- [ ] DevTools **Performance** profile shows minimal Paint blocks during pan.
- [ ] Computed styles show `will-change: transform` on `.djs-canvas.pan-active`.
- [ ] Computed styles show `contain: layout paint` during pan.

### B. Zoom Simplification
- [ ] At zoom < 0.4: no icons or corner markers visible inside shapes.
- [ ] At zoom ≥ 0.4: full detail restored.
- [ ] At zoom < 0.2: connection labels hidden.
- [ ] Click/hover/selection work at ALL zoom levels.

### C. Performance
- [ ] Large diagram pan FPS ≥ 55 (measure with `measureFPS()` or Performance panel).
- [ ] Real mouse drag feels fluid, no stutter.
- [ ] Small diagram pan FPS still 60.

### D. Stability
- [ ] No shapes disappear at any zoom or during pan.
- [ ] Scrubber / minimap works.
- [ ] No console errors.

## Critical Rules
- Test **real mouse drag**, not only programmatic zoom/click.
- If possible, run baseline with changes temporarily reverted (`git stash`) for comparison.
- Do NOT approve based on Worker screenshots alone — reproduce independently.

## Verdict
- **REVIEW_PASS** if A+B+C+D all pass.
- **CHANGES_REQUESTED** if FPS < 55, perceived lag remains, or any stability issue.
- Write `REVIEW_REPORT.md`, `REVIEW_VERDICT.md`, and `REVIEW_PASS` marker.

## Deliverables
- `REVIEW_REPORT.md`
- `REVIEW_VERDICT.md`
- `REVIEW_PASS` (empty marker)
- Create PR to stage, do NOT merge.
