# Worker 2 report — current source map lane

Run ID: `20260519T090224Z-17699`
Контур: `architecture/analytics-and-diagram-overlays-server-side-view-model-v1`
Вердикт: `DONE`

## Runtime/source truth

| Проверка | Значение |
|---|---|
| `pwd` | `/opt/processmap-test` |
| `git remote -v` | `origin https://<redacted>@github.com/xiaomibelov/processmap_v1.git` |
| `git fetch origin` | `PASS` |
| `git branch --show-current` | `fix/lockfile-sync-test` |
| `git rev-parse HEAD` | `5b20bc2d1292f419647238eaf37dac55f9315942` |
| `git rev-parse origin/main` | `d805e1c64c1107b9e3fe6854e031694bf741b187` |
| `git status -sb` | dirty workspace, pre-existing tracked frontend changes and many untracked artifacts |
| `git diff --name-only` | 20 tracked frontend files |
| `git diff --cached --name-only` | empty |

Risk:
- Workspace is not canonical root from AGENTS contract and branch is not `origin/main`.
- Because this lane is read-only source mapping and prompt forbids product-code changes, dirty product-code state did not block inspection.
- Product/frontend/backend/schema/package files were not changed by Worker 2.

## Reports written

- `FRONTEND_ANALYTICS_COMPUTATION_MAP.md`
- `FRONTEND_OVERLAY_COMPUTATION_MAP.md`
- `BACKEND_SOURCE_TRUTH_MAP.md`
- `HEAVY_FRONTEND_CANDIDATES.md`
- `CONTEXT_USED_EXECUTOR_PART_1.md`
- `RAG_PREFLIGHT_EXECUTOR.md`

## Key findings

### Product Actions Registry

`PASS / confirmed backend truth`

- Backend already has registry query/export endpoints:
  - `backend/app/routers/product_actions_registry.py:555`
  - `backend/app/routers/product_actions_registry.py:560`
  - `backend/app/routers/product_actions_registry.py:571`
- Backend source extractor reads `interview_json` only to reduce it to `analysis.product_actions[]`:
  - `backend/app/storage.py:3079`-`:3182`
- Backend already shapes rows, summaries, session summaries, filters, sorting, pagination and export bytes:
  - `backend/app/routers/product_actions_registry.py:192`-`:231`
  - `backend/app/routers/product_actions_registry.py:234`-`:315`
  - `backend/app/routers/product_actions_registry.py:385`-`:462`
  - `backend/app/routers/product_actions_registry.py:480`-`:552`
- Frontend still has fallback/duplicate row, filter, summary and pagination logic:
  - `frontend/src/features/process/analysis/productActionsRegistryModel.js:51`-`:133`
  - `frontend/src/components/process/analysis/ProductActionsRegistryPanel.jsx:214`-`:315`

### Properties Registry

`PASS / frontend-derived only today`

- Current rows are built in frontend from `bpmn_meta.camunda_extensions_by_element_id`:
  - `frontend/src/components/process/analysis/ProcessPropertiesRegistryPage.jsx:45`-`:79`
- Current source gate is session-only:
  - `ProcessPropertiesRegistryPage.jsx:97`-`:101`
- Filters, options, metrics and completeness are frontend-only:
  - `ProcessPropertiesRegistryPage.jsx:102`-`:137`
- No confirmed backend Properties Registry view-model endpoint was found.

### Diagram overlays

`PASS / frontend-owned computation and rendering today`

- Overlay props are assembled in frontend:
  - `frontend/src/features/process/stage/orchestration/buildProcessDiagramOverlayLayersProps.js:7`-`:70`
  - `frontend/src/features/process/stage/orchestration/useStableProcessDiagramOverlayLayersProps.js:252`-`:295`
- Properties overlay preview data is derived in frontend:
  - `frontend/src/features/process/camunda/propertyDictionaryModel.js:278`-`:360`
  - `frontend/src/components/process/BpmnStage.jsx:2464`-`:2495`
- DOM and bpmn-js overlay rendering are frontend costs:
  - `frontend/src/features/process/bpmn/stage/decor/decorManager.js:1407`-`:1457`
  - `frontend/src/features/process/bpmn/stage/decor/decorManager.js:1721`-`:1757`
- Existing hybrid layer has a frontend viewport culling pattern:
  - `frontend/src/features/process/stage/hooks/hybridLayerViewportProjection.js:58`-`:63`

## Backend/source truth classification

| Item | Classification |
|---|---|
| sessions | confirmed backend truth |
| `interview.analysis.product_actions[]` | confirmed backend truth via `interview_json` |
| `bpmn_xml` | confirmed backend truth |
| `bpmn_meta_json` | confirmed backend truth |
| `nodes_json` / `edges_json` | confirmed backend truth |
| project/workspace/session scope | confirmed backend truth |
| existing Product Actions registry API | confirmed backend read view-model |
| Properties Registry API | future backend requirement |
| Diagram overlay view-model API | future backend requirement |
| `/api/analytics/*` target endpoints | draft future contracts, not existing APIs |

## Heavy frontend candidates

Highest-value backend candidates:
- Properties Registry rows/summaries/filter facets from `bpmn_meta_json`.
- Diagram overlay property chips/source summaries from `bpmn_meta_json` and optional persisted BPMN parse.
- Diagram property search entries from persisted XML/meta.
- Remove Product Actions frontend fallback duplication once backend response invariants are accepted.

Important boundary:
- Backend view-model APIs reduce data computation.
- Frontend still must solve DOM/SVG/bpmn-js overlay rendering cost through viewport culling, zoom thresholds and visible-only rendering.

## Validation performed

- Read-only source inspection.
- RAG preflight executed.
- Obsidian-first notes/context read.
- No build/test/runtime validation was run because this Worker 2 lane has no product-code implementation.
