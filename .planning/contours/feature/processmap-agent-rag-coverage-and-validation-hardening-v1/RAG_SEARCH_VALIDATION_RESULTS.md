# RAG Search Validation Results

**Generated:** 2026-06-27T07:28:15.136Z
**Index:** .planning/contours/feature/processmap-agent-rag-coverage-and-validation-hardening-v1/RAG_SEARCH_INDEX_BALANCED.json
**Top-K:** 8
**Total Queries:** 7
**Passed:** 6
**Failed:** 1
**Pass Rate:** 86%

## q1-diagram-review-pass-rules

**Query:** gsd reviewer discipline real drag version proof source pass REVIEWER_PROMPT
**Type:** contour_lookup
**Status:** ✅ PASS
**Terms:** 9/9 (100%)
**Paths:** 4/4 (100%)
**Pass Criteria:** At least 3 expected terms appear in top-8 snippets AND at least 2 expected path patterns match top-8 results.

### Top Results

- **#1** `/srv/obsidian/project-atlas/ProcessMap/AgentReports/perf/diagram-modeler-drag-hot-path-and-pointermove-suppression-v1/PLAN.md` — score 53.425
  > ## *Reviewer*/Test *GSD* *Discipline*
Agent 3 is **mandated** to: 1. Run *GSD* availability checks before review. 2. Doc…

- **#2** `/opt/processmap-test/tools/rag/processmap-rag-validation-queries.json` — score 53.360
  > { "*version*": "1.1.2", "project": "ProcessMap", "description": "Validation queries for BM25 search index. Rewritten for…

- **#3** `/srv/obsidian/project-atlas/ProcessMap/AgentReports/fix/diagram-drag-lag-gsd-review-version-ledger-rework-v1/PLAN.md` — score 49.946
  > - [x] Gate 1 — Agent 1 *GSD* *discipline* completed - [x] Gate 2 — *source*/runtime truth captured - [x] Gate 3 — previo…


## q2-perf-drag-hot-path

**Query:** metrics react bundle bpmn perf baseline diagram modeler drag EXEC_REPORT
**Type:** contour_lookup
**Status:** ✅ PASS
**Terms:** 9/9 (100%)
**Paths:** 3/4 (75%)
**Pass Criteria:** At least 3 expected terms appear in top-8 snippets AND at least 2 expected path patterns match top-8 results.

### Top Results

- **#1** `/opt/processmap-test/tools/rag/processmap-rag-validation-queries.json` — score 58.011
  > { "version": "1.1.2", "project": "ProcessMap", "description": "Validation queries for BM25 search index. Rewritten for t…

- **#2** `/srv/obsidian/project-atlas/ProcessMap/AgentReports/perf/process-stage-baseline-jank-v1/PLAN.md` — score 52.300
  > ## *perf*/*diagram*-*modeler*-*drag*-hot-path-and-pointermove-suppression-v1
- **Формальный вердикт:** REVIEW_PASS. - **…

- **#3** `/srv/obsidian/project-atlas/ProcessMap/AgentReports/architecture/processmap-agent-rag-knowledge-layer-bootstrap-plan-v1/PLAN.md` — score 50.322
  > Agent 2 must prepare test queries and expected answers. Minimum set: 1. **"What are the latest rules for *Diagram* REVIE…


## q3-current-diagram-lag

**Query:** react baseline jank processstage drag unresolved bpmn diagram bottlenecks
**Type:** current_bottleneck
**Status:** ❌ FAIL
**Terms:** 7/7 (100%)
**Paths:** 1/4 (25%)
**Pass Criteria:** At least 3 expected terms appear in top-8 snippets AND at least 2 expected path patterns match top-8 results.
**Failure:** Only 1/4 expected path patterns matched in top-8 results.
**Missing paths:** *RUNTIME_PROOF*, *EXEC_REPORT*, *diagram*

### Top Results

- **#1** `/srv/obsidian/project-atlas/ProcessMap/AgentReports/architecture/processmap-agent-rag-knowledge-layer-bootstrap-plan-v1/PLAN.md` — score 56.416
  > Agent 2 must prepare test queries and expected answers. Minimum set: 1. **"What are the latest rules for *Diagram* REVIE…

- **#2** `/opt/processmap-test/tools/rag/processmap-rag-validation-queries.json` — score 53.076
  > { "version": "1.1.2", "project": "ProcessMap", "description": "Validation queries for BM25 search index. Rewritten for t…

- **#3** `/opt/processmap-test/.planning/contours/fix/canvas-shape-rendering-react-audit-v1/RAG_PREFLIGHT_PLANNER.md` — score 49.325
  > [contour: canvas-shape-rendering-*react*-audit-v1] ## *Bottlenecks* Identified by RAG
- [*Diagram*] *Diagram* *drag* lag…


## q4-rag-forbidden-actions

**Query:** RAG forbidden secrets auto mutation bpmn xml product actions drafts truth INDEXING_POLICY
**Type:** policy_lookup
**Status:** ✅ PASS
**Terms:** 9/9 (100%)
**Paths:** 2/4 (50%)
**Pass Criteria:** At least 4 expected terms appear in top-8 snippets AND at least 2 expected path patterns match top-8 results.

### Top Results

- **#1** `/srv/obsidian/project-atlas/ProcessMap/AgentReports/feature/processmap-agent-rag-agent-preflight-integration-v1/REVIEW_REPORT.md` — score 71.025
  > ## 2.6 Preflight CLI — *Policy* Query
```bash node tools/*rag*/pm-*rag*-agent-preflight.mjs \ --role executor \ --query …

- **#2** `/srv/obsidian/project-atlas/ProcessMap/AgentReports/feature/processmap-agent-rag-source-registry-and-index-policy-v1/PLAN.md` — score 68.053
  > - Full *RAG* search server. - Vector database or embeddings. - Package installation. - *Product* runtime UI changes. - B…

- **#3** `/opt/processmap-test/.planning/contours/audit/prod-runtime-source-truth-20260615/RAG_PREFLIGHT_PLANNER.md` — score 67.528
  > [contour: prod-runtime-source-*truth*-20260615] - **score**: 31.423 - **path**: `/srv/obsidian/project-atlas/ProcessMap/…


## q5-indexed-source-paths

**Query:** indexed source paths project atlas planning contours docs handoff frontend backend exclusions SOURCE_REGISTRY
**Type:** policy_lookup
**Status:** ✅ PASS
**Terms:** 9/9 (100%)
**Paths:** 3/4 (75%)
**Pass Criteria:** At least 4 expected terms appear in top-8 snippets AND at least 2 expected path patterns match top-8 results.

### Top Results

- **#1** `/srv/obsidian/project-atlas/ProcessMap/AgentReports/feature/processmap-agent-rag-source-registry-and-index-policy-v1/PLAN.md` — score 58.539
  > ## *Source* *Registry* Plan
**Output file**: `tools/rag/processmap-rag-*source*s.json` **Required *source* roots** (from…

- **#2** `/srv/obsidian/project-atlas/ProcessMap/RAG/INDEX_SOURCES.md` — score 57.122
  > ## *Source* Roots (8)
| ID | Path | Category | Truth Level | Priority | Owner | |----|------|----------|-------------|--…

- **#3** `/opt/processmap-test/tools/rag/processmap-rag-validation-queries.json` — score 55.938
  > { "version": "1.1.2", "*project*": "ProcessMap", "description": "Validation queries for BM25 search index. Rewritten for…


## q6-test-runtime

**Query:** clearvestnic opt processmap test 5180 8088 runtime RUNTIME_NAVIGATION RUNTIME_PROOF
**Type:** runtime_lookup
**Status:** ✅ PASS
**Terms:** 8/8 (100%)
**Paths:** 2/4 (50%)
**Pass Criteria:** At least 3 expected terms appear in top-8 snippets AND at least 2 expected path patterns match top-8 results.

### Top Results

- **#1** `/srv/obsidian/project-atlas/ProcessMap/AgentReports/feature/process-properties-registry-foundation-v1/RAG_PREFLIGHT_REVIEWER.md` — score 47.939
  > ## *ProcessMap* Agent RAG Preflight
Input: - role: reviewer - contour: feature/process-properties-registry-foundation-v1…

- **#2** `/srv/obsidian/project-atlas/ProcessMap/AgentReports/feature/process-properties-registry-foundation-v1/REVIEW_REPORT.md` — score 47.576
  > ## Five-plane *proof*
- `code`: implementation commit `e412919c6e8a6227381c58362133430d2f570741` in `/*opt*/*processmap*…

- **#3** `/opt/processmap-test/.planning/contours/audit/prod-runtime-source-truth-20260615/RAG_PREFLIGHT_PLANNER.md` — score 45.437
  > [contour: prod-*runtime*-source-truth-20260615] ## *Runtime* Facts
- **server_host**: *clearvestnic*.ru (*test*, high) -…


## q7-agent3-diagram-review

**Query:** Agent 3 review diagram performance gsd reviewer discipline fresh 5180 proof real user scenario metrics EXEC_REPORT
**Type:** review_rules
**Status:** ✅ PASS
**Terms:** 9/10 (90%)
**Paths:** 2/4 (50%)
**Pass Criteria:** At least 4 expected terms appear in top-8 snippets AND at least 2 expected path patterns match top-8 results.

### Top Results

- **#1** `/opt/processmap-test/tools/rag/processmap-rag-validation-queries.json` — score 79.018
  > { "version": "1.1.2", "project": "ProcessMap", "description": "Validation queries for BM25 search index. Rewritten for t…

- **#2** `/srv/obsidian/project-atlas/ProcessMap/RAG/Preflight Output Examples.md` — score 72.524
  > ## Example 2 — *Review*er (*Diagram* *Performance* *Review* Rules)
**Command:** ```bash node tools/rag/pm-rag-*agent*-pr…

- **#3** `/srv/obsidian/project-atlas/ProcessMap/AgentReports/feature/processmap-agent-rag-agent-preflight-integration-v1/REVIEW_REPORT.md` — score 70.346
  > ## 2.5 Preflight CLI — *Review*er Mode
```bash node tools/rag/pm-rag-*agent*-preflight.mjs \ --role *review*er \ --conto…


---

**Read-only boundary:** Validation results for retrieval context only.
