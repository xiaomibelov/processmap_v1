# ProcessMap Agent RAG Preflight — Executor Part 2

## Input
- **role**: executor
- **contour**: feature/process-analytics-hub-and-registry-navigation-v1
- **area/query**: executor part 2 context
- **generated_at**: 2026-05-17T01:16:36.716Z

## Structured Facts

### Agent Rules
- [critical] RAG is read-only suggestion/context layer (FORBIDDEN: Auto-mutate code, auto-save files, write BPMN XML, or apply Product Actions automatically based on RAG output) (REQUIRED: Treat RAG results as suggestions, warnings, and references only)
- [critical] Agent 1 Planner must use GSD discipline (FORBIDDEN: Skip planning documentation or proceed without bounded scope) (REQUIRED: Run GSD checks, create PLAN.md, define acceptance criteria, write STATE.json)
- [critical] Agent 3 Reviewer must use GSD discipline (FORBIDDEN: Approve without independent validation or skip runtime proof) (REQUIRED: Run GSD checks, verify source/runtime truth, run independent validation)
- [critical] Agent 3 must verify fresh :5180 runtime for UI/runtime work (FORBIDDEN: Review UI/runtime contour without verifying the runtime is actually serving) (REQUIRED: curl -I http://clearvestnic.ru:5180 and confirm HTTP 200 with no-cache headers)
- [high] Agent 3 must test the exact user scenario (FORBIDDEN: Substitute a different scenario or skip the exact reproduction steps) (REQUIRED: Reproduce the exact steps described in the contour PLAN.md acceptance criteria)
- [critical] Diagram performance review must test real mouse drag, not only programmatic zoom/click (FORBIDDEN: Approve based only on synthetic zoom, click, or programmatic tests without real drag) (REQUIRED: Perform actual pointer drag on the BPMN canvas and observe jank/frame drops)
- [critical] No PR, merge, or deploy without explicit user command (FORBIDDEN: Create PR, merge, push, or deploy without explicit user request) (REQUIRED: Wait for explicit user approval before git push, PR creation, or deploy)
- [high] No product runtime code changes in RAG tooling contours (FORBIDDEN: Modify frontend/src/, backend/app/, or any product runtime file during RAG work) (REQUIRED: Keep changes under tools/rag/, docs/rag/, .planning/contours/ only)

### Contour Facts
- architecture/processmap-agent-rag-knowledge-layer-bootstrap-plan-v1: formal=REVIEW_PASS, user_visible=solved, accepted=true

### Decisions
- RAG is a read-only suggestion and context layer. (All agents, all contours, all RAG usage)
- RAG must not auto-mutate any file. (All RAG tooling, all agent contexts)
- RAG must not write or mutate BPMN XML. (All RAG contours, all agent contexts)
- AI drafts are not canonical source truth. (All agents, all contour reports, all Project Atlas docs)
- Product Actions durable truth source is interview.analysis.product_actions[]. (Product feature contours, roadmap planning)
- Product Actions must not be written into BPMN XML. (All backend/API work involving Product Actions and BPMN)
- Version marker must not overlay the BPMN canvas. (All diagram/UI contours)
- Version/update row should increment visibly. (Save, deploy, and version contours)
- Large god files require decomposition-first before adding new logic. (All backend and frontend code changes)
- For TO-BE format, follow only the user-provided document; no invented terms unless marked hypothesis. (All TO-BE modeling and roadmap design contours)

### Bottlenecks
- [RAG] Structured facts registry exists but is not yet integrated into agent preflight workflow. → next: feature/processmap-agent-rag-agent-preflight-integration-v1

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
