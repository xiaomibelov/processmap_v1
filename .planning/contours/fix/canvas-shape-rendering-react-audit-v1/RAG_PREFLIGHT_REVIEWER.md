# RAG Preflight Reviewer

- run_id: `20260529T000236Z-27528`
- contour: `fix/canvas-shape-rendering-react-audit-v1`
- generated_by: Agent 1 / Planner
- generated_at: 2026-05-29T00:05:00Z

## Commands Run

```bash
node tools/rag/pm-rag-agent-preflight.mjs --role reviewer --contour "fix/canvas-shape-rendering-react-audit-v1" --area "ProcessMap review context" --format md --top-k 5
```

## Key Facts for Reviewer

### Previous contour outcomes
- `fix/canvas-viewport-culling-v1`: REVERTED — shapes disappeared when leaving viewport.
- `fix/canvas-overlay-debounce-v1`: REVIEW_PASS — FPS ~58.7 but perceived lag remained.
- `fix/canvas-gpu-compositing-zoom-simplification-v1`: REVERTED — overlays disappeared during pan due to `will-change`/`contain` on `.djs-container`.

### What this contour adds
- CSS-only `shape-rendering: optimizeSpeed` on SVG (no layers, no positioning changes).
- React re-render audit — moving `setState` on `viewbox.changed` to `useRef`.

### What reviewer must verify
1. Overlays visible during pan (CRITICAL).
2. No forbidden CSS (`will-change`, `contain`, `translateZ`) on `.djs-container`.
3. `BpmnStage` does not re-render during pan.
4. Large diagram FPS ≥ 38.
5. Small diagram FPS = 60.
6. `:5177` serves current build.

### Runtime truth warnings
- Previous contour (`fix/canvas-gpu-compositing-zoom-simplification-v1`) had runtime/source mismatch: dev server ran from `/app` instead of `/opt/processmap-test/frontend`.
- Reviewer MUST verify served bundle contains changes by curling CSS/JS assets.
- Reviewer MUST verify HTTP 200 on `:5177` with no-cache headers.
