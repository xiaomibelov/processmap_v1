# RAG Preflight — Planner

**Contour**: `audit/to-be-technological-operations-current-stage-check-v1`  
**Run ID**: `20260520T184059Z-28875`  
**Generated**: 2026-05-20T18:41:46.694Z  
**Command**: `node tools/rag/pm-rag-agent-preflight.mjs --role planner --contour "audit/to-be-technological-operations-current-stage-check-v1" --area "ProcessMap planning context" --format md --top-k 5`

## Key Facts Used

- **Enterprise contours**: No prior enterprise/tenant/org contours in RAG registry.
- **RAG coverage**: RAG knowledge layer is bootstrapped and validated (BM25 search, structured facts registry, agent preflight integration).
- **Bottleneck registry**: Diagram drag lag remains unresolved after multiple performance contours; next recommended is `perf/process-stage-baseline-jank-v1`.
- **No auto-mutation rule**: RAG is read-only suggestion layer; this audit must not mutate product code.

## Decisions Taken from RAG

- This audit is **source-review-only**; no runtime profiling or product code changes.
- Use existing `docs/enterprise_target_model_to_be.md` and `docs/enterprise_impl_factpack.md` as canonical TO-BE references.
- RAG does not contain enterprise-specific implementation evidence; rely on direct codebase inspection.
