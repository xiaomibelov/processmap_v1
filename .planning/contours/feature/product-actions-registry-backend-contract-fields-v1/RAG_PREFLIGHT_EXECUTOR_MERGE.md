# ProcessMap Agent RAG Preflight

## Input
- **role**: executor
- **contour**: feature/product-actions-registry-backend-contract-fields-v1
- **area/query**: merge execution parts and prepare review handoff
- **generated_at**: 2026-05-20T19:31:48.973Z

## Structured Facts

### Agent Rules
- [critical] Agent 3 Reviewer must use GSD discipline (FORBIDDEN: Approve without independent validation or skip runtime proof) (REQUIRED: Run GSD checks, verify source/runtime truth, run independent validation)
- [critical] Agent 3 must verify fresh :5180 runtime for UI/runtime work (FORBIDDEN: Review UI/runtime contour without verifying the runtime is actually serving) (REQUIRED: curl -I http://clearvestnic.ru:5180 and confirm HTTP 200 with no-cache headers)
- [high] Agent 3 must test the exact user scenario (FORBIDDEN: Substitute a different scenario or skip the exact reproduction steps) (REQUIRED: Reproduce the exact steps described in the contour PLAN.md acceptance criteria)
- [critical] Diagram performance review must test real mouse drag, not only programmatic zoom/click (FORBIDDEN: Approve based only on synthetic zoom, click, or programmatic tests without real drag) (REQUIRED: Perform actual pointer drag on the BPMN canvas and observe jank/frame drops)
- [critical] No PR, merge, or deploy without explicit user command (FORBIDDEN: Create PR, merge, push, or deploy without explicit user request) (REQUIRED: Wait for explicit user approval before git push, PR creation, or deploy)
- [high] No product runtime code changes in RAG tooling contours (FORBIDDEN: Modify frontend/src/, backend/app/, or any product runtime file during RAG work) (REQUIRED: Keep changes under tools/rag/, docs/rag/, .planning/contours/ only)

### Contour Facts
- architecture/processmap-agent-rag-knowledge-layer-bootstrap-plan-v1: formal=REVIEW_PASS, user_visible=solved, accepted=true
- feature/processmap-agent-rag-source-registry-and-index-policy-v1: formal=REVIEW_PASS, user_visible=solved, accepted=true
- feature/processmap-agent-rag-bm25-manifest-search-v1: formal=REVIEW_PASS, user_visible=solved, accepted=true
- feature/processmap-agent-rag-coverage-and-validation-hardening-v1: formal=REVIEW_PASS, user_visible=solved, accepted=true
- perf/diagram-modeler-drag-hot-path-and-pointermove-suppression-v1: formal=REVIEW_PASS, user_visible=not_solved, accepted=false
- fix/diagram-drag-lag-gsd-review-version-ledger-rework-v1: formal=REVIEW_PASS, user_visible=not_solved, accepted=false
- fix/diagram-real-drag-performance-and-engine-decomposition-v1: formal=REVIEW_PASS, user_visible=not_solved, accepted=false
- fix/diagram-loading-state-machine-and-canvas-controller-decomposition-v1: formal=REVIEW_PASS, user_visible=solved, accepted=true
- fix/diagram-visible-version-and-large-canvas-lag-v1: formal=REVIEW_PASS, user_visible=solved, accepted=true

### Decisions
- RAG is a read-only suggestion and context layer. (All agents, all contours, all RAG usage)
- RAG must not auto-mutate any file. (All RAG tooling, all agent preflight integrations)
- AI drafts are not canonical source truth. (All agents, all contour reports, all Project Atlas docs)
- Version/update row should increment visibly. (Save, deploy, and version contours)

### Validation Facts
- What are the latest rules for Diagram REVIEW_PASS? → PASS (7/7 PASS on full manifest with improved ranking)

## Supporting Documents

### #1 — Handoff
- **score**: 20.494
- **path**: `/opt/processmap-test/.planning/contours/fix/diagram-canvas-reload-loop-and-lag-regression-v1/REVIEW_REPORT.md`
- **source/category**: planning-contours / contour
- **why_matched**: path_match, heading_match, recent_14d, category_role
- **snippet**:
```
[contour: diagram-canvas-reload-loop-and-lag-regression-v1] ## *Handoff*
- Root cause documented in `REGRESSION_ROOT_CAUSE.md`. - Before/after timings in `RUNTIME_BEFORE_AFTER.md`. - Implementation details in `IMPLEMENTATION_NOTES.md`. - Ready for *merge* decision by user.
```

### #2 — Handoff
- **score**: 19.994
- **path**: `/srv/obsidian/project-atlas/ProcessMap/AgentReports/fix/diagram-canvas-reload-loop-and-lag-regression-v1/REVIEW_REPORT.md`
- **source/category**: project-atlas / project_atlas
- **why_matched**: path_match, heading_match, recent_14d, category_role
- **snippet**:
```
## *Handoff*
- Root cause documented in `REGRESSION_ROOT_CAUSE.md`. - Before/after timings in `RUNTIME_BEFORE_AFTER.md`. - Implementation details in `IMPLEMENTATION_NOTES.md`. - Ready for *merge* decision by user.
```

### #3 — Commit / push / PR
- **score**: 19.915
- **path**: `/opt/processmap-test/PROCESSMAP/HANDOFF/2026-05-07 - feature product actions registry bulk ai suggestions v1.md`
- **source/category**: handoff-notes / docs
- **why_matched**: path_match, recent_14d
- **snippet**:
```
Commit: pending at *handoff* creation. Push: pending at *handoff* creation. PR: not created. *Merge*/deploy: not performed.
```

### #4 — Commit / push / PR
- **score**: 19.915
- **path**: `/opt/processmap-test/PROCESSMAP/HANDOFF/2026-05-07 - fix product actions ai suggest session review v1.md`
- **source/category**: handoff-notes / docs
- **why_matched**: path_match, recent_14d
- **snippet**:
```
Commit: pending at *handoff* creation. Push: pending at *handoff* creation. PR: not created. *Merge*/deploy: not performed.
```

### #5 — Handoff — fix/product-actions-ai-suggest-json-contract-hardening-v1
- **score**: 19.258
- **path**: `/opt/processmap-test/docs/obsidian_fallback/project_atlas_updates/fix-product-actions-ai-suggest-json-contract-hardening-v1/handoff.md`
- **source/category**: docs-curated / docs
- **why_matched**: path_match, heading_match, recent_14d
- **snippet**:
```
## *Handoff* — fix/product-actions-ai-suggest-json-contract-hardening-v1
**Date:** 2026-05-08 **App version:** v1.0.119 **Status:** CLOSED — code pushed, no *merge*, no deploy ---
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
node tools/rag/pm-rag-search.mjs "merge execution parts and prepare review handoff" --top-k 5
```
- ```bash
node tools/rag/pm-rag-search-facts.mjs "merge execution parts and prepare review handoff" --top-k 8 --json
```
- ```bash
node tools/rag/pm-rag-agent-preflight.mjs --role executor --contour "feature/product-actions-registry-backend-contract-fields-v1" --area "merge execution parts and prepare review handoff" --format md
```
- ```bash
node tools/rag/pm-rag-validate-facts.mjs
```
- ```bash
node tools/rag/pm-rag-run-validation-queries.mjs --top-k 8
```
