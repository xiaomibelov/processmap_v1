# Frontend thin-client target

Run ID: `20260519T090224Z-17699`
Status: `DRAFT_TARGET`

## Principle

Frontend remains responsible for UI state and rendering. Backend becomes owner of heavy read-model computation: row shaping, filters, summaries, pagination, exports and overlay data preparation.

## Moves to backend

- Product Actions registry row shaping from `interview.analysis.product_actions[]`.
- Product Actions filtering, sorting, pagination, summaries and source inventory.
- Properties extraction from `bpmn_meta.camunda_extensions_by_element_id`.
- Properties filtering, sorting, pagination, summaries and source inventory.
- Diagram overlay data shaping into stable element-level view-models.
- Export preparation for Product Actions and later approved analytics exports.

## Stays in frontend

- Active Analytics module/tab.
- Current filter form values and URL state.
- Row selection and expanded row state.
- Navigation from registry row to diagram/session.
- Loading, empty and error presentation.
- Diagram viewport, zoom, pan, hover and selection.
- Actual DOM/SVG/bpmn-js overlay rendering.

## Product Actions target

Current frontend registry code may keep compatibility wrappers during migration, but the target primary path is:

1. UI state builds query params.
2. API client calls `GET /api/analytics/actions`.
3. UI renders server rows and server summary.
4. Export buttons call server export endpoints with the same query.
5. Local fallback computation is removed or demoted to explicit degraded/offline state after rollout proof.

## Properties target

Target primary path:

1. UI state builds query params with `scope=session` first.
2. API client calls `GET /api/analytics/properties`.
3. UI renders returned rows and honest empty states.
4. Project/workspace scope is hidden, disabled or marked unavailable until backend source boundaries are proven.

## Diagram overlays target

Target primary path:

1. Frontend requests overlay data for the session and enabled kinds.
2. Server returns element-level view-models with signatures and source versions.
3. Frontend computes viewport-visible subset.
4. Frontend renders only visible/relevant overlays.
5. Detail appears on hover/selection or zoom threshold, not as all-element DOM.

## Anti-goals

- No Analytics IA redesign in this architecture lane.
- No fake rows for empty Properties sources.
- No Product Actions writes through registry reads.
- No BPMN XML writes from overlay display.
- No RAG/AI auto-apply.

## Validation expectations by future implementation phase

- Network proof that registry pages use server read APIs.
- Unit tests for API route construction and empty/error states.
- UI tests proving filter and pagination state survives server responses.
- Runtime proof for overlays that DOM node count is bounded and pan/zoom remains usable.

