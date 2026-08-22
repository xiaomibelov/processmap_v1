# RAG Preflight — Reviewer

**Contour**: `fix/canvas-gpu-compositing-zoom-simplification-v1`  
**Run ID**: `20260528T210002Z-13339`  
**Role**: Agent 3 / Reviewer  
**Generated**: 2026-05-28T21:04:05Z

---

## Key Facts from RAG

### Previous Contour Outcomes
- `fix/canvas-viewport-culling-v1`: achieved REVIEW_PASS in Agent 3 but **user REVERTED** due to disappearing shapes and broken scrubber.
- `fix/canvas-overlay-debounce-v1`: REVIEW_PASS, FPS ~50, but user perceived lag remains.

### Critical Validation Requirements
- Agent 3 must test **real mouse drag**, not synthetic events.
- Agent 3 must verify fresh `:5177` runtime before UI review.
- Diagram performance review must test actual pointer drag and observe jank/frame drops.

### What NOT to Accept
- Do NOT accept Worker screenshots as sole proof of Layers panel.
- Do NOT accept Playwright headless FPS as proof of ≥55 (headless caps at ~50 FPS).
- Do NOT approve if shapes disappear at any zoom level.

## Reviewer-Specific Decisions
1. Must reproduce DevTools Layers verification independently.
2. Must run real drag test in headed Chrome (not headless Playwright).
3. Must verify zoom simplification at 0.3x, 0.5x, and 1.0x zoom levels.
