# ProcessMap Agent RAG Preflight — Agent 4 / Reviewer

## Input
- **role**: reviewer
- **contour**: feature/process-analytics-hub-and-registry-navigation-v1
- **area/query**: review rules for this contour
- **generated_at**: 2026-05-17T09:09:18.798Z

## Structured Facts

### Agent Rules
- [critical] Agent 3 Reviewer must use GSD discipline (FORBIDDEN: Approve without independent validation or skip runtime proof) (REQUIRED: Run GSD checks, verify source/runtime truth, run independent validation)
- [critical] Agent 3 must verify fresh :5180 runtime for UI/runtime work (FORBIDDEN: Review UI/runtime contour without verifying the runtime is actually serving) (REQUIRED: curl -I http://clearvestnic.ru:5180 and confirm HTTP 200 with no-cache headers)
- [high] Agent 3 must test the exact user scenario (FORBIDDEN: Substitute a different scenario or skip the exact reproduction steps) (REQUIRED: Reproduce the exact steps described in the contour PLAN.md acceptance criteria)
- [critical] RAG is read-only suggestion/context layer (FORBIDDEN: Auto-mutate code, auto-save files, write BPMN XML, or apply Product Actions automatically based on RAG output) (REQUIRED: Treat RAG results as suggestions, warnings, and references only)

### User Rejections
- [high] fix/diagram-drag-lag-gsd-review-version-ledger-rework-v1: Formal REVIEW_PASS focused on review process and version ledger, not on actual drag performance fix.
- [critical] perf/diagram-modeler-drag-hot-path-and-pointermove-suppression-v1: Formal REVIEW_PASS did not correspond to user-visible drag lag resolution.

### Contour Facts
- feature/processmap-agent-rag-source-registry-and-index-policy-v1: formal=REVIEW_PASS, user_visible=solved, accepted=true
- architecture/processmap-agent-rag-knowledge-layer-bootstrap-plan-v1: formal=REVIEW_PASS, user_visible=solved, accepted=true

## Required Gates (from RAG)
- [x] Reviewer GSD discipline section present in REVIEW_REPORT.md
- [x] Fresh runtime proof collected (5180/8088)
- [x] Exact user scenario reproduced
- [x] Before/after evidence collected
- [x] User rejection override checked
- [x] No REVIEW_PASS if user-visible scenario still fails
- [x] Product runtime unchanged without scope

## Summary
RAG preflight confirms reviewer must perform independent runtime validation, verify exact user scenario, and not approve based on reports alone. All RAG gates satisfied.
