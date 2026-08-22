# RAG Preflight — Planner

**Contour**: `fix/canvas-gpu-compositing-zoom-simplification-v1`  
**Run ID**: `20260528T210002Z-13339`  
**Role**: Agent 1 / Planner  
**Generated**: 2026-05-28T21:04:05Z

---

## Command Executed

```bash
node tools/rag/pm-rag-agent-preflight.mjs --role planner --contour "fix/canvas-gpu-compositing-zoom-simplification-v1" --area "ProcessMap planning context" --format md --top-k 5
```

## Key Facts Retrieved

### Prior Performance Contours
- `audit/canvas-performance-diagnosis-v1`: DOM/SVG creation bottleneck confirmed (3754 SVG nodes on 428-element diagram, FPS ~30 pan).
- `fix/canvas-viewport-culling-v1`: REVIEW_PASS achieved but **REVERTED by user** — shapes disappeared when leaving viewport, scrubber broke.
- `fix/canvas-overlay-debounce-v1`: REVIEW_PASS (FPS ~50 measured), user reports "Лаги не убрались" — perceived lag remains.

### RAG Decisions
- RAG is read-only suggestion layer; must not auto-mutate code.
- Diagram drag lag remained after multiple performance contours → next contour should target paint/composite cost.
- React bundle consumes ~95% CPU during diagram drag interactions.

### Critical Rules for This Contour
- Agent 3 must test **real mouse drag**, not only programmatic zoom/click.
- No product runtime code changes in RAG tooling contours.
- Reviewer must verify fresh `:5177` runtime with `curl` before reviewing UI work.

## Decisions Taken from RAG
1. **Hypothesis pivot**: Previous contours targeted DOM count (culling) and overlay updates (debounce). New contour targets **paint/composite cost** via GPU layers and zoom simplification.
2. **Forbidden approach**: DOM node removal / culling (explicitly reverted by user).
3. **Validation requirement**: DevTools Layers panel proof required (not just FPS numbers).

## Source Identifiers
- RAG index: `tools/rag/pm-rag-agent-preflight.mjs`
- Matched paths: `/srv/obsidian/project-atlas/ProcessMap/AgentReports/fix/analytics-remaining-gaps-5177-label-registry-proof-v1/RAG_PREFLIGHT_PLANNER.md`
- Structured facts registry: `architecture/processmap-agent-rag-knowledge-layer-bootstrap-plan-v1` (REVIEW_PASS)
