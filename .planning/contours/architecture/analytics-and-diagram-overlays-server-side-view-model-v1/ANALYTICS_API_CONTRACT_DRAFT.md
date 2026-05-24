# Product Actions Analytics API contract draft

Run ID: `20260519T090224Z-17699`
Status: `DRAFT`

## Status and current source truth

These `/api/analytics/*` endpoints are draft targets. Current source inspection proved existing Product Actions registry backend support under:

- `POST /api/analysis/product-actions/registry/query`
- `POST /api/analysis/product-actions/registry/export.csv`
- `POST /api/analysis/product-actions/registry/export.xlsx`

No current source proof was found for the target `GET /api/analytics/actions*` endpoints.

Durable source truth remains `interview.analysis.product_actions[]`. This contract is read-only and must not mutate Product Actions, BPMN XML, session interview JSON, or project metadata.

## Endpoint family

| Endpoint | Status | Purpose |
|---|---|---|
| `GET /api/analytics/actions` | `DRAFT` | Paginated server-owned Product Actions rows. |
| `GET /api/analytics/actions/summary` | `DRAFT` | Aggregate metrics for the same scope/query. |
| `GET /api/analytics/actions/filters` | `DRAFT` | Available filter facets and sort fields. |
| `GET /api/analytics/actions/sources` | `DRAFT` | Source/session inventory used to build rows. |
| `GET /api/analytics/actions/export.csv` | `DRAFT` | CSV export for the same query semantics. |
| `GET /api/analytics/actions/export.xlsx` | `DRAFT` | XLSX export for the same query semantics. |

## Common query parameters

| Param | Type | Required | Notes |
|---|---:|---:|---|
| `scope` | enum: `session`, `project`, `workspace` | yes | Controls durable source boundary. |
| `session_id` | string | for `session` | Required when `scope=session`. |
| `project_id` | string | for `project` | Required when `scope=project`; optional narrowing for workspace. |
| `workspace_id` | string | for `workspace` | Required when `scope=workspace`. |
| `q` | string | no | Text search across action/product/source labels. |
| `product_group` | string[] | no | Multi-value facet. |
| `product_name` | string[] | no | Multi-value facet. |
| `source` | string[] | no | Example: manual, ai_suggested, imported. |
| `bpmn_element_id` | string[] | no | Narrows by process element. |
| `page` | integer | no | Default `1`. |
| `page_size` | integer | no | Server-capped; default should be small enough for UI. |
| `sort` | string | no | Allowlisted sort key. |
| `direction` | enum: `asc`, `desc` | no | Default defined by endpoint. |

## `GET /api/analytics/actions`

Response shape:

```json
{
  "status": "ok",
  "scope": "project",
  "query": {},
  "page": 1,
  "page_size": 50,
  "total": 0,
  "rows": [
    {
      "id": "pa_...",
      "product_group": "",
      "product_name": "",
      "action_name": "",
      "action_object": "",
      "bpmn_element_id": "",
      "step_id": "",
      "source": "",
      "session_id": "",
      "session_title": "",
      "project_id": "",
      "workspace_id": "",
      "created_at": "",
      "updated_at": "",
      "source_version": "",
      "read_only": true
    }
  ],
  "summary_ref": "/api/analytics/actions/summary?...",
  "filters_ref": "/api/analytics/actions/filters?..."
}
```

Server responsibilities:

- Load only allowed sessions/sources for the requested scope.
- Shape rows, filter, sort, paginate and compute totals server-side.
- Exclude heavy payload fields such as full `interview`, `bpmn_xml`, raw BPMN metadata and report versions from row responses.
- Return stable row ids and source/version metadata for frontend diffing.

Frontend responsibilities:

- Own active tab, selected rows, expanded rows, filter form state and navigation.
- Render returned rows without recomputing the registry as primary truth.

## Summary endpoint

`GET /api/analytics/actions/summary` returns aggregate counts for the same source/query:

```json
{
  "status": "ok",
  "scope": "project",
  "total_actions": 0,
  "total_sessions": 0,
  "unique_products": 0,
  "unique_groups": 0,
  "by_source": [],
  "by_product_group": [],
  "by_session": [],
  "source_version": ""
}
```

## Filters endpoint

`GET /api/analytics/actions/filters` returns server-produced facets:

```json
{
  "status": "ok",
  "facets": {
    "product_group": [],
    "product_name": [],
    "source": [],
    "session": [],
    "bpmn_element": []
  },
  "sort_fields": ["product_group", "product_name", "action_name", "session_title", "updated_at"]
}
```

## Sources endpoint

`GET /api/analytics/actions/sources` returns the durable source inventory without heavy payloads:

```json
{
  "status": "ok",
  "sources": [
    {
      "session_id": "",
      "session_title": "",
      "project_id": "",
      "workspace_id": "",
      "actions_count": 0,
      "diagram_state_version": 0,
      "updated_at": ""
    }
  ]
}
```

## Export endpoints

Exports must use the same query semantics as `GET /api/analytics/actions`. Export responses are read-only download responses and must not create or update durable domain state.

## Review requirements for implementation phase

- Tests must prove scope isolation, auth, filtering, sorting, pagination, empty states and export parity.
- Tests must prove no heavy source payloads leak into row responses.
- Tests must prove Product Actions are not written into BPMN XML.

