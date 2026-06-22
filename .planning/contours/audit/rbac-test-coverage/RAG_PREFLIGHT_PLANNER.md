# ProcessMap Agent RAG Preflight

## Input
- **role**: planner
- **contour**: audit/rbac-test-coverage
- **area/query**: RBAC test coverage audit / RBAC test coverage gaps session delete export discussions templates invites project members AI auto-pass property dictionary BPMN save admin panel 403
- **generated_at**: 2026-06-21T18:58:15.216Z

## Structured Facts

### Runtime Facts
- **frontend_url**: http://clearvestnic.ru:5180 (test, high)
- **api_health_url**: http://clearvestnic.ru:8088/health (test, high)

### Agent Rules
- [critical] Agent 3 Reviewer must use GSD discipline (FORBIDDEN: Approve without independent validation or skip runtime proof) (REQUIRED: Run GSD checks, verify source/runtime truth, run independent validation)
- [critical] Agent 3 must verify fresh :5180 runtime for UI/runtime work (FORBIDDEN: Review UI/runtime contour without verifying the runtime is actually serving) (REQUIRED: curl -I http://clearvestnic.ru:5180 and confirm HTTP 200 with no-cache headers)
- [high] Agent 3 must test the exact user scenario (FORBIDDEN: Substitute a different scenario or skip the exact reproduction steps) (REQUIRED: Reproduce the exact steps described in the contour PLAN.md acceptance criteria)
- [critical] RAG is read-only suggestion/context layer (FORBIDDEN: Auto-mutate code, auto-save files, write BPMN XML, or apply Product Actions automatically based on RAG output) (REQUIRED: Treat RAG results as suggestions, warnings, and references only)
- [critical] Agent 1 Planner must use GSD discipline (FORBIDDEN: Skip planning documentation or proceed without bounded scope) (REQUIRED: Run GSD checks, create PLAN.md, define acceptance criteria, write STATE.json)
- [critical] Diagram performance review must test real mouse drag, not only programmatic zoom/click (FORBIDDEN: Approve based only on synthetic zoom, click, or programmatic tests without real drag) (REQUIRED: Perform actual pointer drag on the BPMN canvas and observe jank/frame drops)

### Contour Facts
- feature/processmap-agent-rag-bm25-manifest-search-v1: formal=REVIEW_PASS, user_visible=solved, accepted=true
- feature/processmap-agent-rag-coverage-and-validation-hardening-v1: formal=REVIEW_PASS, user_visible=solved, accepted=true

### Bottlenecks
- [RAG] BM25 lexical search initially achieved only 3/7 on validation queries. → next: feature/processmap-agent-rag-agent-preflight-integration-v1
- [Diagram] Diagram drag lag remained after multiple performance contours. → next: perf/process-stage-baseline-jank-v1

### Validation Facts
- What is forbidden for RAG? → PASS (7/7 PASS on full manifest with improved ranking)
- What are the latest rules for Diagram REVIEW_PASS? → PASS (7/7 PASS on full manifest with improved ranking)
- What are current Diagram lag bottlenecks? → PASS (7/7 PASS on full manifest with improved ranking)
- Which paths should be indexed? → PASS (7/7 PASS on full manifest with improved ranking)
- What happened in perf diagram modeler drag hot path pointermove suppression? → PASS (7/7 PASS on full manifest with improved ranking)
- What is current ProcessMap test runtime? → PASS (7/7 PASS on full manifest with improved ranking)
- How should Agent 3 review Diagram performance contours? → PASS (7/7 PASS on full manifest with improved ranking)
- RAG coverage hardening summary → PASS (1,803 files indexed across 8 sources; 7/7 validation queries PASS; previous state was 3/7 on 500-file sample)

## Supporting Documents

(No BM25 supporting documents returned.)

## Required Gates
- [ ] GSD discipline recorded
- [ ] Source/runtime truth captured
- [ ] Bounded scope defined in PLAN.md
- [ ] Acceptance criteria defined
- [ ] User rejection facts reviewed
- [ ] No product code written by Agent 1
- [ ] No merge/deploy/PR without explicit approval

## Warnings
- ⚠️ REMINDER: Do not print secrets. Preflight output may contain paths but not credentials.
- ⚠️ BM25 search returned no results or index unavailable. Facts-only mode active.

## Suggested Next Queries
- ```bash
node tools/rag/pm-rag-search.mjs "RBAC test coverage audit" --top-k 5
```
- ```bash
node tools/rag/pm-rag-search-facts.mjs "RBAC test coverage audit" --top-k 8 --json
```
- ```bash
node tools/rag/pm-rag-agent-preflight.mjs --role planner --contour "audit/rbac-test-coverage" --area "RBAC test coverage audit" --format md
```
- ```bash
node tools/rag/pm-rag-validate-facts.mjs
```
- ```bash
node tools/rag/pm-rag-run-validation-queries.mjs --top-k 8
```
