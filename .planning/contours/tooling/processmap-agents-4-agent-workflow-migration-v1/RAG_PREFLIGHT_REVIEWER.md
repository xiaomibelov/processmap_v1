# ProcessMap Agent RAG Preflight — Reviewer

## Input
- **role**: reviewer
- **contour**: tooling/processmap-agents-4-agent-workflow-migration-v1
- **area/query**: tooling workflow migration review rules 4 agents same CID no product runtime changes no secrets
- **generated_at**: 2026-05-17T00:04:42.873Z

## Structured Facts

### Agent Rules
- [high] No product runtime code changes in RAG tooling contours (FORBIDDEN: Modify frontend/src/, backend/app/, or any product runtime file during RAG work) (REQUIRED: Keep changes under tools/rag/, docs/rag/, .planning/contours/ only)
- [critical] Agent 3 Reviewer must use GSD discipline (FORBIDDEN: Approve without independent validation or skip runtime proof) (REQUIRED: Run GSD checks, verify source/runtime truth, run independent validation)
- [critical] No PR, merge, or deploy without explicit user command (FORBIDDEN: Create PR, merge, push, or deploy without explicit user request) (REQUIRED: Wait for explicit user approval before git push, PR creation, or deploy)
- [critical] RAG is read-only suggestion/context layer (FORBIDDEN: Auto-mutate code, auto-save files, write BPMN XML, or apply Product Actions automatically based on RAG output) (REQUIRED: Treat RAG results as suggestions, warnings, and references only)

### User Rejections
- [critical] perf/diagram-modeler-drag-hot-path-and-pointermove-suppression-v1: Formal REVIEW_PASS did not correspond to user-visible drag lag resolution.
- [high] fix/diagram-drag-lag-gsd-review-version-ledger-rework-v1: Formal REVIEW_PASS focused on review process and version ledger, not on actual drag performance fix.
- [high] fix/diagram-real-drag-performance-and-engine-decomposition-v1: Formal REVIEW_PASS was granted but user later reported remaining issues.
- [critical] perf/diagram-modeler-drag-hot-path-and-pointermove-suppression-v1: Reviewer tested synthetic zoom/click instead of real mouse drag.

### Decisions
- RAG is a read-only suggestion and context layer.
- RAG must not auto-mutate any file.
- No PR, merge, or deploy without explicit user command.

### Validation Facts
- What are the latest rules for Diagram REVIEW_PASS? → PASS (7/7 PASS on full manifest with improved ranking)

## Supporting Documents

### #1 — Agent 3 Review Template
- **path**: `/opt/processmap-test/.planning/templates/agent3-ui-runtime-review-template.md`
- Reusable template for future Agent 3 reviews.

### #2 — Hard Rules
- **path**: Multiple contours reference: No product code changes, no backend changes, no package changes, no BPMN XML mutation, no commit/push/PR/deploy, no secrets in reports.

### #3 — Boundaries (HARD — Do NOT Cross)
- Modify product runtime files (frontend/src, backend/app) → NO
- Modify .env or secrets → NO
- Install packages → NO
- Auto-mutation → NO

## Required Gates
- [ ] Reviewer GSD discipline section present in REVIEW_REPORT.md
- [ ] Fresh runtime proof collected (5180/8088) — N/A for tooling contour
- [ ] Exact user scenario reproduced — N/A for tooling contour
- [ ] Before/after evidence collected
- [ ] User rejection override checked
- [ ] No REVIEW_PASS if user-visible scenario still fails
- [ ] Product runtime unchanged without scope

## How RAG Changed the Review Plan
- Reinforced that Agent 4 Reviewer must independently validate both Worker 2 and Worker 3 outputs.
- User rejection history shows formal REVIEW_PASS can be overridden — Agent 4 must verify actual behavior, not just report presence.
- No product runtime changes boundary is strict — any diff in frontend/src/ or backend/app/ is an automatic fail.
- RAG is read-only — Reviewer must not rely solely on RAG output for verdict.
