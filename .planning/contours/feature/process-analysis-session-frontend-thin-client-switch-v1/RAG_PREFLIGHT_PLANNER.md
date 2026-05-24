# RAG Preflight Planner

- run_id: `20260520T225839Z-57944`
- contour: `feature/process-analysis-session-frontend-thin-client-switch-v1`
- generated_by: `processmap-agent-pane.sh` + planner refresh
- generated_at: `2026-05-20T23:04Z`
- command: `node tools/rag/pm-rag-agent-preflight.mjs --role planner --contour "feature/process-analysis-session-frontend-thin-client-switch-v1" --area "ProcessMap session analysis view model backend endpoint frontend thin client" --format md --top-k 5`

# ProcessMap Agent RAG Preflight

## Input
- **role**: planner
- **contour**: feature/process-analysis-session-frontend-thin-client-switch-v1
- **area/query**: ProcessMap session analysis view model backend endpoint frontend thin client
- **generated_at**: 2026-05-20T23:03:53.600Z

## Structured Facts

### Agent Rules
- [high] No product runtime code changes in RAG tooling contours (FORBIDDEN: Modify frontend/src/, backend/app/, or any product runtime file during RAG work)
- [critical] Agent 3 must verify fresh :5180 runtime for UI/runtime work
- [critical] Agent 3 Reviewer must use GSD discipline
- [high] Agent 3 must test the exact user scenario
- [critical] Agent 1 Planner must use GSD discipline

### User Rejections
- [critical] perf/diagram-modeler-drag-hot-path-and-pointermove-suppression-v1: Formal REVIEW_PASS did not correspond to user-visible drag lag resolution.
- [critical] perf/diagram-modeler-drag-hot-path-and-pointermove-suppression-v1: Reviewer tested synthetic zoom/click instead of real mouse drag.

### Contour Facts
- architecture/processmap-agent-rag-knowledge-layer-bootstrap-plan-v1: formal=REVIEW_PASS, user_visible=solved, accepted=true
- feature/processmap-agent-rag-source-registry-and-index-policy-v1: formal=REVIEW_PASS, user_visible=solved, accepted=true
- feature/processmap-agent-rag-bm25-manifest-search-v1: formal=REVIEW_PASS, user_visible=solved, accepted=true
- feature/processmap-agent-rag-coverage-and-validation-hardening-v1: formal=REVIEW_PASS, user_visible=solved, accepted=true
- feature/process-analysis-session-backend-view-model-contract-v1: formal=REVIEW_PASS (Obsidian mirror shows REVIEW_PASS), user_visible=solved, accepted=true

### Decisions
- Product Actions durable truth source is interview.analysis.product_actions[].
- Product Actions must not be written into BPMN XML.
- Large god files require decomposition-first before adding new logic.

### Bottlenecks
- [Diagram] Diagram drag lag remained after multiple performance contours.
- [Frontend] React bundle consumes ~95% CPU during diagram drag interactions.

## Supporting Documents

### #1 — Phased roadmap
- **path**: `/srv/obsidian/project-atlas/ProcessMap/AgentReports/architecture/process-analysis-and-registries-backend-view-model-master-plan-v1/PLAN.md`
- **relevance**: Master plan shows Phase 5 = frontend thin-client switch for Process Analysis Session.

### #2 — Agent 3 / Worker Prompt — Frontend Thin-Client Readiness Lane
- **path**: `/srv/obsidian/project-atlas/ProcessMap/AgentReports/feature/product-actions-registry-backend-view-model-hardening-v1/WORKER_3_PROMPT.md`
- **relevance**: Pattern for frontend thin-client readiness inspection.

### #3 — Phased roadmap (analytics overlays)
- **path**: `/srv/obsidian/project-atlas/ProcessMap/AgentReports/architecture/analytics-and-diagram-overlays-server-side-view-model-v1/PLAN.md`
- **relevance**: Alternative roadmap showing backend→frontend sequence for registries.

### #4 — process-analysis-session-backend-view-model-contract-v1 PLAN
- **path**: `/srv/obsidian/project-atlas/ProcessMap/AgentReports/feature/process-analysis-session-backend-view-model-contract-v1/PLAN.md`
- **relevance**: Approved contract defines target view model shape and endpoints.

## Planner Refresh Notes

- Backend endpoint `GET /api/sessions/{session_id}/analysis/view-model` does NOT exist in current branch (`feature/process-properties-registry-backend-contract-v1`, HEAD `a2359d8`).
- `product_actions_registry.py` lacks unified envelope fields (`filter_options`, `metrics`, `empty_state`, `source_state`) that `process_properties_registry.py` already has.
- This contour must implement the backend endpoint AND switch the frontend to consume it.
- Scope is bounded to product_actions only; process_properties deferred to future contour.

## Required Gates
- [ ] GSD discipline recorded
- [ ] Source/runtime truth captured
- [ ] Bounded scope defined in PLAN.md
- [ ] Acceptance criteria defined
- [ ] User rejection facts reviewed
- [ ] No product code written by Agent 1
- [ ] No merge/deploy/PR without explicit approval
