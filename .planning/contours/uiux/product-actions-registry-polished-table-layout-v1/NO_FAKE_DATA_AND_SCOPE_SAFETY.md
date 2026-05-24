# No Fake Data And Scope Safety

Контур: `uiux/product-actions-registry-polished-table-layout-v1`

## Durable data boundary

- Product Actions durable truth remains `interview.analysis.product_actions[]`.
- UI may reshape presentation but must not invent Product Actions, product names, stages, categories, roles, completeness states, sources, or metrics.
- BPMN XML must not be used as a Product Actions write target.
- No backend/schema migration is in scope.

## Scope boundary

- The contour is bounded to Product Actions Registry UI polish and nearest registry style assets only.
- Global shell/sidebar/topbar redesign is out of scope.
- Analytics Hub may only be affected to preserve navigation compatibility; redesigning it is out of scope.
- RAG runtime, AI prompts, suggestion algorithm, save/revision/version behavior and BPMN interaction are out of scope.

## Runtime safety checks for Agent 4

- Fresh browser context with cache-busting should be used.
- Capture console errors and network requests during view/navigation/filtering.
- Reject if simple viewing/navigation emits unexpected unsafe `PUT`, `PATCH`, or `DELETE`.
- Reject if empty workspace proof depends on broken route/backend `404` rather than valid empty data.
- Reject if metrics differ from visible real rows without an explainable filter/scope reason.

## Allowed documentation-only output from Worker 3

- Acceptance criteria.
- Expected states.
- Review checklist.
- Completion/report markers.

Worker 3 did not edit product runtime code.
