# Heavy frontend candidates for server-side view-models

Run ID: `20260519T090224Z-17699`

## Priority candidates

| Candidate | Current source | Why heavy | Backend target | Frontend stays |
|---|---|---|---|---|
| Product Actions fallback row model | `productActionsRegistryModel.js:51`-`:133`, `ProductActionsRegistryPanel.jsx:214`-`:315` | duplicates backend row/filter/summary logic and can load full sessions in capped loop | make backend registry the only source for rows, summaries, filters and pagination | UI filters state, selected rows, page controls |
| Product Actions session/source summaries | `ProductActionsRegistryPanel.jsx:92`-`:119`, `:278`-`:289`, `:752`-`:821` | fallback rebuilds session summaries when backend response lacks them | enforce backend response invariant for all scopes | display/source navigation |
| Product Actions export request shaping | `ProductActionsRegistryPanel.jsx:585`-`:639` | frontend still mirrors filter payload and selected sessions | keep backend export bytes; later share query model with row API | trigger/download UX |
| Properties Registry rows | `ProcessPropertiesRegistryPage.jsx:45`-`:109` | all extraction/filtering/metrics are frontend-only and session-only | backend `/api/analytics/properties*` read view-model from `bpmn_meta_json` | active scope/filter state, table rendering |
| Properties summaries/filter options | `ProcessPropertiesRegistryPage.jsx:110`-`:137`, `:171`-`:177` | repeated scans on all rows | backend summary/filter endpoints or response facets | selected filter values |
| Diagram properties overlay data | `propertyDictionaryModel.js:278`-`:360`, `BpmnStage.jsx:2464`-`:2495`, `decorManager.js:1532`-`:1631` | derives chips from meta/runtime business objects and sequence flows in frontend | backend overlay view-model from `bpmn_meta_json` + optional parsed BPMN XML | viewport, selected element, renderer |
| Diagram property search rows | `BpmnStage.jsx:2191`-`:2228`, `extractCamundaZeebePropertyEntries.js:173`-`:203`, `useDiagramPropertySearchModel.js:65`-`:78` | scans runtime business objects in frontend | backend searchable property index/view-model for persisted XML/meta | search input, active result navigation |

## Not solved by backend data move alone

| Cost | Evidence | Required frontend work |
|---|---|---|
| Mass `.djs-overlay` DOM nodes | `decorManager.js:1721`-`:1757` | viewport culling, zoom thresholds, detail-on-demand |
| Overlay table DOM rebuild | `decorManager.js:1407`-`:1457`, `:1733`-`:1741` | cap visible rows, reuse nodes, avoid hidden overlays |
| Pan/zoom overlay churn | `wireBpmnStageRuntimeEvents.js:293`-`:319`, `:415`-`:440`; `BpmnStage.jsx:4076`-`:4084` | pan-aware viewbox signature and settled scheduling |
| Hybrid SVG/DOM rendering | `HybridOverlayRenderer.jsx:54`-`:184` | visible-only render rows and imperative hide/show during viewbox change |
| React prop churn | `useStableProcessDiagramOverlayLayersProps.js:252`-`:295` | stable response signatures and thin props |

## Suggested migration order

1. Make Product Actions Registry consume only confirmed backend registry query/export for read-only rows, summaries, filters and pagination.
2. Add backend Properties Registry read API from `bpmn_meta_json.camunda_extensions_by_element_id`; keep workspace/project scope explicit.
3. Add compact backend diagram overlay view-model for property chips/source links/statuses, but keep rendering frontend-owned.
4. Implement frontend viewport-aware overlay rendering separately; do not claim backend view-models solve DOM/SVG cost.
5. Consider cache/materialization only after source-truth semantics and invalidation are approved.

## Guardrails

- No BPMN XML mutation from analytics read APIs.
- No Product Actions mutation from read-only view-model APIs.
- Existing `GET /api/sessions/{id}/bpmn` and `GET /api/sessions/{id}/analytics` side effects should not be copied into new read-model endpoints.
- Draft `/api/analytics/*` endpoint names are future contracts, not existing APIs.
