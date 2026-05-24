# BACKEND_ENDPOINT_SOURCE_MAP_CHECKLIST

## Обязательные backend источники

- [ ] `backend/app/routers/product_actions_registry.py`
  - [ ] `ProductActionsRegistryFilters`
  - [ ] `ProductActionsRegistryQueryIn`
  - [ ] `_registry_row`
  - [ ] `_summary`
  - [ ] `_session_summary`
  - [ ] `_session_summary_totals`
  - [ ] `_registry_payload`
  - [ ] `query_product_actions_registry`
  - [ ] `export_product_actions_registry_csv`
  - [ ] `export_product_actions_registry_xlsx`
- [ ] `backend/app/storage.py`
  - [ ] `list_product_action_registry_sources`
- [ ] `backend/tests/test_product_actions_registry_api.py`
  - [ ] canonical endpoint path registration
  - [ ] workspace/project/session scope aggregation
  - [ ] filters and pagination
  - [ ] export CSV/XLSX
  - [ ] heavy payload exclusion
  - [ ] access guard

## Current endpoint namespace

- [ ] `POST /api/analysis/product-actions/registry/query`
- [ ] `POST /api/analysis/product-actions/registry/export.csv`
- [ ] `POST /api/analysis/product-actions/registry/export.xlsx`

`/api/analytics/*` не является текущим endpoint namespace и не должен использоваться в этом implementation contour.

## Response contract map

- [ ] `ok`
- [ ] `scope`
- [ ] `rows`
- [ ] `summary`
- [ ] `sessions`
- [ ] `session_summary`
- [ ] `page`

## Hardening candidates

- [ ] `filter_options`
- [ ] `applied_filters`
- [ ] `metrics`
- [ ] `empty_state`
- [ ] `source_state`
- [ ] explicit export/query parity
- [ ] error/warning taxonomy

