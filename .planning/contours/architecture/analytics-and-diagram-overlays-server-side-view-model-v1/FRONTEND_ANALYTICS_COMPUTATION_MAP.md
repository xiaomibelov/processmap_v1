# Frontend analytics computation map

Run ID: `20260519T090224Z-17699`

## Product Actions Registry

Confirmed frontend computations:

| Computation | Evidence | Status |
|---|---|---|
| Current-session rows from `interview.analysis.product_actions` | `frontend/src/components/process/analysis/ProductActionsRegistryPanel.jsx:47`, `:214`; `frontend/src/features/process/analysis/productActionsRegistryModel.js:51` | frontend-derived fallback |
| Row completeness | `productActionsRegistryModel.js:42` and backend mirror `backend/app/routers/product_actions_registry.py:187` | duplicate FE/BE rule |
| Unique filter options | `productActionsRegistryModel.js:99`; panel consumes at `ProductActionsRegistryPanel.jsx:308` | frontend-derived |
| Filtered rows | `productActionsRegistryModel.js:115`; panel consumes at `ProductActionsRegistryPanel.jsx:309` | frontend-derived |
| Summary metrics | `productActionsRegistryModel.js:86`; panel consumes summary/filtered summary at `ProductActionsRegistryPanel.jsx:310`-`:311` | frontend-derived |
| Pagination | `ProductActionsRegistryPanel.jsx:312`-`:315` | frontend-only UI/page slice |
| Session summaries fallback from rows | `ProductActionsRegistryPanel.jsx:92`-`:119`, `:278`-`:289` | frontend fallback |
| Backend registry load | `ProductActionsRegistryPanel.jsx:220`-`:298`; `frontend/src/lib/api.js:172`-`:186` | confirmed backend API consumer |
| Explicit capped full-session fallback | `ProductActionsRegistryPanel.jsx:370`-`:403` | frontend-heavy fallback |
| Export payload and browser download | `ProductActionsRegistryPanel.jsx:585`-`:639`; `frontend/src/lib/api.js:200`-`:222` | frontend prepares request/download, backend prepares bytes |
| Bulk AI apply mutates durable actions | `ProductActionsRegistryPanel.jsx:509`-`:579` | out of server-side view-model scope |

Conclusion:
- Product Actions is mixed. Backend already computes registry rows, session summaries, filters, pagination and export bytes. Frontend still keeps local fallback row building, filtering, summary, pagination and session-summary fallback for some flows.

## Process Properties Registry

Confirmed frontend computations:

| Computation | Evidence | Status |
|---|---|---|
| Rows from `bpmn_meta.camunda_extensions_by_element_id` | `frontend/src/components/process/analysis/ProcessPropertiesRegistryPage.jsx:45`-`:79` | frontend-derived only |
| Session-only source gate | `ProcessPropertiesRegistryPage.jsx:97`-`:101` | session scope only |
| Filters by type/group/source/process/status | `ProcessPropertiesRegistryPage.jsx:92`-`:109` | frontend-derived |
| Filter option sets | `ProcessPropertiesRegistryPage.jsx:110`-`:116` | frontend-derived |
| Metrics and completeness | `ProcessPropertiesRegistryPage.jsx:14`-`:24`, `:134`-`:137`, `:171`-`:177` | frontend-derived |
| Source-truth warning | `ProcessPropertiesRegistryPage.jsx:118`-`:120` | explicitly foundation/session-only |

Conclusion:
- Properties Registry has no confirmed backend view-model endpoint. It is currently session-only and frontend-derived from `bpmn_meta.camunda_extensions_by_element_id`.

## Diagram/property search analytics

| Computation | Evidence | Status |
|---|---|---|
| Searchable Camunda/Zeebe entries from runtime business object | `frontend/src/components/process/BpmnStage.jsx:2191`-`:2228`; `frontend/src/features/process/stage/search/extractCamundaZeebePropertyEntries.js:173`-`:203` | frontend runtime-derived |
| Search result normalization/filtering | `frontend/src/features/process/stage/search/useDiagramPropertySearchModel.js:23`-`:78` | frontend-derived |

Conclusion:
- Searchable property analytics are runtime/frontend-derived from bpmn-js business objects, not server view-models.

## Current/future row classification

| Item | Classification |
|---|---|
| Product Actions row shaping | confirmed backend truth exists; frontend fallback remains |
| Product Actions filters/summaries/pagination | confirmed backend truth exists; frontend fallback remains |
| Product Actions exports | confirmed backend bytes exist; frontend triggers download |
| Properties rows/summaries/filters | frontend-derived only |
| Diagram property search rows | frontend-derived only |
| Workspace/project Properties Registry | future backend requirement |
