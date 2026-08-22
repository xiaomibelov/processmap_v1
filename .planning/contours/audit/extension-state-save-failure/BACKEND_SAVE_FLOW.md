# BACKEND_SAVE_FLOW.md — BPMN extension-state / properties save

## Endpoint

Свойства не имеют отдельного endpoint. Они сохраняются через общий маршрут:

```
PUT /api/sessions/{session_id}/bpmn
```

**Router:** `backend/app/routers/sessions.py:179`
**Handler:** `backend/app/_legacy_main.py:7419` — `session_bpmn_save`

## Request model

`backend/app/schemas/legacy_api.py`:

```python
class BpmnXmlIn(BaseModel):
    xml: str = ""
    bpmn_meta: Optional[Dict[str, Any]] = None
    source_action: Optional[str] = None
    import_note: Optional[str] = None
    base_diagram_state_version: Optional[int] = None
    base_bpmn_xml_version: Optional[int] = None
    rev: Optional[int] = None
```

## Handler flow

```python
def session_bpmn_save(session_id: str, inp: BpmnXmlIn, request: Request = None) -> Dict[str, Any]:
    # 1. auth + workspace edit permission
    # 2. acquire Redis lock (15s)
    # 3. _require_diagram_cas_or_409  <- optimistic locking
    # 4. merge incoming bpmn_meta with current bpmn_meta
    # 5. replace bpmn_xml
    # 6. bump diagram_state_version
    # 7. st.save(s)
    # 8. create bpmn version snapshot
    # 9. release lock
```

## Где именно сохраняются properties

Свойства попадают в `sessions.bpmn_meta_json` под ключом `camunda_extensions_by_element_id`:

```python
# backend/app/_legacy_main.py::session_bpmn_save
raw_bpmn_meta = {
    **current_meta,
    **incoming_meta,
    ...
    "camunda_extensions_by_element_id": incoming_meta.get(
        "camunda_extensions_by_element_id",
        current_meta.get("camunda_extensions_by_element_id", {}),
    ),
    ...
}
```

Схема БД (`backend/app/storage.py`):

```sql
CREATE TABLE IF NOT EXISTS sessions (
  ...
  bpmn_xml TEXT NOT NULL DEFAULT '',
  bpmn_xml_version INTEGER NOT NULL DEFAULT 0,
  diagram_state_version INTEGER NOT NULL DEFAULT 0,
  bpmn_meta_json TEXT NOT NULL DEFAULT '{}',
  ...
);
```

## Валидация / нормализация

`_normalize_bpmn_meta` (`backend/app/_legacy_main.py:3006`) фильтрует `flow_meta` и `node_path_meta` по актуальным ID из XML, но **не фильтрует `camunda_extensions_by_element_id`** — он проходит как unknown key:

```python
for key_raw, value_raw in raw.items():
    key = str(key_raw or "").strip()
    if not key or key in out or key == "auto_pass_v1":
        continue
    out[key] = json.loads(json.dumps(value_raw, ensure_ascii=False))
```

Это значит, backend сохраняет ровно то, что прислал frontend (если пройдёт CAS).

## Optimistic locking

```python
# backend/app/utils/session_helpers.py::_require_diagram_cas_or_409
current_version = int(getattr(sess, "diagram_state_version", 0) or 0)
if client_base_version is None or int(client_base_version) != current_version:
    raise HTTPException(status_code=409, detail=...)
```

```python
# backend/app/utils/session_helpers.py::_mark_diagram_truth_write
next_version = max(0, current_version) + 1
sess.diagram_state_version = next_version
```

## Distributed lock

```python
# backend/app/_legacy_main.py::session_bpmn_save
lock = acquire_session_lock(session_id, ttl_ms=15000)
if not lock.acquired:
    raise HTTPException(status_code=423, detail="Session is being updated, retry")
```

## Возможные HTTP-ответы

| Статус | Когда | Тело ответа |
|---|---|---|
| 200 | Успех | `{ ok: True, version, diagram_state_version, ... }` |
| 400 | Пустой XML / validation | `{ error: "xml is empty" }` |
| 409 | CAS conflict | `{ code: "DIAGRAM_STATE_CONFLICT", client_base_version, server_current_version, server_last_write }` |
| 409 | Missing base version | `{ code: "DIAGRAM_STATE_BASE_VERSION_REQUIRED" }` |
| 423 | Redis lock не получен | `{ detail: "Session is being updated, retry" }` |
| 403 | Нет прав на workspace | `{ detail: "forbidden" }` |
| 500 | Внутренняя ошибка | traceback в логах |

## Связь с другими endpoint'ами

- `PATCH /api/sessions/{id}` (`_legacy_main.py:4065`) — тоже может сохранить `bpmn_meta` целиком, но property panel его не использует.
- `PATCH /api/sessions/{id}/bpmn_meta` (`_legacy_main.py:6889`) — **не сохраняет** `camunda_extensions_by_element_id`; только flow tiers / robot / hybrid / drawio.
- `POST /api/sessions/{id}/nodes/{node_id}` — сохраняет `equipment`/`parameters` в `nodes_json`, не связан с Camunda properties.

## Где искать логи

- `backend/logs/` — traceback при 500, warnings parent sync.
- `backend/app/redis_lock.py` — acquire/release warnings.
- `backend/app/cache/session_cache.py` — normalization warnings.
- Frontend Network tab — status, response body, request payload.
