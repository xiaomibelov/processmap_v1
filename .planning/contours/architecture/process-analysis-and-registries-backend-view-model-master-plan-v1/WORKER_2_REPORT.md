# Worker 2 Report — Registry Backend View Model Source Truth

- run_id: `20260520T221413Z-51872`
- contour: `architecture/process-analysis-and-registries-backend-view-model-master-plan-v1`
- mode: `SINGLE_EXECUTOR_MODE`
- status: `DONE`

## Summary

Both backend registries (`product_actions_registry.py`, `process_properties_registry.py`) are structurally similar but diverge in response envelope completeness and row-extraction logic. [CONFIRMED] Product Actions Registry lacks `filter_options`, `applied_filters`, `metrics`, `empty_state`, `source_state` in its query response, while Process Properties Registry includes all of them. [CONFIRMED] Both share near-identical infrastructure for scope validation, pagination, export, and session-summary reconciliation.

## Key Findings

### 1. Response envelope divergence
- Product Actions: returns `ok`, `scope`, `rows`, `summary`, `sessions`, `session_summary`, `page` (lacks `filter_options`, `applied_filters`, `metrics`, `empty_state`, `source_state`).
- Process Properties: returns the same fields plus `filter_options`, `applied_filters`, `metrics`, `empty_state`, `source_state`.

### 2. Row extraction complexity
- Product Actions: simple list enumeration over `source["product_actions"]` (lines 439-440).
- Process Properties: deep Camunda extension extraction from `bpmn_meta.camunda_extensions_by_element_id` with BPMN XML element lookup, normalized vs legacy format handling, and property/listener bifurcation (lines 185-324).

### 3. Frontend mixed state
- `ProcessPropertiesRegistryPage.jsx` still builds client-side Camunda rows for session-scope fallback (lines 63-97) and applies client-side filters (lines 197-204).
- `productActionsRegistryModel.js` duplicates completeness logic, filter logic, and summary logic that already exists in the backend.

### 4. Shared infrastructure duplication
- Both files duplicate `_text`, `_texts`, `_normalize_scope`, `_normalize_limit`, `_normalize_offset`, `_load_project_or_404`, `_validate_project_ids`, `_validate_session_ids`, `_visible_project_ids_for_workspace`, `_completeness`, `_matches_filters`, `_sort_key`, `_summary`, `_session_summary`, `_session_summary_totals`, `_reconcile_session_summaries_with_rows`, `_workspace_title`, `_with_workspace_titles`, `_registry_payload` (core structure), `_export_filename`, `_export_cell`, `_csv_bytes`, `_column_name`, `_xlsx_inline_cell`, `_xlsx_bytes`.

## Recommendations

1. **Backfill Product Actions response envelope** — add `filter_options`, `applied_filters`, `metrics`, `empty_state`, `source_state` to match Process Properties (Phase 1 follow-up).
2. **Extract shared infrastructure** into `backend/app/routers/_registry_common.py` or similar (Phase 3).
3. **Remove client-side row building** from `ProcessPropertiesRegistryPage.jsx` session fallback once backend session-scope query is hardened.
4. **Deprecate `productActionsRegistryModel.js` filter/summary functions** once frontend becomes thin client.
5. **Unify export column widths / sheet naming** — currently hardcoded per registry.

## Grounded Evidence

| Claim | Source | Lines |
|---|---|---|
| Product Actions lacks `filter_options` | `product_actions_registry.py` | 449-462 |
| Process Properties has `filter_options` | `process_properties_registry.py` | 664-682 |
| Shared `_normalize_scope` | both files | 103-107 / 96-100 |
| Shared `_validate_project_ids` | both files | 133-142 / 126-135 |
| Client-side Camunda row builder | `ProcessPropertiesRegistryPage.jsx` | 63-97 |
| Client-side filter/summary dupes | `productActionsRegistryModel.js` | 42-133 |
