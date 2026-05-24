# Current Actions Registry State

Контур: `architecture/analytics-hub-registries-ux-and-server-split-master-plan-v1`

## Canonical data source

Confirmed:
- Durable product actions live under `interview.analysis.product_actions[]`.
- Frontend registry model builds rows from product action records through `buildProductActionRegistryRows`.
- Save/apply path for accepted actions uses `patchInterviewAnalysis(..., { product_actions: ... })`.
- Generic interview patch logic explicitly omits Product Actions from broad interview patching, preserving the dedicated product-actions persistence lane.

Non-truth:
- BPMN XML is not a Product Actions durable source.
- AI drafts are not durable truth until explicitly accepted.
- RAG index entries are not product truth.

## Current frontend structure

| File/component | Role |
|---|---|
| `ProductActionsRegistryPage.jsx` | Dedicated page wrapper for registry surface |
| `ProductActionsRegistryPanel.jsx` | Main content, scope loading, backend calls, AI/export/session summary behavior; default export still supports overlay dialog |
| `registry/ProductActionsRegistryHeader.jsx` | Title/back/export controls |
| `registry/ProductActionsRegistryMetrics.jsx` | Summary cards for visible sessions/rows/completeness |
| `registry/ProductActionsRegistryFilters.jsx` | Filters: group/product/type/stage/category/role/completeness |
| `registry/ProductActionsRegistryTable.jsx` | Rows and empty state |
| `registry/ProductActionsRegistryPagination.jsx` | Page size and page navigation |
| `productActionsRegistryModel.js` | Row normalization, filtering, summaries, cap enforcement |

## Current backend structure

| Backend | Role |
|---|---|
| `backend/app/routers/product_actions_registry.py` | Registry query/export endpoints, scope validation, row/session summaries |
| `backend/tests/test_product_actions_registry_api.py` | Endpoint/filter/export contract coverage |
| `backend/app/routers/product_actions_ai.py` | Single/bulk Product Actions AI suggestions |
| `backend/app/routers/rag.py` | RAG search/index/product-actions index |

## Scope behavior

Workspace:
- Uses backend query with `scope=workspace` and `workspace_id`.
- UI copy says workspace summary is built without loading full data of all sessions on frontend.
- Session summary table includes sessions with and without actions.

Project:
- Uses backend query with `scope=project` and `project_id`.
- Keeps manual selected-session load as capped fallback through `apiListProjectSessions(..., view: "summary")` and `apiGetSession`.

Session:
- Uses backend query with `scope=session` and `session_id`.
- Also has current-session row build path from `interviewData.analysis.product_actions`.

## Filters, metrics, pagination, export

Confirmed:
- Filters cover product group/name, action type/stage/object category, role, completeness.
- Table columns are effectively product, action, process/step, status.
- Pagination supports page size `25` or `50`.
- Export is enabled only when filtered rows exist and backend/export is not loading.
- CSV/XLSX export payload uses the active scope and current filters.

## AI behavior

Confirmed:
- Bulk AI appears for workspace/project scopes.
- Selection cap is `10` sessions for bulk AI UI.
- Bulk suggest endpoint receives selected `session_ids`.
- Suggestions are displayed separately in an AI review section.
- Duplicate suggestions are disabled.
- Durable mutation happens only after `Принять выбранные`, which loads the session and calls `acceptAiProductActions`.

Risk:
- Accepting AI suggestions mutates `interview.analysis.product_actions[]`; this is outside read-only registry query/export behavior and should remain clearly separated in UX and reviews.

## Empty and populated states

Empty state:
- Table renders `product-actions-registry-empty`.
- Copy includes base empty message plus backend status.
- Session summary empty has separate messages for loading, no sessions, or unavailable summary.

Populated state:
- Metrics summarize all rows and filtered rows.
- Incomplete banner appears when any row has missing required business fields.
- Session summary table supports open project/open session actions.

## Current limitations

- Current dirty checkout includes large frontend changes; registry state should be reviewed after branch isolation.
- Live DB contents were not queried in this part.
- Product Actions Registry has both page and legacy overlay implementations; future work should decide if overlay remains supported.
