# ProcessMap Agent RAG Preflight — Reviewer

## Input
- **role**: reviewer
- **contour**: tooling/processmap-local-launcher-4-agent-apply-and-smoke-v1
- **area/query**: local launcher 4-agent workflow review rules same CID no product runtime changes no secrets dry-run
- **generated_at**: 2026-05-17T00:43:53.368Z

## Structured Facts

### Agent Rules
- [high] No product runtime code changes in RAG tooling contours (FORBIDDEN: Modify frontend/src/, backend/app/, or any product runtime file during RAG work) (REQUIRED: Keep changes under tools/rag/, docs/rag/, .planning/contours/ only)
- [critical] Agent 3 Reviewer must use GSD discipline (FORBIDDEN: Approve without independent validation or skip runtime proof) (REQUIRED: Run GSD checks, verify source/runtime truth, run independent validation)
- [critical] RAG is read-only suggestion/context layer (FORBIDDEN: Auto-mutate code, auto-save files, write BPMN XML, or apply Product Actions automatically based on RAG output) (REQUIRED: Treat RAG results as suggestions, warnings, and references only)
- [critical] Agent 1 Planner must use GSD discipline (FORBIDDEN: Skip planning documentation or proceed without bounded scope) (REQUIRED: Run GSD checks, create PLAN.md, define acceptance criteria, write STATE.json)
- [critical] No PR, merge, or deploy without explicit user command (FORBIDDEN: Create PR, merge, push, or deploy without explicit user request) (REQUIRED: Wait for explicit user approval before git push, PR creation, or deploy)

### User Rejections
- [critical] perf/diagram-modeler-drag-hot-path-and-pointermove-suppression-v1: Formal REVIEW_PASS did not correspond to user-visible drag lag resolution. → Investigate React bundle cost rather than only event handler batching; establish real drag baseline with profiler.
- [high] fix/diagram-drag-lag-gsd-review-version-ledger-rework-v1: Formal REVIEW_PASS focused on review process and version ledger, not on actual drag performance fix. → Decompose the engine and address React re-render cost during drag; do not approve based on synthetic tests only.
- [high] fix/diagram-real-drag-performance-and-engine-decomposition-v1: Formal REVIEW_PASS was granted but user later reported remaining issues with large-canvas lag and version marker overlay. → Relocate version marker off canvas and implement viewer-first design for large canvases.
- [critical] perf/diagram-modeler-drag-hot-path-and-pointermove-suppression-v1: Reviewer tested synthetic zoom/click instead of real mouse drag. → All diagram performance reviews must include real mouse drag test with profiler or frame-time evidence.

### Contour Facts
- feature/processmap-agent-rag-source-registry-and-index-policy-v1: formal=REVIEW_PASS, user_visible=solved, accepted=true
- architecture/processmap-agent-rag-knowledge-layer-bootstrap-plan-v1: formal=REVIEW_PASS, user_visible=solved, accepted=true
- feature/processmap-agent-rag-bm25-manifest-search-v1: formal=REVIEW_PASS, user_visible=solved, accepted=true

### Decisions
- RAG is a read-only suggestion and context layer. (All agents, all contours, all RAG usage)

## Supporting Documents

### #1 — Agent 3 Review Plan
- **path**: `/opt/processmap-test/.planning/contours/audit/diagram-post-optimization-runtime-profile-v1/PLAN.md`
- **snippet**: Agent 3 review steps: read outputs, verify runtime evidence, verify source map, verify no product code changed, Playwright spot-check, create REVIEW_PASS or CHANGES_REQUESTED.

### #2 — Agent 3 Review Gates
- **path**: `/opt/processmap-test/.planning/contours/feature/processmap-agent-rag-bm25-manifest-search-v1/RUNTIME_PROOF_CHECKLIST.md`
- **snippet**: Reviewer GSD discipline, all Agent 2 reports read, changed files inspected, validation commands run independently, no secrets printed, no product runtime files changed, REVIEW_REPORT.md created.

## How RAG Changed the Plan
- Reinforced independent validation requirement — reviewer must not trust worker reports alone.
- User rejection history confirms: REVIEW_PASS is forbidden if user-visible scenario still materially fails.
- For this tooling contour: "user-visible scenario" = local launcher actually starts 4 agents or explicitly documents limitation.
- No product runtime changes rule confirmed from multiple sources.
