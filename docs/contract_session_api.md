# Food Process Copilot — Session API Contract (Backend)

Base URL (local): `http://127.0.0.1:8011`

Conventions
- JSON requests: `Content-Type: application/json`
- JSON responses: `application/json`
- Some endpoints respond with HTTP `200` and `{ "error": "..." }` (instead of 4xx). Treat presence of `error` as a failure.

---

## Data models

### Session

```json
{
  "id": "a1b2c3d4e5",
  "title": "Сырники — базовый процесс",
  "roles": ["cook_1", "cook_2", "brigadir", "technolog"],
  "start_role": "cook_1",
  "notes": "сырье ...",
  "nodes": [/* Node[] */],
  "edges": [/* Edge[] */],
  "questions": [/* Question[] */],
  "mermaid": "...",
  "mermaid_simple": "...",
  "mermaid_lanes": "...",
  "normalized": {/* dict */},
  "resources": {/* dict */},
  "version": 12
}
```

### Node

```json
{
  "id": "n_10",
  "type": "step",
  "title": "Замесить тесто",
  "actor_role": "cook_1",
  "recipient_role": null,
  "equipment": ["миска", "весы"],
  "parameters": {"temp_c": 18, "_manual_title": true},
  "duration_min": 8,
  "qc": [],
  "exceptions": [],
  "disposition": {},
  "evidence": [],
  "confidence": 0.0
}
```

`type` values: `step | decision | fork | join | loss_event | timer | message`

### Edge

```json
{
  "from_id": "n_10",
  "to_id": "n_11",
  "when": "если тесто слишком жидкое" 
}
```

### Question

```json
{
  "id": "CRIT_missing_time_n_10",
  "node_id": "n_10",
  "issue_type": "MISSING",
  "question": "Сколько минут занимает замес?",
  "options": ["1-2", "3-5", "5-10"],
  "target": {"field": "duration_min", "transform": "minutes", "mode": "set"},
  "status": "open",
  "answer": null,
  "orphaned": false
}
```

`issue_type` values: `CRITICAL | MISSING | VARIANT | AMBIG | LOSS`

---

## Endpoints

### Health

- `GET /health` → `200` JSON

Response:
```json
{"ok": true}
```

---

### Sessions

#### Create
- `POST /api/sessions`

Request:
```json
{
  "title": "Процесс сырников",
  "roles": ["cook_1", "technolog"]
}
```

Response: full `Session` JSON.

#### List
- `GET /api/sessions?q=<optional>&limit=<optional>`

Response:
```json
{
  "items": [/* lightweight session summaries */],
  "count": 3
}
```

#### Get
- `GET /api/sessions/{session_id}` → full `Session` JSON

If not found:
```json
{"error": "not found"}
```

#### Update session (patch)
- `PATCH /api/sessions/{session_id}`

Request (any subset):
```json
{
  "title": "Новое имя",
  "roles": ["cook_1", "technolog"],
  "start_role": "cook_1",
  "nodes": [
    {"id": "n_10", "title": "Шаг 1", "type": "step", "actor_role": "cook_1"}
  ],
  "edges": [
    {"from_id": "n_10", "to_id": "n_11", "when": "далее"}
  ]
}
```

Response: full `Session` JSON (or `{ "error": "..." }`).

Notes:
- If `nodes` are provided without `edges`, the backend prunes edges that reference missing nodes.
- `start_role` (if set) must be one of `roles`.

#### Recompute derived fields
- `POST /api/sessions/{session_id}/recompute`

Rebuilds: questions, mermaid, normalized/resources, increments `version`.

---

### Notes / extraction

#### Update notes and run extraction
- `POST /api/sessions/{session_id}/notes`

Request:
```json
{"notes": "сырье... шаги..."}
```

Response: full `Session` JSON.

Notes:
- This endpoint triggers LLM extraction (`deepseek_client.extract_process`) and merges nodes with manual overrides.

---

### Questions (answering)

#### Answer one question
- `POST /api/sessions/{session_id}/answer`

Request:
```json
{
  "question_id": "...",
  "answer": "...",
  "node_id": "n_10"
}
```

Response: full `Session` JSON.

Alias:
- `POST /api/sessions/{session_id}/answers` (same payload, same behavior)

How answers are applied:
- The backend marks the question as `answered` and may patch a node field using `question.target` (e.g. `duration_min`, `parameters.*`, `disposition.*`, `actor_role`, `recipient_role`, `equipment`).
- When a field is manually edited via answers/node patch, the backend sets flags in `node.parameters`:
  - `_manual_title`, `_manual_type`, `_manual_actor`, `_manual_recipient`, `_manual_equipment`, `_manual_duration`, `_manual_parameters`, `_manual_disposition`

---

### Nodes

#### Patch a node
- `POST /api/sessions/{session_id}/nodes/{node_id}`

Request (partial):
```json
{
  "title": "Промесить тесто",
  "actor_role": "cook_1",
  "equipment": ["миска", "венчик"],
  "duration_min": 6,
  "parameters": {"temp_c": 18},
  "disposition": {"note": "..."}
}
```

Response: full `Session` JSON.

---



#### Create a node
- `POST /api/sessions/{session_id}/nodes`

Request:
```json
{
  "id": "n_10",
  "title": "Замесить тесто",
  "type": "step",
  "actor_role": "cook_1",
  "equipment": ["миска"],
  "duration_min": 8,
  "parameters": {"temp_c": 18},
  "disposition": {}
}
```

Notes:
- `id` is optional; if omitted, backend generates `n_<8hex>`.

Response: full `Session` JSON.

#### Delete a node
- `DELETE /api/sessions/{session_id}/nodes/{node_id}`

Notes:
- Also deletes all edges where `from_id==node_id` or `to_id==node_id`.

Response: full `Session` JSON.

---

### Edges

#### Create an edge
- `POST /api/sessions/{session_id}/edges`

Request:
```json
{"from_id":"n_10","to_id":"n_11","when":"если тесто жидкое"}
```

Response: full `Session` JSON.

#### Delete an edge
- `DELETE /api/sessions/{session_id}/edges`

Request:
```json
{"from_id":"n_10","to_id":"n_11","when":"если тесто жидкое"}
```

Response: full `Session` JSON.

---

### AI questions (optional)

- `POST /api/sessions/{session_id}/ai/questions`

Request:
```json
{"limit": 12, "mode": "strict"}
```

Response: full `Session` JSON with additional `questions` (id prefix `llm_...`).

Requires LLM settings (`/api/settings/llm`) to be configured.

---

### LLM settings

- `GET /api/settings/llm` → status JSON
- `POST /api/settings/llm`

Request:
```json
{"api_key": "...", "base_url": "..."}
```

---

### Glossary

- `POST /api/glossary/add`

Request:
```json
{"kind": "equipment", "term": "миска", "canon": "miska", "title": "Миска"}
```

---

## Export

### BPMN XML
- `GET /api/sessions/{session_id}/bpmn` → `200` `application/xml`

Notes:
- Export is minimal BPMN 2.0 XML intended to be importable by `bpmn-js`.

### Export directory (server-side)
- `GET /api/sessions/{session_id}/export` → JSON

Response:
```json
{"ok": true, "exported_to": "workspace/processes/<slug>_<id>"}
```

### Export ZIP
- `GET /api/sessions/{session_id}/export.zip` → `application/zip`

ZIP contains (at least):
- `process.yml`
- `process.bpmn`
- `diagram.mmd` / `diagram_simple.mmd` / `diagram_lanes.mmd`
- `glossary.yml`, `normalized.yml`, `resources.yml`
- `disposition.yml`, `losses.yml`

