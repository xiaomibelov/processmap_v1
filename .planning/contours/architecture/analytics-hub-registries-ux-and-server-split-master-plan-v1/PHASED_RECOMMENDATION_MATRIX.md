# Phased recommendation matrix

Контур: `architecture/analytics-hub-registries-ux-and-server-split-master-plan-v1`

## Matrix

| Phase | What to improve now | Defer | Server-side later | Must remain frontend-local now |
|---|---|---|---|---|
| Phase 0: approve architecture | Approve Analytics as Hub + registries + dashboards/export + read-only AI/RAG policy. | Product code changes. | None. | None. |
| Phase 1: Actions Registry UX/IA | Header/scope/metrics hierarchy, compact metrics, expandable rows, separated sources, AI support placement. | Master-detail route, new schema, dashboard. | Keep using existing backend query/export where available. | Layout, expand state, page-local interactions. |
| Phase 2: Properties Registry first version | Source-truth inventory, read-only property groups, confirmed/derived/hypothesis labels. | Schema migration until source truth is approved. | Optional read model after source inventory. | Grouping UI, badges, empty states. |
| Phase 3: Server analytics split | Stabilize registry view-model APIs, server pagination/filtering/export snapshots. | AI enhancements, dashboards requiring new aggregates. | Actions/properties aggregation, source summaries, export preparation. | Rendering, selected row state, client affordances. |
| Phase 4: AI/RAG analytics assistance | Explain rows/properties, suggest filters/export columns, summarize gaps. | Auto-apply, BPMN XML write, product action mutation. | Bounded context preparation and reference retrieval. | Panel state, selected target, user-triggered prompts. |
| Phase 5: Dashboards | Build trends/completeness/quality dashboards on stable aggregates. | Ad hoc client reconstruction. | Aggregate endpoints and caching. | Visualization interaction, drilldown selected state. |

## Recommended follow-up contours

1. `uiux/product-actions-registry-hierarchy-and-expandable-rows-v1`
2. `architecture/product-properties-registry-source-truth-inventory-v1`
3. `feature/product-properties-registry-read-only-mvp-v1`
4. `architecture/analytics-registry-view-model-api-contract-v1`
5. `feature/analytics-server-side-registry-aggregation-v1`
6. `feature/analytics-read-only-rag-assistant-v1`
7. `feature/analytics-dashboards-completeness-quality-v1`

## Gate order

1. Approve architecture direction.
2. Execute Actions Registry UI contour only after clean branch isolation.
3. Execute Properties Registry only after source-truth inventory.
4. Move server split only after API contract review.
5. Add RAG assistance only with explicit read-only tests.

## Non-negotiable constraints

- No Product Actions writes to BPMN XML.
- No RAG auto-mutation.
- No schema migration inside UX-only contours.
- No merge/release from dirty mixed checkout.
- No claim that properties model is confirmed until source-truth evidence exists.
