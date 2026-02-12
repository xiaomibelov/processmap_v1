# Session API contract (frontend bridge)

Frontend dev: http://localhost:5174

All frontend requests go to `/api/*` with `credentials: "include"` (cookie session).
CORS must allow origin `http://localhost:5174` and `allow-credentials: true`.

## Required endpoints

Note: `GET /api/meta` exposes feature flags; as of Epic #1 it also includes `features.projects=true`.

- `GET /api/meta` -> `200 application/json`
- `GET /api/sessions` -> `{ items: SessionListItem[], count: number }`
- `POST /api/sessions` -> `Session`
- `GET /api/sessions/{id}` -> `Session`
- `PATCH /api/sessions/{id}` -> `Session` (accepts partial OR full session-shape; ignores unknown/derived fields)
- `PUT /api/sessions/{id}` -> `Session` (replace whole session; frontend fallback if PATCH is not supported)
- `GET /api/sessions/{id}/bpmn` -> `application/xml` (bpmn-js viewer)

### Session shape (what frontend can store)

Core fields the backend accepts:

- `title: string`
- `roles: string[] | object[]`  
  Accepted forms:
  - `["cook_1", "technolog"]`
  - `[{role_id:"cook_1", label:"Повар 1"}, ...]` (also keys: `roleId`, `id`, `value`, `name`, `key`)  
  Backend normalizes to `string[]`.

- `start_role: string | null`  
  Must be one of `roles` when roles are set.

- `notes: object[] | string`  
  Frontend preferred: `[{note_id, ts, author, text}]`.  
  Backend stores internally as string but API always returns list.
  Legacy string notes are exposed as:
  `[{note_id:"legacy", ts:null, author:null, text:"..."}]`

- `nodes: object[]`
  - id: `id` OR `node_id` OR `nodeId`
  - title: `title` OR `label` OR `name`
  - actor_role: `actor_role` OR `actorRole`
  - recipient_role: `recipient_role` OR `recipientRole`

- `edges: object[]`
  - from: `from_id` OR `from` OR `source_id` OR `sourceId`
  - to: `to_id` OR `to` OR `target_id` OR `targetId`

- `questions: object[]` (optional)
  - `question` OR `text`
  - `node_id` OR `nodeId`

Derived fields (`mermaid*`, `normalized`, `resources`, `version`) may be ignored and recomputed by the backend.

## Minimal frontend flow

1) `POST /api/sessions` -> get `{id}`  
2) Use that `{id}` everywhere (avoid `local_*` ids).  
3) On graph edits: `PATCH /api/sessions/{id}` (or `PUT` fallback) -> then reload BPMN: `GET /api/sessions/{id}/bpmn`.
