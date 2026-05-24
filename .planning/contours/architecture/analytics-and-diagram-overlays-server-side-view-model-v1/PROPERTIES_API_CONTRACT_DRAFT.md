# Properties Analytics API contract draft

Run ID: `20260519T090224Z-17699`
Status: `DRAFT`

## Status and source truth

All endpoints in this file are draft targets. Current source inspection did not prove existing `/api/analytics/properties*` endpoints.

Confirmed current Properties Registry source is session BPMN metadata:

```text
bpmn_meta.camunda_extensions_by_element_id
```

The first implementation phase must expose only confirmed source data. It must not invent workspace/project property rows when the durable source boundary is not proven.

## Endpoint family

| Endpoint | Status | Purpose |
|---|---|---|
| `GET /api/analytics/properties` | `DRAFT` | Paginated property rows. |
| `GET /api/analytics/properties/summary` | `DRAFT` | Aggregate property metrics. |
| `GET /api/analytics/properties/filters` | `DRAFT` | Filter facets and sort fields. |
| `GET /api/analytics/properties/sources` | `DRAFT` | Source/session inventory. |

## Common query parameters

| Param | Type | Required | Notes |
|---|---:|---:|---|
| `scope` | enum: `session`, `project`, `workspace` | yes | `session` is the first safe target. |
| `session_id` | string | for `session` | Required for confirmed source boundary. |
| `project_id` | string | conditional | Future aggregation target only after source rules are approved. |
| `workspace_id` | string | conditional | Future aggregation target only after source rules are approved. |
| `q` | string | no | Search by element/property labels and values. |
| `element_id` | string[] | no | BPMN element id filter. |
| `property_name` | string[] | no | Multi-value facet. |
| `has_value` | boolean | no | Completeness filter. |
| `page` | integer | no | Default `1`. |
| `page_size` | integer | no | Server-capped. |
| `sort` | string | no | Allowlisted sort key. |
| `direction` | enum: `asc`, `desc` | no | Default defined by endpoint. |

## `GET /api/analytics/properties`

Response shape:

```json
{
  "status": "ok",
  "scope": "session",
  "source_kind": "bpmn_meta.camunda_extensions_by_element_id",
  "page": 1,
  "page_size": 50,
  "total": 0,
  "rows": [
    {
      "id": "session_id:element_id:property_name",
      "session_id": "",
      "project_id": "",
      "workspace_id": "",
      "element_id": "",
      "element_name": "",
      "element_type": "",
      "property_name": "",
      "property_value": "",
      "value_type": "",
      "has_value": true,
      "source_path": "bpmn_meta.camunda_extensions_by_element_id",
      "source_version": "",
      "read_only": true
    }
  ]
}
```

Server responsibilities:

- Normalize `camunda_extensions_by_element_id` into rows.
- Preserve source path and source/version metadata.
- Compute search, filters, sorting, pagination and summary server-side.
- Return honest empty states when confirmed sources are absent.

Frontend responsibilities:

- Own visible UI state, filters and selection.
- Render returned rows without creating fake data.
- Keep edit/save flows separate from this read-only registry.

## Summary endpoint

`GET /api/analytics/properties/summary` returns:

```json
{
  "status": "ok",
  "scope": "session",
  "total_properties": 0,
  "total_elements": 0,
  "elements_with_properties": 0,
  "empty_values": 0,
  "by_property_name": [],
  "by_element_type": [],
  "source_version": ""
}
```

## Filters endpoint

`GET /api/analytics/properties/filters` returns:

```json
{
  "status": "ok",
  "facets": {
    "property_name": [],
    "element_type": [],
    "element": [],
    "has_value": [true, false]
  },
  "sort_fields": ["property_name", "element_name", "element_type", "updated_at"]
}
```

## Sources endpoint

`GET /api/analytics/properties/sources` returns:

```json
{
  "status": "ok",
  "sources": [
    {
      "session_id": "",
      "project_id": "",
      "workspace_id": "",
      "source_kind": "bpmn_meta.camunda_extensions_by_element_id",
      "elements_count": 0,
      "properties_count": 0,
      "diagram_state_version": 0,
      "updated_at": ""
    }
  ]
}
```

## Mutation boundary

This API is read-only. It must not:

- write BPMN XML;
- write `bpmn_meta`;
- write Product Actions;
- trigger session save;
- create inferred property rows without confirmed durable source.

## Review requirements for implementation phase

- Tests must cover session-scope extraction from `bpmn_meta.camunda_extensions_by_element_id`.
- Project/workspace scopes must be blocked, omitted or explicitly implemented with proven source boundaries.
- Tests must prove empty states are honest and no fake data appears.

