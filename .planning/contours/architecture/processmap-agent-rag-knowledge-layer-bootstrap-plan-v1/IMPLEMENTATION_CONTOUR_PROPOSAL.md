# IMPLEMENTATION_CONTOUR_PROPOSAL — ProcessMap Agent RAG / Knowledge Layer

Contour: architecture/processmap-agent-rag-knowledge-layer-bootstrap-plan-v1

---

## Overview

This document proposes 4 bounded implementation contours to build the agent RAG/RAK knowledge layer. Each contour has a narrow scope, concrete deliverables, and explicit acceptance criteria.

---

## Contour 1: implementation/rag-source-registry-and-indexer-v1

### Scope
Build the foundational indexing pipeline: source registry, document classifier, chunking, and secrets scanner. No vector DB yet — extend existing BM25 or add simple embeddings.

### Deliverables

1. `backend/app/rag/agent_source_registry.py` — Source Registry manifest loader
2. `backend/app/rag/agent_document_classifier.py` — Document classifier rules engine
3. `backend/app/rag/agent_chunker.py` — Chunking pipeline for docs + code
4. `backend/app/rag/agent_secrets_scanner.py` — Pre-index secrets scanner
5. `backend/app/rag/agent_indexer.py` — Index documents into existing BM25 + optional embeddings
6. `INDEX_SOURCES.md` — Auto-generated source registry manifest
7. Tests: `backend/tests/test_rag_agent_*.py`

### Dependencies
- Existing backend RAG (`backend/app/rag/search.py`, `backend/app/rag/indexer.py`)
- Project Atlas filesystem access
- Planning contours filesystem access

### Risk Mitigation
| Risk | Mitigation |
|------|------------|
| Secrets leak | Secrets scanner runs before every insert; fail-closed |
| Over-indexing noise | Classifier + priority tiers limit noise |
| BM25 insufficient | Design embedding interface; implement later if needed |
| File system access failures | Graceful skip + log; do not crash pipeline |

### Acceptance Criteria
- [ ] All sources from `SOURCE_INVENTORY.md` are registerable
- [ ] Secrets scanner rejects all files from `INDEXING_POLICY.md` hard-exclude list
- [ ] Document classifier assigns correct class to 90%+ of test samples
- [ ] Chunking produces chunks under max token limits
- [ ] Every indexed chunk has `excluded_sensitive=false` proof in metadata
- [ ] No product code changes outside `backend/app/rag/`
- [ ] Existing org-scoped RAG endpoints remain untouched

---

## Contour 2: implementation/rag-agent-prompt-integration-v1

### Scope
Add RAG preflight blocks to Agent 1/2/3 prompts and implement query templates per role. Add RAG context logging to reports.

### Deliverables

1. Updated agent prompt templates with RAG preflight blocks:
   - `.agents/agent1-planner/prompts/*` — Planner RAG block
   - `.agents/agent2-executor/prompts/*` — Executor RAG block
   - `.agents/agent3-reviewer/prompts/*` — Reviewer RAG block
2. Query template definitions per role (YAML/JSON config)
3. `RAG_CONTEXT_LOG.md` template for reports
4. `tools/pm-agent-rag-query.sh` — CLI helper for agents to query RAG
5. Tests: validate query templates return expected sources for validation queries

### Dependencies
- Contour 1 (source registry and indexer must be operational)
- Agent prompt structure in `.agents/`

### Risk Mitigation
| Risk | Mitigation |
|------|------------|
| Agent ignores RAG context | Mandatory preflight block + logging requirement in prompt |
| Query templates too rigid | Parametric templates; agents can override keywords |
| RAG unavailable breaks workflow | Fallback documented: proceed with baseline knowledge |

### Acceptance Criteria
- [ ] All 3 agent roles have RAG preflight block in their prompt templates
- [ ] Query templates return relevant sources for all 6 validation queries
- [ ] `PLAN.md`, `EXEC_REPORT.md`, `REVIEW_REPORT.md` templates include RAG context section
- [ ] Fallback behavior documented when RAG is unavailable
- [ ] No auto-mutation language in any prompt

---

## Contour 3: implementation/rag-project-atlas-sync-pipeline-v1

### Scope
Auto-detect new contour reports, mirror to Project Atlas, and trigger incremental re-index.

### Deliverables

1. `tools/pm-agent-rag-sync.sh` — Detect new contour completions and trigger re-index
2. `backend/app/rag/agent_sync_pipeline.py` — Incremental re-index job
3. Update `tools/pm-agent-mirror-report.sh` to notify sync pipeline after mirror
4. `SYNC_PIPELINE_LOG.md` — Log format for sync events
5. Admin dashboard indicator for last sync time

### Dependencies
- Contour 1 (indexer)
- Existing `tools/pm-agent-mirror-report.sh`
- Project Atlas directory structure

### Risk Mitigation
| Risk | Mitigation |
|------|------------|
| Sync loops | De-duplication by file hash + mtime |
| Race conditions during contour execution | Only process `READY_FOR_REVIEW` markers |
| Stale index | Freshness metadata + scheduled full re-index option |

### Acceptance Criteria
- [ ] New contour completion triggers incremental re-index within 60 seconds
- [ ] `CHANGES_REQUESTED` contours are indexed as high-priority warnings
- [ ] `REVIEW_PASS` contours are indexed as normal-priority evidence
- [ ] Sync pipeline logs every event with timestamp and contour id
- [ ] Admin can see last successful sync time
- [ ] No duplicate indexing of unchanged files

---

## Contour 4: implementation/rag-validation-and-test-queries-v1

### Scope
Run validation queries, measure precision/recall, and tune chunking/metadata.

### Deliverables

1. `VALIDATION_RESULTS.md` — Results for all 6+ queries
2. `RAG_TUNING_LOG.md` — Changes made to chunking/boost weights
3. Precision/recall metrics per query
4. Updated chunking strategy if tuning reveals issues
5. Updated metadata boost weights if retrieval is poor

### Dependencies
- Contour 1 (indexer with corpus)
- Contour 2 (query templates)
- `VALIDATION_QUERIES.md` from this architecture contour

### Risk Mitigation
| Risk | Mitigation |
|------|------------|
| Low precision | Tune BM25 k1/b; add metadata boosts; consider embeddings |
| Low recall | Increase top-k; broaden query terms; add synonym expansion |
| Over-tuning to test set | Hold out 1 query for final validation |

### Acceptance Criteria
- [ ] All 6 primary validation queries return expected sources
- [ ] Precision ≥ 80% (4/5 retrieved sources are relevant)
- [ ] Recall ≥ 80% (4/5 expected sources are retrieved)
- [ ] Tuning changes are documented with before/after metrics
- [ ] No regression on existing org-scoped RAG search quality

---

## Dependency Graph

```
Contour 1: Source Registry + Indexer
    │
    ├──► Contour 2: Agent Prompt Integration
    │       │
    │       └──► Contour 4: Validation + Tuning
    │
    └──► Contour 3: Atlas Sync Pipeline
            │
            └──► Contour 4: Validation + Tuning
```

Contour 4 depends on all previous contours but can start partial validation after Contour 2.

---

## Non-Goals (All Contours)

- Fine-tuning LLM weights
- Replacing existing Agent 1/2/3 workflow
- Real-time streaming indexing
- Multi-tenant vector DB for org customers
- MCP server repair
- GSD tooling fixes
- Modifying existing org-scoped RAG endpoints for customer data

---

## Proposed Timeline (Relative)

| Contour | Estimated Effort | Prerequisites |
|---------|------------------|---------------|
| 1. Source Registry + Indexer | 1 sprint | This architecture contour approved |
| 2. Agent Prompt Integration | 0.5 sprint | Contour 1 complete |
| 3. Atlas Sync Pipeline | 0.5 sprint | Contour 1 complete |
| 4. Validation + Tuning | 0.5 sprint | Contours 1–3 complete |

