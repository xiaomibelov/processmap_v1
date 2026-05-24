# Current Backend Source Truth — Registry View Models

- run_id: `20260520T221413Z-51872`
- contour: `architecture/process-analysis-and-registries-backend-view-model-master-plan-v1`
- generated_by: `Agent 2 / Executor Part 1`

## Product Actions Registry

### Source file
`backend/app/routers/product_actions_registry.py` — 579 lines.

### Endpoints
| Method | Path | Handler | Lines |
|---|---|---|---|
| POST | `/api/analysis/product-actions/registry/query` | `query_product_actions_registry` | 555-557 |
| POST | `/api/analysis/product-actions/registry/export.csv` | `export_product_actions_registry_csv` | 560-568 |
| POST | `/api/analysis/product-actions/registry/export.xlsx` | `export_product_actions_registry_xlsx` | 571-579 |

### Request model — `ProductActionsRegistryQueryIn`
- `scope`: str = "workspace"
- `workspace_id`: Optional[str] = None
- `project_id`: Optional[str] = None
- `session_id`: Optional[str] = None
- `project_ids`: List[str] = []
- `session_ids`: List[str] = []
- `filters`: `ProductActionsRegistryFilters`
- `limit`: int = 100
- `offset`: int = 0

### Filters — `ProductActionsRegistryFilters`
- `product_groups`: List[str] = []
- `products`: List[str] = []
- `action_types`: List[str] = []
- `stages`: List[str] = []
- `object_categories`: List[str] = []
- `roles`: List[str] = []
- `completeness`: str = "all"

### Filter map (`_FILTER_MAP`)
Maps filter key -> row key: `product_groups→product_group`, `products→product_name`, `action_types→action_type`, `stages→action_stage`, `object_categories→action_object_category`, `roles→role`.

### Response envelope (query)
```json
{
  "ok": true,
  "scope": "workspace|project|session",
  "rows": [...],
  "summary": {
    "projects_total": 0,
    "sessions_total": 0,
    "actions_total": 0,
    "complete": 0,
    "incomplete": 0
  },
  "sessions": [...],
  "session_summary": {
    "projects_total": 0,
    "sessions_total": 0,
    "sessions_with_actions": 0,
    "sessions_without_actions": 0,
    "actions_total": 0,
    "complete": 0,
    "incomplete": 0
  },
  "page": {
    "limit": 100,
    "offset": 0,
    "total": 0,
    "has_more": false
  }
}
```
- [CONFIRMED] No `filter_options`, `applied_filters`, `metrics`, `empty_state`, `source_state` fields.

### Row schema (`_registry_row`)
Keys: `id`, `registry_id`, `org_id`, `workspace_id`, `workspace_title`, `project_id`, `project_title`, `session_id`, `session_title`, `action_id`, `raw_action_id`, `product_group`, `product_name`, `action_type`, `action_stage`, `action_object_category`, `action_object`, `action_method`, `role`, `step_id`, `step_label`, `node_id`, `bpmn_element_id`, `work_duration_sec`, `wait_duration_sec`, `source`, `confidence`, `updated_at`, `diagram_state_version`, `completeness`, `missing_fields`.

### Completeness rule
`_REQUIRED_BUSINESS_FIELDS = ("product_name", "product_group", "action_type", "action_object")` — missing any = "incomplete".

### Sort key
`(product_group, product_name, session_title, step_label, action_stage, action_type)` — all lowercased.

### Export columns (22)
`workspace_title`, `project_title`, `project_id`, `session_title`, `session_id`, `product_group`, `product_name`, `action_type`, `action_stage`, `action_object_category`, `action_object`, `action_method`, `role`, `step_label`, `step_id`, `bpmn_element_id`, `work_duration_sec`, `wait_duration_sec`, `source`, `confidence`, `completeness`, `updated_at`.

### Permissions
- `require_authenticated_user`
- `request_active_org_id`
- `require_org_member_for_enterprise`
- `project_access_allowed` per project/session

### Scope validation
- `workspace`: requires `workspace_id`, resolves visible projects via `project_scope_for_request`
- `project`: requires `project_ids`, validates each
- `session`: requires `session_ids`, validates each, auto-resolves `project_ids` from sessions

---

## Process Properties Registry

### Source file
`backend/app/routers/process_properties_registry.py` — 799 lines.

### Endpoints
| Method | Path | Handler | Lines |
|---|---|---|---|
| POST | `/api/analysis/properties/registry/query` | `query_process_properties_registry` | 775-777 |
| POST | `/api/analysis/properties/registry/export.csv` | `export_process_properties_registry_csv` | 780-788 |
| POST | `/api/analysis/properties/registry/export.xlsx` | `export_process_properties_registry_xlsx` | 791-799 |

### Request model — `ProcessPropertiesRegistryQueryIn`
- Same shape as Product Actions (`scope`, `workspace_id`, `project_id`, `session_id`, `project_ids`, `session_ids`, `filters`, `limit`, `offset`).

### Filters — `ProcessPropertiesRegistryFilters`
- `property_types`: List[str] = []
- `groups`: List[str] = []
- `sources`: List[str] = []
- `processes`: List[str] = []
- `element_types`: List[str] = []
- `completeness`: str = "all"

### Filter map (`_FILTER_MAP`)
Maps: `property_types→property_type`, `groups→property_group`, `sources→source`, `processes→source`, `element_types→element_type`.

### Response envelope (query)
Same as Product Actions plus:
- `filter_options`: `{property_types, groups, sources, processes, element_types, completeness}`
- `applied_filters`: same keys with resolved values
- `metrics`: `{total_rows, filtered_rows, page_rows, projects_total, sessions_total, sessions_with_actions, sessions_without_actions, complete, incomplete, total_complete, total_incomplete, limit, offset, has_more}`
- `empty_state`: `{kind, scope, message_key}`
- `source_state`: `{source, namespace, heavy_payload_excluded, mutation_allowed, session_summary_source, sessions_scanned, actions_scanned, source_contract_version}`

### Row schema (`_extract_camunda_rows`)
Keys: `id`, `registry_id`, `org_id`, `workspace_id`, `workspace_title`, `project_id`, `project_title`, `session_id`, `session_title`, `element_id`, `element_title`, `element_type`, `property_name`, `property_value`, `property_type`, `property_group`, `source`, `source_kind`, `status`, `completeness`, `updated_at`, `diagram_state_version`.

### Completeness rule
`"complete"` if `property_value` is truthy and not `"—"`, else `"incomplete"`.

### Sort key
`(property_group, property_type, session_title, element_id, property_name)` — all lowercased.

### Export columns (16)
`workspace_title`, `project_title`, `project_id`, `session_title`, `session_id`, `element_id`, `element_title`, `element_type`, `property_name`, `property_value`, `property_type`, `property_group`, `source`, `source_kind`, `status`, `completeness`, `updated_at`.

### Row extraction specifics
- Reads `bpmn_meta.camunda_extensions_by_element_id`.
- Parses BPMN XML to build `element_id → {type, title}` lookup (lines 205-222).
- Handles normalized format (`properties.extensionProperties`, `properties.extensionListeners`), legacy flat array, and legacy top-level array (lines 231-250).
- Generates two row kinds: Camunda property rows and Camunda listener rows.

### Permissions
Same as Product Actions.

### Scope validation
Identical logic to Product Actions.

### Data source
- `get_storage().list_process_properties_registry_sources(...)` returns metadata + `bpmn_meta_json` + `bpmn_xml`.
- `get_storage().list_product_action_registry_sources(...)` returns metadata + `interview_json` reduced to `product_actions`.
