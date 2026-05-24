# План: server-side analytics and diagram overlay view-models

Run ID: `20260519T090224Z-17699`
Contour: `architecture/analytics-and-diagram-overlays-server-side-view-model-v1`

## Статус

`READY_FOR_EXECUTION` after required proof files and prompts are written.

## Цель

Создать source-truth и architecture plan для переноса тяжёлой аналитической подготовки из frontend в backend-owned read-only view-model APIs, оставив frontend тонким клиентом для state/rendering.

Критичная оговорка: backend снижает стоимость data computation, но DOM/SVG/bpmn-js overlay rendering остаётся frontend cost, пока отдельно не внедрены viewport-aware и lightweight rendering правила.

## Нон-goals

- Нет implementation в этом contour.
- Нет backend/frontend/schema/cache/package changes.
- Нет RAG auto-indexer implementation.
- Нет AI auto-write.
- Нет PR/merge/deploy.

## Product boundaries

- `Аналитика` остаётся top-level surface.
- `Реестр действий` — module внутри Analytics.
- `Реестр свойств` — module внутри Analytics.
- Diagram overlays are read-only visualization unless explicitly editing.
- No BPMN XML mutation.
- No Product Actions durable truth mutation.
- RAG remains read-only context/suggestion layer.

## Runtime/source truth captured by Planner

| Plane | Evidence |
|---|---|
| workspace | `pwd=/opt/processmap-test` |
| branch | `fix/lockfile-sync-test` |
| HEAD | `5b20bc2d1292f419647238eaf37dac55f9315942` |
| origin/main after fetch | `d805e1c64c1107b9e3fe6854e031694bf741b187` |
| status | Dirty workspace with pre-existing frontend changes and many untracked planning/runtime artifacts. Planner touched only this contour directory. |
| diff cached | empty |

Risk: workspace is not the canonical repo root from AGENTS contract and branch differs from `origin/main`. Because this is a planning-only contour in `/opt/processmap-test`, the plan records the risk and avoids product code changes.

## Current source map summary

### Product Actions Registry

Confirmed backend truth:
- `backend/app/storage.py` stores sessions and extracts `interview.analysis.product_actions[]` via `list_product_action_registry_sources`.
- `backend/app/routers/product_actions_registry.py` has existing POST endpoints:
  - `/api/analysis/product-actions/registry/query`
  - `/api/analysis/product-actions/registry/export.csv`
  - `/api/analysis/product-actions/registry/export.xlsx`
- Backend already shapes rows, summaries, session summaries, filtering, sorting, pagination and export bytes for Product Actions.

Frontend-heavy / mixed:
- `frontend/src/components/process/analysis/ProductActionsRegistryPanel.jsx` still builds current session rows from `interviewData.analysis.product_actions`, keeps filters/page state, computes filtered rows and summaries, and has fallback project session loading.
- `frontend/src/features/process/analysis/productActionsRegistryModel.js` still builds rows, summaries, filter options and filters client-side.

### Properties Registry

Confirmed backend truth:
- Durable session fields include `bpmn_meta_json`, `nodes_json`, `edges_json`, `bpmn_xml`.
- `frontend/src/components/process/analysis/ProcessPropertiesRegistryPage.jsx` currently builds rows in frontend from `bpmn_meta.camunda_extensions_by_element_id` for session scope only.

Frontend-derived only:
- Properties row shaping, filters, summary metrics and completeness are frontend-only today.
- Workspace/project Properties Registry backend API is not confirmed.

### Diagram overlays

Confirmed frontend-heavy cost:
- `frontend/src/features/process/stage/orchestration/buildProcessDiagramOverlayLayersProps.js` builds large overlay prop view-models in frontend.
- `frontend/src/features/process/bpmn/stage/decor/decorManager.js` creates/reuses/removes overlay DOM through bpmn-js `overlays.add`.
- Existing perf plan for `diagram-property-overlays-viewport-culling-v1` recorded mass overlay DOM as a separate bottleneck.

Confirmed rendering boundary:
- Backend can prepare overlay data, but frontend still pays DOM/SVG/bpmn-js overlay manager and React re-render costs.

## Draft API direction

These contracts are draft targets. Do not claim they exist unless Worker 2 proves them.

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
- `GET /api/analytics/diagram-overlays/viewport` as later feasibility target.

## Target split

Moves backend:
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

Stays frontend:
- active tab/scope/filter UI state;
- selected rows;
- expanded rows;
- viewport state;
- hover/selection;
- rendering returned view-model;
- navigation.

## Overlay rendering strategy

- Backend prepares read-only overlay view-models: element id, kind, labels, property chips, severity/counts, source links, stable signatures.
- Frontend renders only visible/relevant overlays.
- Use viewport culling with buffer, zoom thresholds, hover/selection detail mode.
- Avoid mass DOM creation and heavy bpmn-js overlay spam.
- Do not mutate BPMN XML or Product Actions from overlay viewing.
- Editing overlays, if enabled later, must be a separate explicit editing contour.

## Performance risk matrix

| Risk | Owner | Severity | Plan response |
|---|---|---:|---|
| Data computation cost | Backend target | High | Server view-model APIs, pagination, filtering, summaries. |
| DOM/SVG rendering cost | Frontend | High | Viewport culling, zoom thresholds, detail-on-demand. |
| bpmn-js overlay manager cost | Frontend | High | Cap overlay count, avoid one `.djs-overlay` per hidden element. |
| React re-render cost | Frontend | Medium/High | Stable response signatures, thin state, memoized renderer inputs. |
| Network/API cost | Backend/frontend | Medium | Page/query params, separate summaries/filters, no huge all-in-one payload by default. |
| Cache invalidation risk | Backend | Medium | Cache/materialization only after source-truth API semantics are approved. |

## Phased roadmap

| Phase | Objective | Suggested contour |
|---|---|---|
| 0 | Source-truth and architecture approval. | `architecture/analytics-and-diagram-overlays-server-side-view-model-v1` |
| 1 | Backend Product Actions Registry read API target. | `feature/backend-analytics-actions-view-model-api-v1` |
| 2 | Frontend Product Actions Registry consumes backend API. | `feature/frontend-actions-registry-thin-client-v1` |
| 3 | Backend Properties Registry extraction/API. | `feature/backend-analytics-properties-view-model-api-v1` |
| 4 | Frontend Properties Registry consumes backend API. | `feature/frontend-properties-registry-thin-client-v1` |
| 5 | Backend diagram overlay view-model API. | `feature/backend-diagram-overlay-view-model-api-v1` |
| 6 | Frontend thin overlay renderer / viewport-aware rendering. | `perf/frontend-diagram-overlay-thin-renderer-v1` |
| 7 | Exports and optional cache/materialized summaries. | `feature/analytics-exports-and-optional-materialized-summaries-v1` |
| 8 | Future RAG/AI-assisted analytics backlog. | `backlog/rag-ai-assisted-analytics-readonly-v1` |

Each phase must define objective, scope, non-goals, likely files/areas, validation, risks and mutation boundaries. Full requirements are in `PHASED_MIGRATION_REQUIREMENTS.md`.

## Worker split

Worker 2: current source map lane. It inspects frontend analytics/registry/overlay code and backend storage/API source truth, then writes grounded Russian reports.

Worker 3: architecture/API/roadmap lane. It drafts target contracts and migration plan independently from Worker 2. It must not wait for Worker 2.

Agent 4: reviewer. It waits for both worker markers and validates grounding, API draft wording, frontend/backend split, overlay rendering distinction and mutation boundaries.

## Acceptance criteria

- Required proof files are non-empty and contain run id.
- Worker prompts are independently executable.
- Worker 3 prompt does not contain forbidden dependency phrases.
- API contracts are marked draft unless source proves existing endpoints.
- Plan distinguishes backend computation from frontend DOM/SVG rendering.
- No product code is changed by Planner.
