# RAG Search Validation Results

**Generated:** 2026-05-20T22:41:03.961Z
**Index:** .planning/contours/feature/processmap-agent-rag-coverage-and-validation-hardening-v1/RAG_SEARCH_INDEX_BALANCED.json
**Top-K:** 8
**Total Queries:** 7
**Passed:** 7
**Failed:** 0
**Pass Rate:** 100%

## q1-diagram-review-pass-rules

**Query:** gsd reviewer discipline real drag version proof source pass REVIEWER_PROMPT
**Type:** contour_lookup
**Status:** ✅ PASS
**Terms:** 9/9 (100%)
**Paths:** 4/4 (100%)
**Pass Criteria:** At least 3 expected terms appear in top-8 snippets AND at least 2 expected path patterns match top-8 results.

### Top Results

- **#1** `/opt/processmap-test/.planning/contours/perf/diagram-modeler-drag-hot-path-and-pointermove-suppression-v1/PLAN.md` — score 40.246
  > [contour: diagram-modeler-*drag*-hot-path-and-pointermove-suppression-v1] ## *Reviewer*/Test *GSD* *Discipline*
Agent 3 …

- **#2** `/srv/obsidian/project-atlas/ProcessMap/AgentReports/perf/diagram-modeler-drag-hot-path-and-pointermove-suppression-v1/PLAN.md` — score 37.246
  > ## *Reviewer*/Test *GSD* *Discipline*
Agent 3 is **mandated** to: 1. Run *GSD* availability checks before review. 2. Doc…

- **#3** `/opt/processmap-test/.planning/contours/perf/diagram-modeler-drag-hot-path-and-pointermove-suppression-v1/REVIEWER_PROMPT.md` — score 35.204
  > [contour: diagram-modeler-*drag*-hot-path-and-pointermove-suppression-v1] - REVIEW_*PASS* forbidden if user-visible *dra…


## q2-perf-drag-hot-path

**Query:** metrics react bundle bpmn perf baseline diagram modeler drag EXEC_REPORT
**Type:** contour_lookup
**Status:** ✅ PASS
**Terms:** 8/9 (89%)
**Paths:** 3/4 (75%)
**Pass Criteria:** At least 3 expected terms appear in top-8 snippets AND at least 2 expected path patterns match top-8 results.

### Top Results

- **#1** `/opt/processmap-test/.planning/contours/perf/process-stage-baseline-jank-v1/PLAN.md` — score 39.791
  > [contour: process-stage-*baseline*-jank-v1] ## *perf*/*diagram*-*modeler*-*drag*-hot-path-and-pointermove-suppression-v1…

- **#2** `/opt/processmap-test/.planning/contours/perf/diagram-human-perceived-pan-and-drag-smoothness-v1/PLAN.md` — score 38.712
  > [contour: *diagram*-human-perceived-pan-and-*drag*-smoothness-v1] ## *perf*/*diagram*-*modeler*-*drag*-hot-path-and-poin…

- **#3** `/srv/obsidian/project-atlas/ProcessMap/AgentReports/perf/process-stage-baseline-jank-v1/PLAN.md` — score 36.791
  > ## *perf*/*diagram*-*modeler*-*drag*-hot-path-and-pointermove-suppression-v1
- **Формальный вердикт:** REVIEW_PASS. - **…


## q3-current-diagram-lag

**Query:** react baseline jank processstage drag unresolved bpmn diagram bottlenecks
**Type:** current_bottleneck
**Status:** ✅ PASS
**Terms:** 4/7 (57%)
**Paths:** 2/4 (50%)
**Pass Criteria:** At least 3 expected terms appear in top-8 snippets AND at least 2 expected path patterns match top-8 results.

### Top Results

- **#1** `/opt/processmap-test/.planning/contours/perf/process-stage-baseline-jank-v1/RAG_PREFLIGHT_EXECUTOR.md` — score 44.649
  > [contour: process-stage-*baseline*-*jank*-v1] ## #4 — Query 3: Current *Diagram* Lag *Bottlenecks*
- **score**: 32.775 -…

- **#2** `/opt/processmap-test/.planning/contours/perf/process-stage-baseline-jank-v1/RAG_PREFLIGHT_PLANNER.md` — score 44.649
  > [contour: process-stage-*baseline*-*jank*-v1] ## #1 — Query 3: Current *Diagram* Lag *Bottlenecks*
- **score**: 52.696 -…

- **#3** `/opt/processmap-test/.planning/contours/perf/process-stage-baseline-jank-v1/RAG_PREFLIGHT_PLANNER.md` — score 37.268
  > [contour: process-stage-*baseline*-*jank*-v1] - **score**: 39.156 - **path**: `/srv/obsidian/project-atlas/ProcessMap/Ag…


## q4-rag-forbidden-actions

**Query:** RAG forbidden secrets auto mutation bpmn xml product actions drafts truth INDEXING_POLICY
**Type:** policy_lookup
**Status:** ✅ PASS
**Terms:** 9/9 (100%)
**Paths:** 3/4 (75%)
**Pass Criteria:** At least 4 expected terms appear in top-8 snippets AND at least 2 expected path patterns match top-8 results.

### Top Results

- **#1** `/srv/obsidian/project-atlas/ProcessMap/AgentReports/feature/processmap-agent-rag-agent-preflight-integration-v1/REVIEW_REPORT.md` — score 49.769
  > ## 2.6 Preflight CLI — *Policy* Query
```bash node tools/*rag*/pm-*rag*-agent-preflight.mjs \ --role executor \ --query …

- **#2** `/opt/processmap-test/docs/rag/PROCESSMAP_RAG_INDEXING_POLICY.md` — score 47.005
  > ## *Forbidden* (*RAG*/RAK must NOT do)
| Action | Allowed? | |--------|----------| | *Auto*-mutate code | **No** | | *Au…

- **#3** `/srv/obsidian/project-atlas/ProcessMap/RAG/INDEXING_POLICY.md` — score 47.005
  > ## *Forbidden* (*RAG*/RAK must NOT do)
| Action | Allowed? | |--------|----------| | *Auto*-mutate code | **No** | | *Au…


## q5-indexed-source-paths

**Query:** indexed source paths project atlas planning contours docs handoff frontend backend exclusions SOURCE_REGISTRY
**Type:** policy_lookup
**Status:** ✅ PASS
**Terms:** 8/9 (89%)
**Paths:** 4/4 (100%)
**Pass Criteria:** At least 4 expected terms appear in top-8 snippets AND at least 2 expected path patterns match top-8 results.

### Top Results

- **#1** `/srv/obsidian/project-atlas/ProcessMap/RAG/Validation Queries.md` — score 42.555
  > ## Q1 — *Source* *Registry* Completeness
**Question:** Does the *registry* include all 8 required *source* roots? **Expe…

- **#2** `/srv/obsidian/project-atlas/ProcessMap/RAG/Agent Knowledge Layer Bootstrap Plan.md` — score 41.608
  > ## *Source* Inventory Summary
| *Source* | Files | *Indexed* Est. | |--------|-------|--------------| | *Project* *Atlas…

- **#3** `/srv/obsidian/project-atlas/ProcessMap/RAG/INDEX_SOURCES.md` — score 41.005
  > ## *Source* Roots (8)
| ID | Path | Category | Truth Level | Priority | Owner | |----|------|----------|-------------|--…


## q6-test-runtime

**Query:** clearvestnic opt processmap test 5180 8088 runtime RUNTIME_NAVIGATION RUNTIME_PROOF
**Type:** runtime_lookup
**Status:** ✅ PASS
**Terms:** 8/8 (100%)
**Paths:** 3/4 (75%)
**Pass Criteria:** At least 3 expected terms appear in top-8 snippets AND at least 2 expected path patterns match top-8 results.

### Top Results

- **#1** `/srv/obsidian/project-atlas/ProcessMap/AgentReports/feature/product-actions-registry-backend-view-model-hardening-v1/RAG_PREFLIGHT_PLANNER.md` — score 33.592
  > ## *Runtime* Facts
- **server_host**: *clearvestnic*.ru (*test*, high) - **repo_root**: /*opt*/*processmap*-*test* (*tes…

- **#2** `/srv/obsidian/project-atlas/ProcessMap/AgentReports/feature/process-properties-registry-foundation-v1/RAG_PREFLIGHT_REVIEWER.md` — score 32.039
  > ## *ProcessMap* Agent RAG Preflight
Input: - role: reviewer - contour: feature/process-properties-registry-foundation-v1…

- **#3** `/srv/obsidian/project-atlas/ProcessMap/AgentReports/feature/process-properties-registry-foundation-v1/EXEC_REPORT.md` — score 31.390
  > *Runtime* services before ready marker: ```text gateway: *processmap*_*test*-gateway-1, 0.0.0.0:*5180* -> nginx:80 api: …


## q7-agent3-diagram-review

**Query:** Agent 3 review diagram performance gsd reviewer discipline fresh 5180 proof real user scenario metrics EXEC_REPORT
**Type:** review_rules
**Status:** ✅ PASS
**Terms:** 9/10 (90%)
**Paths:** 3/4 (75%)
**Pass Criteria:** At least 4 expected terms appear in top-8 snippets AND at least 2 expected path patterns match top-8 results.

### Top Results

- **#1** `/opt/processmap-test/.planning/contours/perf/diagram-human-perceived-pan-and-drag-smoothness-v1/RAG_PREFLIGHT_REVIEWER.md` — score 51.220
  > [contour: *diagram*-human-perceived-pan-and-drag-smoothness-v1] - [critical] *Diagram* *performance* *review* must test …

- **#2** `/opt/processmap-test/.planning/contours/perf/diagram-human-perceived-pan-and-drag-smoothness-v1/RAG_PREFLIGHT_REVIEWER.md` — score 47.789
  > [contour: *diagram*-human-perceived-pan-and-drag-smoothness-v1] - [ ] *Review*er *GSD* *discipline* section present in *…

- **#3** `/srv/obsidian/project-atlas/ProcessMap/RAG/Preflight Output Examples.md` — score 46.412
  > ## Example 2 — *Review*er (*Diagram* *Performance* *Review* Rules)
**Command:** ```bash node tools/rag/pm-rag-*agent*-pr…


---

**Read-only boundary:** Validation results for retrieval context only.
