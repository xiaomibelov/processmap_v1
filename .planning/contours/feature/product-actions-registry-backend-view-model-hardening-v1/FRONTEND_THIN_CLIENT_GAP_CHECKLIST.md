# FRONTEND_THIN_CLIENT_GAP_CHECKLIST

## Обязательные frontend источники

- [ ] `frontend/src/lib/apiRoutes.js`
- [ ] `frontend/src/lib/api.js`
- [ ] `frontend/src/features/process/analysis/productActionsRegistryModel.js`
- [ ] `frontend/src/components/process/analysis/ProductActionsRegistryPanel.jsx`
- [ ] `frontend/src/components/process/analysis/registry/ProductActionsRegistryFilters.jsx`
- [ ] `frontend/src/components/process/analysis/registry/ProductActionsRegistryMetrics.jsx`
- [ ] `frontend/src/components/process/analysis/registry/ProductActionsRegistryPagination.jsx`
- [ ] `frontend/src/components/process/analysis/registry/ProductActionsRegistryTable.jsx`

## Frontend-heavy logic to map

- [ ] `normalizeBackendRows`
- [ ] `normalizeBackendSessions`
- [ ] `summarizeRowsAsSessions`
- [ ] `uniqueProductActionRegistryFilterOptions`
- [ ] `filterProductActionRegistryRows`
- [ ] `summarizeProductActionRegistryRows`
- [ ] local pagination via `filteredRows.slice`
- [ ] `buildExportPayload`
- [ ] project fallback via `apiGetSession`
- [ ] session fallback via `buildProductActionRegistryRows`

## Thin-client target

- [ ] frontend consumes backend `rows` for current page only;
- [ ] frontend uses backend `filter_options`;
- [ ] frontend uses backend `summary/metrics`;
- [ ] frontend uses backend `page`;
- [ ] frontend uses backend `empty_state`;
- [ ] frontend does not recompute canonical completeness/filter totals;
- [ ] export uses the same normalized query state as current backend query;
- [ ] legacy fallbacks are explicitly labelled and bounded.

