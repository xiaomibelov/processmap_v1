# RAG Preflight — Reviewer

**Contour**: `fix/canvas-overlay-debounce-v1`  
**Run ID**: `20260528T190318Z-4670`  
**Role**: reviewer  
**Generated**: 2026-05-28T19:06:00Z

## Command (to be run by Agent 3)
```bash
node tools/rag/pm-rag-agent-preflight.mjs --role reviewer --contour "fix/canvas-overlay-debounce-v1" --area "ProcessMap overlay debounce verification" --format md --top-k 5
```

## Key Facts from Planner RAG

| Fact | Relevance for Reviewer |
|------|------------------------|
| RAG is read-only; forbidden to auto-mutate code | Reviewer must independently verify runtime, not trust Worker reports alone |
| Previous drag perf contours not_solved | This contour is a focused alternative; verify it actually works |
| React bundle ~95% CPU during drag | Verify CPU load reduced after debounce |
| No runtime facts matched preflight | Reviewer MUST establish fresh runtime proof on :5177 |
| Diagram performance review must test real mouse drag | CRITICAL: synthetic tests insufficient |
| Agent 3 must verify fresh :5180 runtime for UI/runtime work | For this contour: verify :5177 runtime |

## Reviewer Checklist from RAG
- [ ] Source/runtime truth captured independently.
- [ ] Bounded scope verified (only overlay debounce, no culling).
- [ ] Acceptance criteria verified with real mouse drag.
- [ ] No product code written by Agent 1 (Planner).
- [ ] Runtime proof on :5177 confirmed.
