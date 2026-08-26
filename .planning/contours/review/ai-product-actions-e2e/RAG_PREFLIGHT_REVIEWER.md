# ProcessMap Agent RAG Preflight

## Input
- **role**: reviewer
- **contour**: review/ai-product-actions-e2e
- **area/query**: AI product actions LLM RAG stage / AI_PROVIDER_NOT_CONFIGURED deepseek rag index product actions
- **generated_at**: 2026-08-25T22:29:25.927Z

## Structured Facts

### Agent Rules
- [critical] RAG is read-only suggestion/context layer (FORBIDDEN: Auto-mutate code, auto-save files, write BPMN XML, or apply Product Actions automatically based on RAG output) (REQUIRED: Treat RAG results as suggestions, warnings, and references only)
- [high] Agent 3 must test the exact user scenario (FORBIDDEN: Substitute a different scenario or skip the exact reproduction steps) (REQUIRED: Reproduce the exact steps described in the contour PLAN.md acceptance criteria)
- [high] No product runtime code changes in RAG tooling contours (FORBIDDEN: Modify frontend/src/, backend/app/, or any product runtime file during RAG work) (REQUIRED: Keep changes under tools/rag/, docs/rag/, .planning/contours/ only)

### User Rejections
- [high] fix/diagram-drag-lag-gsd-review-version-ledger-rework-v1: Formal REVIEW_PASS focused on review process and version ledger, not on actual drag performance fix. → Decompose the engine and address React re-render cost during drag; do not approve based on synthetic tests only.
- [critical] perf/diagram-modeler-drag-hot-path-and-pointermove-suppression-v1: Formal REVIEW_PASS did not correspond to user-visible drag lag resolution. → Investigate React bundle cost rather than only event handler batching; establish real drag baseline with profiler.
- [high] fix/diagram-real-drag-performance-and-engine-decomposition-v1: Formal REVIEW_PASS was granted but user later reported remaining issues with large-canvas lag and version marker overlay. → Relocate version marker off canvas and implement viewer-first design for large canvases.

### Contour Facts
- architecture/processmap-agent-rag-knowledge-layer-bootstrap-plan-v1: formal=REVIEW_PASS, user_visible=solved, accepted=true
- feature/processmap-agent-rag-source-registry-and-index-policy-v1: formal=REVIEW_PASS, user_visible=solved, accepted=true
- feature/processmap-agent-rag-bm25-manifest-search-v1: formal=REVIEW_PASS, user_visible=solved, accepted=true
- feature/processmap-agent-rag-coverage-and-validation-hardening-v1: formal=REVIEW_PASS, user_visible=solved, accepted=true

### Decisions
- RAG is a read-only suggestion and context layer. (All agents, all contours, all RAG usage)
- Product Actions durable truth source is interview.analysis.product_actions[]. (Product feature contours, roadmap planning)

### Validation Facts
- What is forbidden for RAG? → PASS (7/7 PASS on full manifest with improved ranking)
- Which paths should be indexed? → PASS (7/7 PASS on full manifest with improved ranking)
- RAG coverage hardening summary → PASS (1,803 files indexed across 8 sources; 7/7 validation queries PASS; previous state was 3/7 on 500-file sample)
- What are the latest rules for Diagram REVIEW_PASS? → PASS (7/7 PASS on full manifest with improved ranking)
- What happened in perf diagram modeler drag hot path pointermove suppression? → PASS (7/7 PASS on full manifest with improved ranking)
- What are current Diagram lag bottlenecks? → PASS (7/7 PASS on full manifest with improved ranking)
- What is current ProcessMap test runtime? → PASS (7/7 PASS on full manifest with improved ranking)
- How should Agent 3 review Diagram performance contours? → PASS (7/7 PASS on full manifest with improved ranking)

## Supporting Documents

(No BM25 supporting documents returned.)

## Required Gates
- [ ] Reviewer GSD discipline section present in REVIEW_REPORT.md
- [ ] Fresh runtime proof collected (5180/8088)
- [ ] Exact user scenario reproduced
- [ ] Before/after evidence collected
- [ ] User rejection override checked
- [ ] No REVIEW_PASS if user-visible scenario still fails
- [ ] Product runtime unchanged without scope

## Warnings
- ⚠️ User rejection ur-fix-drag-ledger-rework overrides formal REVIEW_PASS for fix/diagram-drag-lag-gsd-review-version-ledger-rework-v1: Formal REVIEW_PASS focused on review process and version ledger, not on actual drag performance fix.
- ⚠️ User rejection ur-perf-drag-hot-path overrides formal REVIEW_PASS for perf/diagram-modeler-drag-hot-path-and-pointermove-suppression-v1: Formal REVIEW_PASS did not correspond to user-visible drag lag resolution.
- ⚠️ User rejection ur-fix-real-drag-engine overrides formal REVIEW_PASS for fix/diagram-real-drag-performance-and-engine-decomposition-v1: Formal REVIEW_PASS was granted but user later reported remaining issues with large-canvas lag and version marker overlay.
- ⚠️ No runtime facts matched query — runtime proof may be missing.
- ⚠️ REMINDER: Do not print secrets. Preflight output may contain paths but not credentials.
- ⚠️ BM25 search returned no results or index unavailable. Facts-only mode active.

## Suggested Next Queries
- ```bash
node tools/rag/pm-rag-search.mjs "AI product actions LLM RAG stage" --top-k 5
```
- ```bash
node tools/rag/pm-rag-search-facts.mjs "AI product actions LLM RAG stage" --top-k 8 --json
```
- ```bash
node tools/rag/pm-rag-agent-preflight.mjs --role reviewer --contour "review/ai-product-actions-e2e" --area "AI product actions LLM RAG stage" --format md
```
- ```bash
node tools/rag/pm-rag-validate-facts.mjs
```
- ```bash
node tools/rag/pm-rag-run-validation-queries.mjs --top-k 8
```
