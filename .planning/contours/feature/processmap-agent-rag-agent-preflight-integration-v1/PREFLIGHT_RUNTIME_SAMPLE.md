# ProcessMap Agent RAG Preflight

## Input
- **role**: executor
- **contour**: (none)
- **area/query**: current ProcessMap test runtime
- **generated_at**: 2026-05-16T16:59:32.335Z

## Structured Facts

### Runtime Facts
- **current_git_branch**: fix/lockfile-sync-test (test, high)

### Agent Rules
- [critical] Agent 3 Reviewer must use GSD discipline (FORBIDDEN: Approve without independent validation or skip runtime proof) (REQUIRED: Run GSD checks, verify source/runtime truth, run independent validation)
- [critical] Agent 3 must verify fresh :5180 runtime for UI/runtime work (FORBIDDEN: Review UI/runtime contour without verifying the runtime is actually serving) (REQUIRED: curl -I http://clearvestnic.ru:5180 and confirm HTTP 200 with no-cache headers)
- [high] No product runtime code changes in RAG tooling contours (FORBIDDEN: Modify frontend/src/, backend/app/, or any product runtime file during RAG work) (REQUIRED: Keep changes under tools/rag/, docs/rag/, .planning/contours/ only)
- [critical] Agent 1 Planner must use GSD discipline (FORBIDDEN: Skip planning documentation or proceed without bounded scope) (REQUIRED: Run GSD checks, create PLAN.md, define acceptance criteria, write STATE.json)
- [high] Agent 3 must test the exact user scenario (FORBIDDEN: Substitute a different scenario or skip the exact reproduction steps) (REQUIRED: Reproduce the exact steps described in the contour PLAN.md acceptance criteria)
- [critical] Diagram performance review must test real mouse drag, not only programmatic zoom/click (FORBIDDEN: Approve based only on synthetic zoom, click, or programmatic tests without real drag) (REQUIRED: Perform actual pointer drag on the BPMN canvas and observe jank/frame drops)
- [critical] No PR, merge, or deploy without explicit user command (FORBIDDEN: Create PR, merge, push, or deploy without explicit user request) (REQUIRED: Wait for explicit user approval before git push, PR creation, or deploy)
- [critical] RAG is read-only suggestion/context layer (FORBIDDEN: Auto-mutate code, auto-save files, write BPMN XML, or apply Product Actions automatically based on RAG output) (REQUIRED: Treat RAG results as suggestions, warnings, and references only)

### Contour Facts
- perf/diagram-modeler-drag-hot-path-and-pointermove-suppression-v1: formal=REVIEW_PASS, user_visible=not_solved, accepted=false

### Decisions
- RAG must not write or mutate BPMN XML. (All RAG contours, all agent contexts)
- Product Actions must not be written into BPMN XML. (All backend/API work involving Product Actions and BPMN)
- RAG is a read-only suggestion and context layer. (All agents, all contours, all RAG usage)
- RAG must not auto-mutate any file. (All RAG tooling, all agent preflight integrations)
- AI drafts are not canonical source truth. (All agents, all contour reports, all Project Atlas docs)
- Product Actions durable truth source is interview.analysis.product_actions[]. (Product feature contours, roadmap planning)

### Bottlenecks
- [Frontend] React bundle consumes ~95% CPU during diagram drag interactions. → next: fix/diagram-loading-state-machine-and-canvas-controller-decomposition-v1

### Validation Facts
- What are the latest rules for Diagram REVIEW_PASS? → PASS (7/7 PASS on full manifest with improved ranking)
- What is current ProcessMap test runtime? → PASS (7/7 PASS on full manifest with improved ranking)
- How should Agent 3 review Diagram performance contours? → PASS (7/7 PASS on full manifest with improved ranking)

## Supporting Documents

### #1 — q6-test-runtime
- **score**: 25.875
- **path**: `/opt/processmap-test/.planning/contours/feature/processmap-agent-rag-bm25-manifest-search-v1/RAG_SEARCH_VALIDATION_RESULTS.md`
- **source/category**: planning-contours / contour
- **why_matched**: exact_contour_id, path_match, heading_match, recent_14d, category_role
- **snippet**:
```
[contour: *processmap*-agent-rag-bm25-manifest-search-v1] ## q6-*test*-*runtime*
**Query:** What is *current* *ProcessMap* *test* *runtime*? **Status:** ❌ FAIL **Terms:** 5/8 (63%) **Paths:** 0/3 (0%) **Pass Criteria:** At least 3 expected terms appear in top-5 snippets AND at least 2 expected path patterns match top-5 results.
```

### #2 — 8. Search: Test runtime
- **score**: 25.562
- **path**: `/opt/processmap-test/.planning/contours/feature/processmap-agent-rag-bm25-manifest-search-v1/REVIEWER_PROMPT.md`
- **source/category**: planning-contours / contour
- **why_matched**: exact_contour_id, path_match, heading_match, recent_14d, category_role
- **snippet**:
```
[contour: *processmap*-agent-rag-bm25-manifest-search-v1] ## 8. Search: *Test* *runtime*
node tools/rag/pm-rag-search.mjs "*current* *ProcessMap* *test* *runtime*" --top-k 8
```

### #3 — Query 6: ProcessMap Test Runtime
- **score**: 25.559
- **path**: `/opt/processmap-test/.planning/contours/architecture/processmap-agent-rag-knowledge-layer-bootstrap-plan-v1/VALIDATION_QUERIES.md`
- **source/category**: planning-contours / contour
- **why_matched**: exact_contour_id, path_match, heading_match, recent_14d, category_role
- **snippet**:
```
[contour: *processmap*-agent-rag-knowledge-layer-bootstrap-plan-v1] ## Query 6: *ProcessMap* *Test* *Runtime*
**Query:** "What is *current* *ProcessMap* *test* *runtime*?" **Expected Answer:** - Server: clearvestnic.ru - Frontend served at :5180 via nginx (HTTP 200 OK, no-cache) - Backend health at :8088/health (ok, redis healthy) - Working dir: `/opt/*processmap*-*test*` - Build-info / version proof required for deploy verification - *Current* branch: `fix/lockfile-sync-*test*` (8 uncommitted files) **Sources That Should Be Retrieved:** - `architecture/*processmap*-agent-rag-knowledge-layer-bootstrap-plan-v1/*RUNTIME*_N…
```

### #4 — q6-test-runtime ❌ FAIL
- **score**: 23.875
- **path**: `/opt/processmap-test/.planning/contours/feature/processmap-agent-rag-bm25-manifest-search-v1/VALIDATION_QUERY_RESULTS.md`
- **source/category**: planning-contours / contour
- **why_matched**: exact_contour_id, path_match, heading_match, recent_14d, category_role
- **snippet**:
```
[contour: *processmap*-agent-rag-bm25-manifest-search-v1] ## q6-*test*-*runtime* ❌ FAIL
**Query:** "What is *current* *ProcessMap* *test* *runtime*?" - **Terms found:** 5/8 (63%) - **Paths matched:** 0/3 (0%) - **Status:** FAIL - **Root cause:** Expected path patterns are *RUNTIME*_NAVIGATION.md and *RUNTIME*_VERSION_PROOF.md. These files exist in the manifest but did not rank in top-5. Many executor prompts contain the *runtime* truth block, so those dominated results. Path pattern matching requires the specific files to appear in top-k. - **Next contour:** Add `--source` or `--category` filter to narrow results…
```

### #5 — Top Results
- **score**: 22.869
- **path**: `/opt/processmap-test/.planning/contours/feature/processmap-agent-rag-bm25-manifest-search-v1/RAG_SEARCH_VALIDATION_RESULTS.md`
- **source/category**: planning-contours / contour
- **why_matched**: exact_contour_id, path_match, recent_14d, category_role
- **snippet**:
```
[contour: *processmap*-agent-rag-bm25-manifest-search-v1] - **#1** `/srv/obsidian/project-atlas/*ProcessMap*/AgentReports/feature/*processmap*-agent-rag-bm25-manifest-search-v1/REVIEWER_PROMPT.md` — score 16.782 > node tools/rag/pm-rag-search.mjs "**current** **ProcessMap** **test** **runtime**" --top-k 8… - **#2** `/srv/obsidian/project-atlas/*ProcessMap*/AgentReports/architecture/*processmap*-agent-rag-knowledge-layer-bootstrap-plan-v1/PLAN.md` — score 15.994 > Agent 2 must prepare **test** queries and expected answers. Minimum set: 1. **"*What* are the la**test** rules for Diagram R… - **#3** `/opt/*processmap*-te…
```

## Required Gates
- [ ] Source/runtime truth confirmed before implementation
- [ ] Bounded contour scope respected
- [ ] No product runtime changes unless explicitly allowed
- [ ] No secrets printed in output
- [ ] No auto-mutation of BPMN XML or Product Actions
- [ ] RAG read-only boundary respected
- [ ] Runtime evidence collected for Agent 3

## Warnings
- ⚠️ REMINDER: Do not print secrets. Preflight output may contain paths but not credentials.

## Suggested Next Queries
- ```bash
node tools/rag/pm-rag-search.mjs "ProcessMap runtime" --top-k 5
```
- ```bash
node tools/rag/pm-rag-search-facts.mjs "agent rules" --top-k 8 --json
```
- ```bash
node tools/rag/pm-rag-agent-preflight.mjs --role executor --contour <contour-id> --area "scope" --format md
```
- ```bash
node tools/rag/pm-rag-validate-facts.mjs
```
- ```bash
node tools/rag/pm-rag-run-validation-queries.mjs --top-k 8
```
