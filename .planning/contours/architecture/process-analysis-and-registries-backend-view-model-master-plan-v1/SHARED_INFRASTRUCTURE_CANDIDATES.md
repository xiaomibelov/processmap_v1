# Shared Infrastructure Candidates

- run_id: `20260520T221413Z-51872`
- contour: `architecture/process-analysis-and-registries-backend-view-model-master-plan-v1`
- generated_by: `Agent 2 / Executor Part 1`

## Exact Duplicates (byte-identical or near-identical)

| Function | Product Actions Lines | Process Properties Lines | Recommendation |
|---|---|---|---|
| `_text` | 85-86 | 78-79 | Extract to `registry_common._text` |
| `_texts` | 89-100 | 82-93 | Extract to `registry_common._texts` |
| `_normalize_scope` | 103-107 | 96-100 | Extract to `registry_common._normalize_scope` |
| `_normalize_limit` | 110-115 | 103-108 | Extract to `registry_common._normalize_limit` |
| `_normalize_offset` | 118-123 | 111-116 | Extract to `registry_common._normalize_offset` |
| `_load_project_or_404` | 126-130 | 119-123 | Extract to `registry_common._load_project_or_404` |
| `_validate_project_ids` | 133-142 | 126-135 | Extract to `registry_common._validate_project_ids` |
| `_validate_session_ids` | 145-165 | 138-158 | Extract to `registry_common._validate_session_ids` |
| `_visible_project_ids_for_workspace` | 168-184 | 161-177 | Extract to `registry_common._visible_project_ids_for_workspace` |
| `_matches_filters` | 234-244 | 327-337 | Extract with generic filter-map parameter |
| `_summary` | 258-269 | 350-361 | Extract to `registry_common._summary` |
| `_session_summary_totals` | 301-314 | 509-522 | Extract to `registry_common._session_summary_totals` |
| `_reconcile_session_summaries_with_rows` | 317-361 | 525-568 | Extract to `registry_common._reconcile_session_summaries_with_rows` |
| `_workspace_title` | 364-368 | 571-575 | Extract to `registry_common._workspace_title` |
| `_with_workspace_titles` | 371-382 | 578-589 | Extract to `registry_common._with_workspace_titles` |
| `_export_filename` | 465-468 | 685-688 | Extract with prefix parameter |
| `_export_cell` | 471-477 | 691-697 | Extract to `registry_common._export_cell` |
| `_csv_bytes` | 480-486 | 700-706 | Extract with columns parameter |
| `_column_name` | 489-495 | 709-715 | Extract to `registry_common._column_name` |
| `_xlsx_inline_cell` | 498-501 | 718-721 | Extract to `registry_common._xlsx_inline_cell` |
| `_xlsx_bytes` | 504-552 | 724-772 | Extract with columns/widths/sheet-name parameters |

## Structural Duplicates (same pattern, minor field differences)

| Function | Product Actions Lines | Process Properties Lines | Notes |
|---|---|---|---|
| `_registry_payload` | 385-462 | 592-682 | Core flow identical; differences are addition of `filter_options`, `applied_filters`, `metrics`, `empty_state`, `source_state` in Properties. Extract base function and wrap. |
| `_session_summary` | 272-298 | 482-506 | Same shape; Properties calls `_extract_camunda_rows` instead of iterating `product_actions`. Extract base + registry-specific row extractor injection. |
| `_sort_key` | 247-255 | 340-347 | Different tuple fields; keep per-registry or parameterize. |
| `_completeness` | 187-189 | 180-182 | Different semantics; keep per-registry. |

## Frontend Duplicates

| Function / Pattern | Source | Backend Equivalent | Recommendation |
|---|---|---|---|
| `productActionRegistryCompleteness` | `productActionsRegistryModel.js:42-48` | `_completeness` in backend | Remove once frontend is thin client |
| `buildProductActionRegistryRows` | `productActionsRegistryModel.js:51-83` | `_registry_row` in backend | Remove once frontend is thin client |
| `summarizeProductActionRegistryRows` | `productActionsRegistryModel.js:86-97` | `_summary` in backend | Remove once frontend is thin client |
| `uniqueProductActionRegistryFilterOptions` | `productActionsRegistryModel.js:99-113` | `_filter_options` in backend (missing) | Add to backend, then remove from frontend |
| `filterProductActionRegistryRows` | `productActionsRegistryModel.js:115-133` | `_matches_filters` in backend | Remove once frontend is thin client |
| `buildCamundaRows` | `ProcessPropertiesRegistryPage.jsx:63-97` | `_extract_camunda_rows` in backend | Remove once backend session query is sole source |
| Client-side filters | `ProcessPropertiesRegistryPage.jsx:197-204` | `_matches_filters` in backend | Remove once frontend is thin client |

## Suggested Extraction Module

`backend/app/routers/_registry_shared.py`

- Constants: `_ALLOWED_SCOPES`, pagination bounds
- Text helpers: `_text`, `_texts`
- Normalizers: `_normalize_scope`, `_normalize_limit`, `_normalize_offset`
- Loaders / validators: `_load_project_or_404`, `_validate_project_ids`, `_validate_session_ids`, `_visible_project_ids_for_workspace`
- Workspace title helpers: `_workspace_title`, `_with_workspace_titles`
- Session summary helpers: `_session_summary_totals`, `_reconcile_session_summaries_with_rows`
- Export helpers: `_export_filename`, `_export_cell`, `_csv_bytes`, `_column_name`, `_xlsx_inline_cell`, `_xlsx_bytes`
- Base payload builder (without registry-specific row extraction / filter options)

Registry-specific modules would then only define:
- Filters + filter map
- Row extractor / `_registry_row`
- `_completeness`
- `_sort_key`
- `_summary` (if field names differ)
- `_filter_options`, `_applied_filters`, `_metrics`, `_empty_state`, `_source_state` (or reuse generic versions)
