# Analytics server-split candidates

Контур: `architecture/analytics-hub-registries-ux-and-server-split-master-plan-v1`

## Current confirmed split

Подтверждено чтением checkout:
- frontend registry still owns layout, scope state, local filters, pagination state and AI review selection state;
- backend has `product_actions_registry` router with query/export endpoints;
- backend payload returns rows, summary, sessions, session_summary and page metadata;
- exports are prepared server-side for CSV/XLSX;
- frontend still performs some fallback session loading for project scope and local row shaping for session/current rows.

Статус: current workspace evidence only; checkout dirty and not merge-ready.

## Keep frontend-local now

| Responsibility | Why |
|---|---|
| Visual layout and responsive hierarchy | Presentation concern. |
| Scope tab selected state | Route/client interaction state. |
| Expand/collapse row state | Pure UI state. |
| Lightweight filters for already loaded page data | Fast interaction and low risk. |
| Empty/loading/error copy | UI concern. |
| AI/RAG panel visibility and selected explanation target | UI state only. |

## Move or keep server-side

| Candidate | Current state | Recommendation | Phase |
|---|---|---|---|
| Actions registry aggregation | Backend exists for workspace/project/session query. | Harden as canonical read model API; reduce frontend fallback loading. | Phase 3 |
| Row shaping | Backend and frontend both shape rows. | Move stable row view model to backend; frontend renders contract. | Phase 3 |
| Pagination/sorting/filtering | Backend has limit/offset and filters; frontend also filters visible rows. | Server owns large-scope pagination/filtering; frontend can keep page-local refinement. | Phase 3 |
| Source/session summaries | Backend returns sessions/session_summary. | Server owns summaries, including missing-session warnings. | Phase 3 |
| CSV/XLSX export | Backend exists. | Keep server-side; add reproducible export job/snapshot later if needed. | Phase 3 |
| Properties registry dataset | Not confirmed. | Source inventory first; then server read model. | Phase 2 -> 3 |
| AI/RAG context prep | AI bulk suggestions exist, but RAG must be read-only. | Server prepares bounded context for explain/search/summarize; no auto-mutation. | Phase 4 |
| Dashboards | Not implemented in this contour. | Server aggregate endpoints before dashboard UI. | Phase 5 |

## Candidate API contracts

These are proposed, not implementation promises:

- `POST /api/analytics/actions-registry/query`
- `POST /api/analytics/properties-registry/query`
- `POST /api/analytics/sources-summary`
- `POST /api/analytics/exports/prepare`
- `GET /api/analytics/exports/{export_id}`
- `POST /api/analytics/ai/context`

Migration note: existing `/api/analysis/product-actions/registry/*` can remain while new analytics endpoints are evaluated. Avoid breaking compatibility until a separate API contour approves rename/alias strategy.

## Server-side acceptance criteria

- Server response includes `scope`, `rows`, `summary`, `sessions`, `page`, and `source_truth_status`.
- Large workspace query does not require fetching every full session on frontend.
- Export output is generated from the same filtered query contract as visible registry rows.
- Properties registry never labels proposed/AI values as confirmed.
- RAG context preparation returns references and confidence metadata.

## Server-split risks

- Moving logic server-side before source-truth labels are clear.
- Creating a second registry contract parallel to existing product actions endpoint without migration plan.
- Treating frontend fallback behavior as durable architecture.
- Allowing AI/RAG context endpoint to become mutation path.
