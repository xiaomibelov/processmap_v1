# ProcessMap Agent RAG Preflight

## Input
- **role**: executor
- **contour**: fix/prod-deploy-git-hardening
- **area/query**: deploy pipeline split-brain git hardening / deploy-prod.yml deploy.sh rollback BUILD_ID COMPOSE_PROJECT_NAME split-brain celery-worker
- **generated_at**: 2026-08-28T13:22:07.142Z

## Structured Facts

### Runtime Facts
- **frontend_url**: http://clearvestnic.ru:5180 (test, high)
- **api_health_url**: http://clearvestnic.ru:8088/health (test, high)
- **current_git_branch**: fix/lockfile-sync-test (test, high)

### Agent Rules
- [critical] No PR, merge, or deploy without explicit user command (FORBIDDEN: Create PR, merge, push, or deploy without explicit user request) (REQUIRED: Wait for explicit user approval before git push, PR creation, or deploy)
- [critical] Agent 3 Reviewer must use GSD discipline (FORBIDDEN: Approve without independent validation or skip runtime proof) (REQUIRED: Run GSD checks, verify source/runtime truth, run independent validation)
- [critical] Agent 3 must verify fresh :5180 runtime for UI/runtime work (FORBIDDEN: Review UI/runtime contour without verifying the runtime is actually serving) (REQUIRED: curl -I http://clearvestnic.ru:5180 and confirm HTTP 200 with no-cache headers)
- [high] Agent 3 must test the exact user scenario (FORBIDDEN: Substitute a different scenario or skip the exact reproduction steps) (REQUIRED: Reproduce the exact steps described in the contour PLAN.md acceptance criteria)
- [critical] Agent 1 Planner must use GSD discipline (FORBIDDEN: Skip planning documentation or proceed without bounded scope) (REQUIRED: Run GSD checks, create PLAN.md, define acceptance criteria, write STATE.json)
- [critical] Diagram performance review must test real mouse drag, not only programmatic zoom/click (FORBIDDEN: Approve based only on synthetic zoom, click, or programmatic tests without real drag) (REQUIRED: Perform actual pointer drag on the BPMN canvas and observe jank/frame drops)

### Contour Facts
- feature/processmap-agent-rag-bm25-manifest-search-v1: formal=REVIEW_PASS, user_visible=solved, accepted=true
- feature/processmap-agent-rag-coverage-and-validation-hardening-v1: formal=REVIEW_PASS, user_visible=solved, accepted=true

### Decisions
- Version/update row should increment visibly. (Save, deploy, and version contours)

### Validation Facts
- What are the latest rules for Diagram REVIEW_PASS? → PASS (7/7 PASS on full manifest with improved ranking)
- What happened in perf diagram modeler drag hot path pointermove suppression? → PASS (7/7 PASS on full manifest with improved ranking)
- What are current Diagram lag bottlenecks? → PASS (7/7 PASS on full manifest with improved ranking)
- What is forbidden for RAG? → PASS (7/7 PASS on full manifest with improved ranking)
- Which paths should be indexed? → PASS (7/7 PASS on full manifest with improved ranking)
- What is current ProcessMap test runtime? → PASS (7/7 PASS on full manifest with improved ranking)
- How should Agent 3 review Diagram performance contours? → PASS (7/7 PASS on full manifest with improved ranking)
- RAG coverage hardening summary → PASS (1,803 files indexed across 8 sources; 7/7 validation queries PASS; previous state was 3/7 on 500-file sample)

## Supporting Documents

(No BM25 supporting documents returned.)

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
- ⚠️ BM25 search returned no results or index unavailable. Facts-only mode active.

## Suggested Next Queries
- ```bash
node tools/rag/pm-rag-search.mjs "deploy pipeline split-brain git hardening" --top-k 5
```
- ```bash
node tools/rag/pm-rag-search-facts.mjs "deploy pipeline split-brain git hardening" --top-k 8 --json
```
- ```bash
node tools/rag/pm-rag-agent-preflight.mjs --role executor --contour "fix/prod-deploy-git-hardening" --area "deploy pipeline split-brain git hardening" --format md
```
- ```bash
node tools/rag/pm-rag-validate-facts.mjs
```
- ```bash
node tools/rag/pm-rag-run-validation-queries.mjs --top-k 8
```
