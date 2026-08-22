# Agent 3 Acceptance Criteria

**Contour**: `fix/canvas-gpu-compositing-zoom-simplification-v1`  
**Run ID**: `20260528T210002Z-13339`

---

## A. GPU Compositing (PASS required)

- [ ] **A1**: DevTools Layers panel shows `.djs-container` on a separate compositor layer during pan.
- [ ] **A2**: No CPU paint spikes during pan in Performance profile (Paint blocks ≤ 5% of frame time).
- [ ] **A3**: `will-change: transform` present in computed styles of `.djs-canvas.pan-active`.
- [ ] **A4**: `contain: layout paint` present in computed styles during pan.

## B. Zoom Simplification (PASS required)

- [ ] **B1**: At zoom < 0.4: shapes show simplified rendering (no icons, no corner markers).
- [ ] **B2**: At zoom ≥ 0.4: full rendering restored.
- [ ] **B3**: Connection labels hidden at zoom < 0.2.
- [ ] **B4**: Click/hover/selection work at all zoom levels.
- [ ] **B5**: No shapes disappear at any zoom level.

## C. Performance (PASS required)

- [ ] **C1**: Large diagram pan FPS ≥ 55 (was ~30–50).
- [ ] **C2**: No perceived stutter during real mouse drag pan.
- [ ] **C3**: Small diagram pan FPS still 60 (no regression).

## D. Stability (PASS required)

- [ ] **D1**: No shapes disappear.
- [ ] **D2**: Scrubber / minimap works.
- [ ] **D3**: No console errors.
- [ ] **D4**: No backend/API errors from canvas interactions.

## Final Verdict

- **REVIEW_PASS** only if A + B + C + D all pass.
- **CHANGES_REQUESTED** if FPS < 55 or perceived lag remains.
- **BLOCKED** if any stability issue (disappearing shapes, broken scrubber).

## Independent Validation Requirements

1. Perform **real mouse drag** on BPMN canvas (not only programmatic zoom/click).
2. Verify `:5177` is serving current build (`curl -I http://localhost:5177`).
3. Re-run baseline measurement with code temporarily reverted (git stash / stash pop) if possible.
4. Take screenshots of DevTools Layers panel during pan.
