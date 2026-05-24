# Frontend/backend responsibility split

## Current direction

Analytics should move from client-heavy orchestration toward server-prepared analytics view models. This must be gradual: first UI/IA and source-truth mapping, then bounded server APIs.

## Keep frontend-local now

| Responsibility | Reason |
|---|---|
| Visual hierarchy and layout | UI concern |
| Scope selector interaction | Client state and route context |
| Lightweight client filters | Fast local UX for current page data |
| Expand/collapse row state | Pure interaction state |
| Read-only AI panel visibility | UI state |
| Empty/loading/error presentation | UI concern |

## Move server-side later

| Responsibility | Target phase | Reason |
|---|---:|---|
| Registry aggregation | Phase 3 | Avoid recomputing heavy summaries on client |
| Row shaping/view models | Phase 3 | Stable contracts for actions/properties registries |
| Pagination/sorting/filtering for large datasets | Phase 3 | Performance and correctness |
| Source/session summaries | Phase 3 | Durable and consistent source truth |
| Export preparation | Phase 3 | Avoid client-only export logic and support reproducibility |
| AI batch context preparation | Phase 4 | Keep RAG inputs structured and controlled |
| Dashboard aggregate endpoints | Phase 5 | Dashboards need stable aggregate APIs |

## API strategy

Proposed future endpoints are hypotheses until backend review:
- `GET /api/analytics/actions-registry?...`
- `GET /api/analytics/properties-registry?...`
- `GET /api/analytics/sources-summary?...`
- `POST /api/analytics/exports/prepare`
- `GET /api/analytics/dashboards/...`

These should return view models, not raw frontend reconstruction tasks.

## Migration plan

1. Phase 1: keep existing data flow; refactor presentation only.
2. Phase 2: define properties registry source-truth and minimal read-only data shape.
3. Phase 3: add server-side aggregation/export contour with API contracts and tests.
4. Phase 4: use server-prepared context for AI/RAG suggestions.
5. Phase 5: build dashboards on server aggregate endpoints.

## Risk controls

- No backend promise without separate implementation contour.
- No schema migration in architecture contour.
- No frontend/server split that changes durable truth silently.
- No AI/RAG layer as source of record.
