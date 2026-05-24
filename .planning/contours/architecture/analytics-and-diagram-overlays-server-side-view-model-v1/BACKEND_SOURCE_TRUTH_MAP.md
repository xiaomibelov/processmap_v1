# Backend source truth map

Run ID: `20260519T090224Z-17699`

## Durable session truth

| Item | Evidence | Classification |
|---|---|---|
| sessions table | `backend/app/storage.py:830`-`:867` | confirmed backend truth |
| `interview_json` | `storage.py:839`, model `backend/app/models.py:77` | confirmed backend truth |
| `nodes_json` / `edges_json` | `storage.py:840`-`:841`, model `models.py:78`-`:79` | confirmed backend truth |
| `bpmn_xml` | `storage.py:850`, model `models.py:88` | confirmed backend truth |
| `bpmn_xml_version` / `diagram_state_version` | `storage.py:851`-`:852`, model `models.py:89`-`:90` | confirmed backend truth |
| `bpmn_meta_json` / `bpmn_meta` | `storage.py:859`, `storage.py:2590`, model `models.py:92` | confirmed backend truth |
| Project/workspace/session scope | project fields `models.py:114`-`:129`, storage joins `storage.py:3130`-`:3154` | confirmed backend truth |

## Existing APIs

| API | Evidence | Classification |
|---|---|---|
| `GET /api/sessions/{session_id}` | `backend/app/_legacy_main.py:3740`-`:3768` | existing API |
| `PATCH /api/sessions/{session_id}` | `_legacy_main.py:3888`-`:4100` | existing mutation API; not read view-model |
| `PUT /api/sessions/{session_id}` | `_legacy_main.py:4205`-`:4290` | existing mutation API; not read view-model |
| `GET /api/sessions/{session_id}/analytics` | `_legacy_main.py:3874`-`:3885` | existing session analytics endpoint, may recompute and save |
| `GET/PATCH /api/sessions/{session_id}/bpmn_meta` | `_legacy_main.py:6654`-`:6708` | existing meta APIs |
| `GET /api/sessions/{session_id}/bpmn` | `_legacy_main.py:7003`-`:7095` | existing BPMN XML export/read path; may regenerate/persist when graph fingerprint stale |
| `PUT /api/sessions/{session_id}/bpmn` | `_legacy_main.py:7185`-`:7350` | existing BPMN XML/meta mutation API |
| `POST /api/analysis/product-actions/registry/query` | `backend/app/routers/product_actions_registry.py:555`-`:557` | existing Product Actions registry read API |
| `POST /api/analysis/product-actions/registry/export.csv` | `product_actions_registry.py:560`-`:568` | existing export API |
| `POST /api/analysis/product-actions/registry/export.xlsx` | `product_actions_registry.py:571`-`:579` | existing export API |

## Product Actions Registry backend truth

Confirmed:
- `backend/app/storage.py:3079`-`:3182` reads minimal session/project/workspace metadata plus `interview_json`, then extracts only `analysis.product_actions[]`.
- `backend/app/routers/product_actions_registry.py:192`-`:231` shapes action rows.
- `product_actions_registry.py:234`-`:244` applies filters.
- `product_actions_registry.py:258`-`:315` computes summary and session summary totals.
- `product_actions_registry.py:385`-`:462` validates scope, loads sources, shapes rows, filters, sorts, paginates and returns sessions/summaries/page.
- `product_actions_registry.py:480`-`:552` prepares CSV/XLSX bytes.

Classification:
- `interview.analysis.product_actions[]`: confirmed backend durable source through `interview_json`.
- Product Actions registry rows/summaries/filters/pagination/export: confirmed backend read view-model behavior.
- Product Actions mutation/write: outside this contour; do not move into BPMN XML.

## Properties and diagram overlays backend truth

| Item | Classification | Evidence / gap |
|---|---|---|
| `bpmn_meta.camunda_extensions_by_element_id` | confirmed backend durable source | persisted under `bpmn_meta_json`; normalized on session/meta/BPMN endpoints |
| Properties Registry rows/summaries/filters | frontend-derived only | no confirmed `/api/analysis/properties` or `/api/analytics/properties` endpoint found |
| Diagram overlay view-model rows | frontend-derived only | no confirmed backend diagram overlay read endpoint found |
| `nodes_json` / `edges_json` use for overlay/context | confirmed durable sources, not confirmed overlay view-model API | table/model fields exist; frontend currently computes |
| `/api/analytics/actions`, `/api/analytics/properties`, `/api/analytics/diagram-overlays` | future backend requirement | draft names in `PLAN.md`; not existing source truth |

## Mutation boundaries

- Do not mutate BPMN XML from read-only analytics/overlay APIs.
- Do not write Product Actions into BPMN XML.
- `GET /api/sessions/{id}/bpmn` can persist regenerated XML in current implementation when graph source changed; future read-only view-model APIs should avoid this side effect.
- `GET /api/sessions/{id}/analytics` can recompute and save if analytics missing; future analytics view-model APIs should explicitly define whether materialization is allowed.
