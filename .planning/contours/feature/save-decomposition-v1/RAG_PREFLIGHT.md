# RAG Preflight — feature/save-decomposition-v1

**Role:** executor  
**Contour:** `feature/save-decomposition-v1`  
**Generated:** 2026-06-26T22:11:46Z  
**Command:** `node tools/rag/pm-rag-agent-preflight.mjs --role executor --contour feature/save-decomposition-v1`

## Key facts retained

- **RAG is read-only suggestion layer** — must not auto-mutate code, BPMN XML, or Product Actions.
- **No PR/merge/deploy without explicit user approval** (binding for all agents).
- **Large god files require decomposition-first** before adding new logic (relevant to `_legacy_main.py`).
- Prior accepted contours:
  - `architecture/processmap-agent-rag-knowledge-layer-bootstrap-plan-v1` — REVIEW_PASS.
  - `feature/processmap-agent-rag-source-registry-and-index-policy-v1` — REVIEW_PASS.

## Warnings

- BM25 returned no supporting documents for this contour; facts-only mode.
- No runtime facts matched query — runtime proof must be collected during implementation.

## Decisions taken from RAG

1. Treat decomposition as bounded refactor inside `backend/app/save_services/`; do not broaden into full microservice extraction in this contour.
2. Keep product runtime changes minimal and isolated; no auto-mutation based on RAG output.
