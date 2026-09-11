# RAG Preflight Reviewer

- run_id: `20260528T084215Z-64895`
- contour: `fix/canvas-viewport-culling-v1`
- generated_by: `agent-1-planner`
- generated_at: `2026-05-28T08:45:09Z`
- command: `node tools/rag/pm-rag-agent-preflight.mjs --role reviewer --contour "fix/canvas-viewport-culling-v1" --area "ProcessMap review context" --format md --top-k 5`

## Key RAG Findings for Reviewer

### Agent Rules (critical)
- Agent 3 must verify fresh :5180 runtime for UI/runtime work.
- Agent 3 must test the exact user scenario (real mouse drag, not synthetic).
- Agent 3 must use GSD discipline: verify source/runtime truth, run independent validation.
- Diagram performance review must test real mouse drag.

### Contour Facts
- `perf/diagram-property-overlays-viewport-culling-v1`: formal=REVIEW_PASS, user_visible=solved, accepted=true
- `fix/diagram-real-drag-performance-and-engine-decomposition-v1`: formal=REVIEW_PASS, user_visible=not_solved, accepted=false

### Prior Review Patterns
- Previous viewport culling contour passed with criteria:
  1. Overlay count tied to viewport-visible elements.
  2. No unbounded DOM growth after 5+ pan/zoom cycles.
  3. No duplicate overlays after tab switch.
  4. No new console errors.
  5. No mutation requests from pan/zoom.
- Reviewer used Playwright/browser against `http://clearvestnic.ru:5180`.

### Reviewer Context
- This contour targets **base SVG shapes**, not overlays.
- Reviewer must verify:
  - FPS during pan ≥ 45 (hard target).
  - SVG node count during pan ≤ 1500 (hard target).
  - Long tasks ≤ 50 ms (hard target).
  - No regression on small diagram.
- Runtime URL for this contour: `http://localhost:5177` (dev server).
- Test sessions: small=`6318dcf810`, large=`5425e68a8d`.

## Suggested Reviewer Queries
```bash
node tools/rag/pm-rag-search.mjs "ProcessMap BPMN canvas performance review" --top-k 5
node tools/rag/pm-rag-search-facts.mjs "ProcessMap review verification checklist" --top-k 5 --json
```
