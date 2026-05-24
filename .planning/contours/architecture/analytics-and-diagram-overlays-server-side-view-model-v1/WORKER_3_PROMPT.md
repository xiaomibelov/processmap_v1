# Agent 3 / Worker — architecture/API/roadmap lane

You are Agent 3 / Worker for ProcessMap.

Contour: `architecture/analytics-and-diagram-overlays-server-side-view-model-v1`
Run ID: `20260519T090224Z-17699`

## Output language

Write all docs/reports in Russian. Keep API and agent prompt fragments in English where they describe endpoint names/contracts.

## Scope

Independent architecture/API/roadmap lane:
- Draft backend API contracts.
- Draft frontend thin-client target.
- Draft overlay rendering strategy.
- Draft phased migration roadmap.
- Add RAG auto-indexing/nightly indexing only as backlog, not implementation.
- Do not implement product code.
- Do not change backend/frontend/schema/package files.

## Required runtime/source truth first

Record compactly in `WORKER_3_REPORT.md`:
- `pwd`
- `git remote -v` with credentials redacted
- `git fetch origin`
- `git branch --show-current`
- `git rev-parse HEAD`
- `git rev-parse origin/main`
- `git status -sb`
- `git diff --name-only`
- `git diff --cached --name-only`

If unrelated changes block safe documentation, write `EXEC_PART_2_BLOCKED.md` and stop.

## Draft contracts

Mark all `/api/analytics/*` endpoints as draft contracts unless you independently prove an endpoint already exists.

Product Actions:
- `GET /api/analytics/actions`
- `GET /api/analytics/actions/summary`
- `GET /api/analytics/actions/filters`
- `GET /api/analytics/actions/sources`
- `GET /api/analytics/actions/export.csv`
- `GET /api/analytics/actions/export.xlsx`

Properties:
- `GET /api/analytics/properties`
- `GET /api/analytics/properties/summary`
- `GET /api/analytics/properties/filters`
- `GET /api/analytics/properties/sources`

Diagram overlays:
- `GET /api/analytics/diagram-overlays`
- `GET /api/analytics/diagram-overlays/summary`
- `GET /api/analytics/diagram-overlays/viewport`

## Required architecture content

Define what moves backend:
- row shaping;
- aggregation;
- filtering;
- pagination;
- sorting;
- source/session summaries;
- property extraction;
- overlay data shaping;
- export preparation;
- optional cache/materialization later.

Define what stays frontend:
- active tab/scope/filter UI state;
- selected rows;
- expanded rows;
- viewport state;
- hover/selection;
- rendering returned view-model;
- navigation.

Overlay rendering strategy must explicitly separate:
- backend-prepared overlay view-model;
- frontend rendering only visible/relevant overlays;
- viewport culling;
- zoom thresholds;
- hover/selection detail mode;
- no mass DOM creation;
- no heavy bpmn-js overlay spam;
- no mutation from overlay viewing.

## Roadmap

Create phases 0 through 8:
- objective;
- scope;
- non-goals;
- likely files/areas;
- validation;
- risks;
- suggested contour ID.

## Required reports

Write under:
`.planning/contours/architecture/analytics-and-diagram-overlays-server-side-view-model-v1/`

- `WORKER_3_REPORT.md`
- `ANALYTICS_API_CONTRACT_DRAFT.md`
- `PROPERTIES_API_CONTRACT_DRAFT.md`
- `DIAGRAM_OVERLAY_API_CONTRACT_DRAFT.md`
- `FRONTEND_THIN_CLIENT_TARGET.md`
- `OVERLAY_RENDERING_STRATEGY.md`
- `PHASED_MIGRATION_ROADMAP.md`
- `RAG_BACKLOG_NOTE.md`
- `WORKER_3_DONE`

If blocked:
- `EXEC_PART_2_BLOCKED.md`

## Hard boundaries

- Do not propose BPMN XML mutation.
- Do not propose Product Actions durable truth mutation.
- Do not mix RAG auto-indexing into implementation phases.
- Do not invent fake property or overlay data.
- Keep contracts concrete enough for future implementation contours.
