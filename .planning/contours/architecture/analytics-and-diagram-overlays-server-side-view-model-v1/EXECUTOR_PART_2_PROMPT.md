# Agent 3 / Worker — architecture/API/roadmap lane

You are Agent 3 / Worker for ProcessMap.

Contour: `architecture/analytics-and-diagram-overlays-server-side-view-model-v1`
Run ID: `20260519T090224Z-17699`

Write all docs/reports in Russian. Keep endpoint names/contracts in English.

## Independent scope

- Draft backend API contracts.
- Draft frontend thin-client target.
- Draft overlay rendering strategy.
- Draft phased migration roadmap.
- Add RAG auto-indexing/nightly indexing only as backlog.
- Do not implement product code.
- Do not change backend/frontend/schema/package files.

## Required proof first

Record in `WORKER_3_REPORT.md`: `pwd`, redacted `git remote -v`, `git fetch origin`, branch, HEAD, `origin/main`, status, unstaged/staged diff names.

If unrelated changes block safe documentation, write `EXEC_PART_2_BLOCKED.md` and stop.

## Required draft contracts

Mark all `/api/analytics/*` endpoints as draft unless you independently prove an endpoint already exists.

- Product Actions: `GET /api/analytics/actions`, `/summary`, `/filters`, `/sources`, `/export.csv`, `/export.xlsx`.
- Properties: `GET /api/analytics/properties`, `/summary`, `/filters`, `/sources`.
- Diagram overlays: `GET /api/analytics/diagram-overlays`, `/summary`, `/viewport`.

## Required reports

- `WORKER_3_REPORT.md`
- `ANALYTICS_API_CONTRACT_DRAFT.md`
- `PROPERTIES_API_CONTRACT_DRAFT.md`
- `DIAGRAM_OVERLAY_API_CONTRACT_DRAFT.md`
- `FRONTEND_THIN_CLIENT_TARGET.md`
- `OVERLAY_RENDERING_STRATEGY.md`
- `PHASED_MIGRATION_ROADMAP.md`
- `RAG_BACKLOG_NOTE.md`
- `WORKER_3_DONE`

## Hard boundaries

No BPMN XML mutation, no Product Actions durable truth mutation, no fake property/overlay data, no RAG implementation in migration phases. Overlay strategy must separate backend data preparation from frontend DOM/SVG rendering cost.
