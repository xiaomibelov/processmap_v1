# RAG Search Validation Results

**Generated:** 2026-05-16T15:24:07.431Z
**Top-K:** 8
**Total Queries:** 7
**Passed:** 3
**Failed:** 4

## q1-diagram-review-pass-rules

**Query:** What are the latest rules for Diagram REVIEW_PASS?
**Status:** ✅ PASS
**Terms:** 8/9 (89%)
**Paths:** 2/4 (50%)
**Pass Criteria:** At least 3 expected terms appear in top-8 snippets AND at least 2 expected path patterns match top-8 results.

### Top Results

- **#1** `/srv/obsidian/project-atlas/ProcessMap/AgentReports/feature/processmap-agent-rag-bm25-manifest-search-v1/REVIEWER_PROMPT.md` — score 25.948
  > node tools/rag/pm-rag-search.mjs "*latest* *rules* for *Diagram* *REVIEW*_*PASS*" --top-k 8…

- **#2** `/opt/processmap-test/.planning/contours/tooling/processmap-agent3-ui-review-skill-binding-v1/REVIEWER_PROMPT.md` — score 19.956
  > - You cannot *pass* a UI contour from source *review* alone. - If Playwright MCP is unavailable, verdict is `*REVIEW*_BL…

- **#3** `/opt/processmap-test/.planning/contours/perf/diagram-property-overlays-viewport-culling-v1/REVIEWER_PROMPT.md` — score 18.160
  > - If **any** checklist item fails — even minor — the verdict is: - `CHANGES_REQUESTED` - Create `REWORK_REQUEST.md` with…


## q2-perf-drag-hot-path

**Query:** What happened in perf diagram modeler drag hot path pointermove suppression?
**Status:** ❌ FAIL
**Terms:** 1/9 (11%)
**Paths:** 3/4 (75%)
**Pass Criteria:** At least 3 expected terms appear in top-10 snippets AND at least 2 expected path patterns match top-10 results.

### Top Results

- **#1** `/srv/obsidian/project-atlas/ProcessMap/AgentReports/feature/processmap-agent-rag-bm25-manifest-search-v1/REVIEWER_PROMPT.md` — score 48.110
  > node tools/rag/pm-rag-search.mjs "*What* *happened* in *perf*/*diagram*-*modeler*-*drag*-*hot*-*path*-and-*pointermove*-…

- **#2** `/opt/processmap-test/.planning/contours/perf/diagram-modeler-drag-hot-path-and-pointermove-suppression-v1/EXEC_REPORT.md` — score 42.403
  > **Executor**: Agent 2 **Run ID**: `20260516T080003Z-79254` **Branch**: `fix/lockfile-sync-test` **HEAD**: `a9a9d9c5f468d…

- **#3** `/opt/processmap-test/.planning/contours/perf/diagram-modeler-drag-hot-path-and-pointermove-suppression-v1/RUNTIME_BEFORE_AFTER.md` — score 41.639
  > `*perf*/*diagram*-*modeler*-*drag*-*hot*-*path*-and-*pointermove*-*suppression*-v1` ---…


## q3-current-diagram-lag

**Query:** What are current Diagram lag bottlenecks?
**Status:** ✅ PASS
**Terms:** 4/7 (57%)
**Paths:** 2/4 (50%)
**Pass Criteria:** At least 3 expected terms appear in top-8 snippets AND at least 2 expected path patterns match top-8 results.

### Top Results

- **#1** `/opt/processmap-test/.planning/contours/fix/diagram-drag-lag-gsd-review-version-ledger-rework-v1/ENGINE_EVALUATION_UPDATE.md` — score 16.272
  > **Continue bpmn-js optimization.** This contour addressed the main React-side drag *bottlenecks*. If user still perceive…

- **#2** `/opt/processmap-test/.planning/contours/fix/diagram-canvas-reload-loop-and-lag-regression-v1/PLAN.md` — score 16.093
  > - **Status**: REVIEW_PASS - Confirmed H1 (initial load 6.5s) and H6 (tab switch 4–6s) as top residual *bottlenecks*.…

- **#3** `/srv/obsidian/project-atlas/ProcessMap/AgentReports/architecture/processmap-agent-rag-knowledge-layer-bootstrap-plan-v1/PLAN.md` — score 15.836
  > Agent 2 must prepare test queries and expected answers. Minimum set: 1. **"*What* are the latest rules for *Diagram* REV…


## q4-rag-forbidden-actions

**Query:** What is forbidden for RAG?
**Status:** ❌ FAIL
**Terms:** 6/10 (60%)
**Paths:** 1/4 (25%)
**Pass Criteria:** At least 4 expected terms appear in top-8 snippets AND at least 2 expected path patterns match top-8 results.

### Top Results

- **#1** `/srv/obsidian/project-atlas/ProcessMap/AgentReports/feature/processmap-agent-rag-bm25-manifest-search-v1/REVIEWER_PROMPT.md` — score 20.887
  > node tools/*rag*/pm-*rag*-search.mjs "*What* is *forbidden* for *RAG*" --top-k 8…

- **#2** `/srv/obsidian/project-atlas/ProcessMap/AgentReports/architecture/processmap-agent-rag-knowledge-layer-bootstrap-plan-v1/PLAN.md` — score 13.837
  > - sources: <list> - how used: <which decisions were influenced> - limitations: <*what* *RAG* did not cover> ```…

- **#3** `/srv/obsidian/project-atlas/ProcessMap/AgentReports/architecture/processmap-agent-rag-knowledge-layer-bootstrap-plan-v1/PLAN.md` — score 13.545
  > - query terms: <terms used> - retrieved sources: <list> - accepted context: <*what* influenced the plan> - rejected/depr…


## q5-indexed-source-paths

**Query:** Which paths should be indexed?
**Status:** ❌ FAIL
**Terms:** 5/9 (56%)
**Paths:** 1/3 (33%)
**Pass Criteria:** At least 4 expected terms appear in top-8 snippets AND at least 2 expected path patterns match top-8 results.

### Top Results

- **#1** `/srv/obsidian/project-atlas/ProcessMap/AgentReports/feature/processmap-agent-rag-bm25-manifest-search-v1/REVIEWER_PROMPT.md` — score 23.921
  > node tools/rag/pm-rag-search.mjs "*Which* *paths* should be *indexed*" --top-k 8…

- **#2** `/opt/processmap-test/.planning/contours/research/product-actions-ai-ag-ui-protocol-fit-v1/PLAN.md` — score 12.401
  > - Can AG-UI event stream leak secrets? - How to filter prompt/user data from events? - *Which* event payloads must NOT b…

- **#3** `/srv/obsidian/project-atlas/ProcessMap/AgentReports/architecture/processmap-agent-rag-knowledge-layer-bootstrap-plan-v1/REVIEW_REPORT.md` — score 12.006
  > - [x] Concrete file *paths* listed (not generics like "docs/") - [x] Project Atlas files enumerated by category (727 fil…


## q6-test-runtime

**Query:** What is current ProcessMap test runtime?
**Status:** ❌ FAIL
**Terms:** 5/8 (63%)
**Paths:** 0/3 (0%)
**Pass Criteria:** At least 3 expected terms appear in top-5 snippets AND at least 2 expected path patterns match top-5 results.

### Top Results

- **#1** `/srv/obsidian/project-atlas/ProcessMap/AgentReports/feature/processmap-agent-rag-bm25-manifest-search-v1/REVIEWER_PROMPT.md` — score 16.782
  > node tools/rag/pm-rag-search.mjs "*current* *ProcessMap* *test* *runtime*" --top-k 8…

- **#2** `/srv/obsidian/project-atlas/ProcessMap/AgentReports/architecture/processmap-agent-rag-knowledge-layer-bootstrap-plan-v1/PLAN.md` — score 15.994
  > Agent 2 must prepare *test* queries and expected answers. Minimum set: 1. **"*What* are the la*test* rules for Diagram R…

- **#3** `/opt/processmap-test/.planning/contours/tooling/processmap-agent3-ui-review-skill-binding-v1/REVIEWER_PROMPT.md` — score 15.489
  > 1. Open the actual *ProcessMap* *runtime* through Playwright MCP. 2. Navigate to the target surface described in the con…


## q7-agent3-diagram-review

**Query:** How should Agent 3 review Diagram performance contours?
**Status:** ✅ PASS
**Terms:** 6/10 (60%)
**Paths:** 2/3 (67%)
**Pass Criteria:** At least 4 expected terms appear in top-8 snippets AND at least 2 expected path patterns match top-8 results.

### Top Results

- **#1** `/opt/processmap-test/.planning/contours/perf/diagram-svg-css-repaint-reduction-v1/RUNTIME_PROOF_CHECKLIST.md` — score 19.373
  > - [x] GSD discipline recorded - [x] Previous *Diagram* *performance* *contours* *review*ed - [x] Source/runtime truth ca…

- **#2** `/opt/processmap-test/.planning/contours/tooling/processmap-agent3-ui-review-skill-binding-v1/EXEC_REPORT.md` — score 18.991
  > 1. *Agent* 2 completes implementation and writes `EXEC_REPORT.md`. 2. *Agent* 3 reads the skill + binding, then opens th…

- **#3** `/opt/processmap-test/.planning/contours/fix/diagram-drag-lag-gsd-review-version-ledger-rework-v1/EXECUTOR_PROMPT.md` — score 18.756
  > 1. Read `PLAN.md`, `RUNTIME_NAVIGATION.md`, `RUNTIME_PROOF_CHECKLIST.md`, `STATE.json`. 2. Read latest contour reports: …


---

**Read-only boundary:** Validation results for retrieval context only.
