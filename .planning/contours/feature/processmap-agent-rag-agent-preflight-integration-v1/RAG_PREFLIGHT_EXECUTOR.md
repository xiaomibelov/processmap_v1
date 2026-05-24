# ProcessMap Agent RAG Preflight

## Input
- **role**: executor
- **contour**: feature/processmap-agent-rag-agent-preflight-integration-v1
- **area/query**: RAG agent preflight integration scope
- **generated_at**: 2026-05-16T17:03:10.433Z

## Structured Facts

### Agent Rules
- [critical] Agent 1 Planner must use GSD discipline (FORBIDDEN: Skip planning documentation or proceed without bounded scope) (REQUIRED: Run GSD checks, create PLAN.md, define acceptance criteria, write STATE.json)
- [critical] Agent 3 Reviewer must use GSD discipline (FORBIDDEN: Approve without independent validation or skip runtime proof) (REQUIRED: Run GSD checks, verify source/runtime truth, run independent validation)
- [critical] Agent 3 must verify fresh :5180 runtime for UI/runtime work (FORBIDDEN: Review UI/runtime contour without verifying the runtime is actually serving) (REQUIRED: curl -I http://clearvestnic.ru:5180 and confirm HTTP 200 with no-cache headers)
- [high] Agent 3 must test the exact user scenario (FORBIDDEN: Substitute a different scenario or skip the exact reproduction steps) (REQUIRED: Reproduce the exact steps described in the contour PLAN.md acceptance criteria)
- [critical] Diagram performance review must test real mouse drag, not only programmatic zoom/click (FORBIDDEN: Approve based only on synthetic zoom, click, or programmatic tests without real drag) (REQUIRED: Perform actual pointer drag on the BPMN canvas and observe jank/frame drops)
- [high] No product runtime code changes in RAG tooling contours (FORBIDDEN: Modify frontend/src/, backend/app/, or any product runtime file during RAG work) (REQUIRED: Keep changes under tools/rag/, docs/rag/, .planning/contours/ only)
- [critical] RAG is read-only suggestion/context layer (FORBIDDEN: Auto-mutate code, auto-save files, write BPMN XML, or apply Product Actions automatically based on RAG output) (REQUIRED: Treat RAG results as suggestions, warnings, and references only)
- [critical] No PR, merge, or deploy without explicit user command (FORBIDDEN: Create PR, merge, push, or deploy without explicit user request) (REQUIRED: Wait for explicit user approval before git push, PR creation, or deploy)

### Contour Facts
- architecture/processmap-agent-rag-knowledge-layer-bootstrap-plan-v1: formal=REVIEW_PASS, user_visible=solved, accepted=true
- feature/processmap-agent-rag-source-registry-and-index-policy-v1: formal=REVIEW_PASS, user_visible=solved, accepted=true
- feature/processmap-agent-rag-bm25-manifest-search-v1: formal=REVIEW_PASS, user_visible=solved, accepted=true
- feature/processmap-agent-rag-coverage-and-validation-hardening-v1: formal=REVIEW_PASS, user_visible=solved, accepted=true

### Decisions
- RAG must not auto-mutate any file. (All RAG tooling, all agent preflight integrations)
- RAG is a read-only suggestion and context layer. (All agents, all contours, all RAG usage)
- RAG must not write or mutate BPMN XML. (All RAG contours, all agent contexts)
- AI drafts are not canonical source truth. (All agents, all contour reports, all Project Atlas docs)
- Product Actions durable truth source is interview.analysis.product_actions[]. (Product feature contours, roadmap planning)
- Product Actions must not be written into BPMN XML. (All backend/API work involving Product Actions and BPMN)

### Bottlenecks
- [RAG] BM25 lexical search initially achieved only 3/7 on validation queries. → next: feature/processmap-agent-rag-agent-preflight-integration-v1
- [RAG] Structured facts registry exists but is not yet integrated into agent preflight workflow. → next: feature/processmap-agent-rag-agent-preflight-integration-v1

## Supporting Documents

### #1 — 4. Agent Integration Plan
- **score**: 38.011
- **path**: `/opt/processmap-test/.planning/contours/architecture/processmap-agent-rag-knowledge-layer-bootstrap-plan-v1/EXECUTOR_PROMPT.md`
- **source/category**: planning-contours / contour
- **why_matched**: exact_contour_id, path_match, heading_match, recent_14d
- **snippet**:
```
[contour: processmap-*agent*-*rag*-knowledge-layer-bootstrap-plan-v1] ## 4. *Agent* *Integration* Plan
Produce `*AGENT*_*INTEGRATION*_PLAN.md` with: - *Agent* 1 / Planner *RAG* *preflight* block (query terms, expected sources, logging format) - *Agent* 2 / Executor *RAG* *preflight* block - *Agent* 3 / Reviewer *RAG* *preflight* block - Query templates per role - Context logging requirements for PLAN.md / EXEC_REPORT.md / REVIEW_REPORT.md
```

### #2 — 4. Agent Integration Plan
- **score**: 35.011
- **path**: `/srv/obsidian/project-atlas/ProcessMap/AgentReports/architecture/processmap-agent-rag-knowledge-layer-bootstrap-plan-v1/EXECUTOR_PROMPT.md`
- **source/category**: project-atlas / project_atlas
- **why_matched**: path_match, heading_match, recent_14d
- **snippet**:
```
## 4. *Agent* *Integration* Plan
Produce `*AGENT*_*INTEGRATION*_PLAN.md` with: - *Agent* 1 / Planner *RAG* *preflight* block (query terms, expected sources, logging format) - *Agent* 2 / Executor *RAG* *preflight* block - *Agent* 3 / Reviewer *RAG* *preflight* block - Query templates per role - Context logging requirements for PLAN.md / EXEC_REPORT.md / REVIEW_REPORT.md
```

### #3 — Agent Integration
- **score**: 32.317
- **path**: `/opt/processmap-test/.planning/contours/architecture/processmap-agent-rag-knowledge-layer-bootstrap-plan-v1/EXEC_REPORT.md`
- **source/category**: planning-contours / contour
- **why_matched**: exact_contour_id, path_match, heading_match, recent_14d
- **snippet**:
```
[contour: processmap-*agent*-*rag*-knowledge-layer-bootstrap-plan-v1] ## *Agent* *Integration*
- Designed *RAG* *preflight* blocks for *Agent* 1 (Planner), *Agent* 2 (Executor), *Agent* 3 (Reviewer) - Defined query templates with top-k, min score, and boost weights per role - Specified mandatory logging sections for PLAN.md, EXEC_REPORT.md, REVIEW_REPORT.md
```

### #4 — Scope
- **score**: 31.938
- **path**: `/opt/processmap-test/.planning/contours/architecture/processmap-agent-rag-knowledge-layer-bootstrap-plan-v1/IMPLEMENTATION_CONTOUR_PROPOSAL.md`
- **source/category**: planning-contours / contour
- **why_matched**: exact_contour_id, path_match, heading_match, recent_14d
- **snippet**:
```
[contour: processmap-*agent*-*rag*-knowledge-layer-bootstrap-plan-v1] ## *Scope*
Add *RAG* *preflight* blocks to *Agent* 1/2/3 prompts and implement query templates per role. Add *RAG* context logging to reports.
```

### #5 — Agent Integration
- **score**: 31.023
- **path**: `/opt/processmap-test/.planning/contours/architecture/processmap-agent-rag-knowledge-layer-bootstrap-plan-v1/REVIEWER_PROMPT.md`
- **source/category**: planning-contours / contour
- **why_matched**: exact_contour_id, path_match, heading_match, recent_14d
- **snippet**:
```
[contour: processmap-*agent*-*rag*-knowledge-layer-bootstrap-plan-v1] ## *Agent* *Integration*
- [ ] *Agent* 1 *preflight* has query terms and logging format - [ ] *Agent* 2 *preflight* has query terms and logging format - [ ] *Agent* 3 *preflight* has query terms and logging format - [ ] Query templates are concrete (not "search for relevant stuff") - [ ] Context logging requirements are mandatory (not optional)
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
- ⚠️ No runtime facts matched query — runtime proof may be missing.
- ⚠️ REMINDER: Do not print secrets. Preflight output may contain paths but not credentials.

## Suggested Next Queries
- ```bash
node tools/rag/pm-rag-search.mjs "feature/processmap-agent-rag-agent-preflight-integration-v1" --top-k 5
```
- ```bash
node tools/rag/pm-rag-search-facts.mjs "feature/processmap-agent-rag-agent-preflight-integration-v1" --top-k 8 --json
```
- ```bash
node tools/rag/pm-rag-agent-preflight.mjs --role executor --contour "feature/processmap-agent-rag-agent-preflight-integration-v1" --area "scope" --format md
```
- ```bash
node tools/rag/pm-rag-validate-facts.mjs
```
- ```bash
node tools/rag/pm-rag-run-validation-queries.mjs --top-k 8
```
