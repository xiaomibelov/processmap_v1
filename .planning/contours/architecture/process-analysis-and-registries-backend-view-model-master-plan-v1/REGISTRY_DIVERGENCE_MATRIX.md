# Registry Divergence Matrix

- run_id: `20260520T221413Z-51872`
- contour: `architecture/process-analysis-and-registries-backend-view-model-master-plan-v1`

| Dimension | Product Actions Registry | Process Properties Registry | Divergence |
|---|---|---|---|
| **File** | `product_actions_registry.py` (579 lines) | `process_properties_registry.py` (799 lines) | Properties is +220 lines due to Camunda extraction |
| **Query endpoint** | `POST /api/analysis/product-actions/registry/query` | `POST /api/analysis/properties/registry/query` | Different paths |
| **CSV export** | `POST /api/analysis/product-actions/registry/export.csv` | `POST /api/analysis/properties/registry/export.csv` | Different paths |
| **XLSX export** | `POST /api/analysis/product-actions/registry/export.xlsx` | `POST /api/analysis/properties/registry/export.xlsx` | Different paths |
| **Scopes** | workspace, project, session | workspace, project, session | **Identical** |
| **Request model** | `ProductActionsRegistryQueryIn` | `ProcessPropertiesRegistryQueryIn` | Same fields, different class name |
| **Filter fields** | product_groups, products, action_types, stages, object_categories, roles | property_types, groups, sources, processes, element_types | Domain-specific |
| **Completeness filter** | `"all" / "complete" / "incomplete"` | `"all" / "complete" / "incomplete"` | **Identical** |
| **Response envelope** | `ok`, `scope`, `rows`, `summary`, `sessions`, `session_summary`, `page` | Same + `filter_options`, `applied_filters`, `metrics`, `empty_state`, `source_state` | **Product Actions missing 5 fields** |
| **filter_options** | Missing | Present (line 650) | **Divergence** |
| **applied_filters** | Missing | Present (line 649) | **Divergence** |
| **metrics** | Missing | Present (line 660) | **Divergence** |
| **empty_state** | Missing | Present (line 661) | **Divergence** |
| **source_state** | Missing | Present (line 662) | **Divergence** |
| **Row extraction** | Simple enumeration over `source["product_actions"]` | Deep Camunda extraction from `bpmn_meta` + XML lookup | **High divergence** |
| **Row ID format** | `{session_id}::{action_id}` | `{session_id}::{element_id}::property::{prop_name}` | Different namespaces |
| **Completeness rule** | Required fields tuple | `property_value != "" && != "—"` | Different semantics |
| **Sort key** | `(product_group, product_name, session_title, step_label, action_stage, action_type)` | `(property_group, property_type, session_title, element_id, property_name)` | Different |
| **Summary shape** | `projects_total, sessions_total, actions_total, complete, incomplete` | Same field names | **Identical** |
| **Session summary shape** | `actions_total, complete, incomplete, path, folder_title, ...` | Same field names | **Identical** |
| **Session summary totals** | `projects_total, sessions_total, sessions_with_actions, sessions_without_actions, actions_total, complete, incomplete` | Same | **Identical** |
| **Reconcile rows fallback** | Present (lines 317-361) | Present (lines 525-568) | **Identical logic** |
| **Export columns** | 22 columns | 16 columns | Different domains |
| **Export filename prefix** | `product-actions-{scope}-{stamp}` | `process-properties-{scope}-{stamp}` | Different |
| **XLSX sheet name** | `Product actions` | `Process properties` | Different |
| **CSV delimiter** | `;` | `;` | **Identical** |
| **CSV BOM** | UTF-8 BOM included | UTF-8 BOM included | **Identical** |
| **XLSX column widths** | Hardcoded 22 widths | Hardcoded 16 widths | Different per domain |
| **Error handling** | 422 for invalid scope / missing IDs; 404 for not_found | Same | **Identical** |
| **Pagination** | limit 1-1000, offset >= 0 | Same | **Identical** |
| **Permission checks** | `require_authenticated_user`, `request_active_org_id`, `project_access_allowed` | Same | **Identical** |
| **Scope validation helpers** | `_validate_project_ids`, `_validate_session_ids`, `_visible_project_ids_for_workspace` | Same | **Identical** |
| **Workspace title resolution** | `_workspace_title`, `_with_workspace_titles` | Same | **Identical** |
