# Current Analytics AI/RAG Touchpoints

Контур: `architecture/analytics-hub-registries-ux-and-server-split-master-plan-v1`

## Boundary

RAG preflight confirmed a critical rule: RAG is a read-only suggestion/context layer. It must not auto-mutate code, BPMN XML, Product Actions, or properties. AI drafts are likewise not canonical truth until the user explicitly accepts them through a product save path.

## Product Actions AI touchpoints

| Touchpoint | Current role | Mutation? |
|---|---|---|
| `POST /api/sessions/{id}/analysis/product-actions/suggest` | Draft suggestions for one session | No durable mutation by itself |
| `POST /api/analysis/product-actions/suggest-bulk` | Draft suggestions for selected sessions | No durable mutation by itself |
| `acceptAiProductActions` frontend path | Accept selected AI suggestions into product actions | Yes, explicit user action |
| Admin AI modules/prompts/provider settings | Configure AI provider/prompt behavior | Config mutation, not product truth mutation |

Confirmed UI behavior:
- Registry bulk AI controls are visible only for workspace/project scopes.
- User selects sessions first.
- AI suggestions are displayed in review rows.
- User must click `Принять выбранные` before product truth changes.

## RAG touchpoints

| Touchpoint | Current role |
|---|---|
| `GET /api/rag/search` | Search indexed RAG docs |
| `POST /api/rag/index` | General source indexing |
| `POST /api/rag/product-actions/index` | Index selected/all durable product actions from a session |
| `apiRagSearch` / `apiRagIndex` / `apiRagIndexProductActions` | Frontend API wrappers |
| `tools/rag/pm-rag-agent-preflight.mjs` | Agent-side read-only context preflight |

Confirmed:
- Product Actions RAG indexing loads session product actions and indexes selected IDs or all existing durable action IDs.
- Missing action IDs are skipped, not invented.
- RAG metadata marks entries as `source_type=product_action`.

## Analytics Hub AI/RAG status

Confirmed:
- Analytics Hub itself currently has no visible AI/RAG panel or callout in `ProcessAnalyticsHub.jsx`.
- Registry has AI controls; Hub only links to registry.
- Planning docs propose AI/RAG as read-only helper layer for analytics/properties, but current Hub implementation does not yet expose it.

## Proposed future model, not current truth

- Hub summary card could show RAG/index freshness.
- Actions/properties registries could show AI interpretation as separate read-only annotations.
- RAG could explain provenance and related docs for a row/property.
- None of those should write BPMN XML, Product Actions, or property values automatically.
