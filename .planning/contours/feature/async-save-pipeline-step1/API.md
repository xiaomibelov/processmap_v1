# API.md — протокол POST /api/sessions/{id}/operations

Baseline: `origin/main` @ `b8285741`. Endpoint — новый, full-save `PUT /bpmn` не меняется.

## 1. Endpoint

```
POST /api/sessions/{session_id}/operations
Authorization: Bearer <JWT>
Content-Type: application/json
```

Обработчик — тонкий route в `backend/app/_legacy_main.py` (стиль существующих session routes), логика — новый модуль `backend/app/save_services/ops_applier.py` (не расширяем god-файл; см. save-decomposition-v1).

## 2. Схемы

### Request — `SessionOperationsIn` (`backend/app/schemas/legacy_api.py`)

```json
{
  "baseVersion": 42,
  "operations": [
    { "opId": "8f6b2c4e-...", "type": "element.updateProperties",
      "elementId": "Activity_1", "properties": { "name": "Новое имя" } },
    { "opId": "1a9d3f...", "type": "shape.move",
      "elementId": "Activity_1", "x": 240, "y": 180 },
    { "opId": "77aa01...", "type": "shape.create",
      "elementId": "Activity_new", "bpmnType": "bpmn:Task",
      "x": 300, "y": 200, "width": 100, "height": 80, "parentId": "Process_1" },
    { "opId": "c0ffee...", "type": "connection.create",
      "connectionId": "Flow_new", "bpmnType": "bpmn:SequenceFlow",
      "sourceId": "Activity_1", "targetId": "Activity_new",
      "waypoints": [[200,140],[300,140]] },
    { "opId": "b1b1b1...", "type": "shape.delete", "elementId": "Activity_old" }
  ]
}
```

Поля:
- `baseVersion: int` — обязательное. Клиентский CAS base = `diagram_state_version`, известный на момент последнего ack (resolve at send time через `casVersionTracker`). Допускается header `x-base-diagram-state-version` / `If-Match` как в `_resolve_base_diagram_state_version` (`backend/app/utils/session_helpers.py:58-89`) — route использует тот же резолвер.
- `operations: []` — 1..200 ops. Каждая op: `opId` (uuid, обяз.), `type` (обяз.), payload по типу. Определение порядка внутри батча — порядок массива; применяется последовательно.

### Response 200

```json
{ "ok": true, "session_id": "...", "version": 43, "applied": 5, "skipped": 0 }
```

- `version` — новый `diagram_state_version` (на батч один инкремент). Если ВСЕ `opId` батча уже применены (повторная доставка): `200 { version: <current>, applied: 0, skipped: n }`, инкремента нет.

### Response 409

```json
{
  "code": "DIAGRAM_STATE_CONFLICT",
  "session_id": "...",
  "client_base_version": 42,
  "server_current_version": 47,
  "server_current_xml": "<definitions ...>...</definitions>"
}
```

- Формат полей — зеркало существующего `_conflict_payload` (`session_helpers.py:118-132`) плюс `server_current_xml`. Payload большой (до ~745 kB) — осознанно: 409-путь редкий, клиенту нужен актуальный документ для rebase. Аналогично existing conflict payload содержит `server_last_write`.

### Остальные ошибки

- `409 DIAGRAM_STATE_BASE_VERSION_REQUIRED` — нет baseVersion (reuse `_require_diagram_cas_or_409`).
- `409 SESSION_WRITE_CONFLICT` — SQL unique race (reuse storage layer).
- `423 SESSION_LOCK_BUSY` — Redis lock 15 s (`acquire_session_lock`), reuse.
- `422 OPERATION_UNSUPPORTED { opId, type, reason }` — op не из whitelist / payload невалиден / применение к текущему XML не удалось. **Весь батч откатывается.**
- `404 SESSION_NOT_FOUND`.

## 3. Серверная обработка (порядок, одна транзакция)

1. Auth + workspace edit permission (как в `session_bpmn_save`).
2. `acquire_session_lock(session_id, ttl_ms=15000)` → 423 при занятости.
3. Загрузка сессии; `_require_diagram_cas_or_409(baseVersion)` (in-memory guard + conflict payload).
4. Фильтрация идемпотентности: `SELECT op_id FROM session_applied_ops WHERE session_id=? AND op_id IN (...)`; уже применённые ops — skip (сохраняя порядок остальных). Если все — fast-path 200 без инкремента.
5. Parse текущего `bpmn_xml` → ElementTree (один parse на батч; parse-once derivatives пересчитываются один раз после мутации).
6. Последовательный apply оставшихся ops через `ops_applier` (whitelist-валидация pydantic-typed payload per type). Любая ошибка → raise → весь батч откатывается → 422.
7. Re-serialize XML (без pretty-format, сохранение namespace-префиксов документа).
8. `_mark_diagram_truth_write` (bump `diagram_state_version`, `diagram_last_write_*`), `updated_at = now`.
9. `storage.save(s, expected_diagram_state_version=base)` (SQL CAS → 409 при race, reuse).
10. В той же транзакции: insert в `session_applied_ops` для каждого применённого op; trace-строка в `session_state_versions` (как в `compat/repository.py:5593-5629`, payload_hash = hash батча); `bpmn_versions` snapshot только при net XML change.
11. Parent subprocess re-embed — best-effort, как в `session_bpmn_save:4743-4786` (применяется к новому XML).
12. Release lock, RAG reindex enqueue (существующий post-save hook).

## 4. Идемпотентность — таблица `session_applied_ops`

DDL через тот же compat `_ensure_schema` путь, что и прочие sessions-колонки (`compat/repository.py`):

```sql
CREATE TABLE IF NOT EXISTS session_applied_ops (
  session_id TEXT NOT NULL,
  op_id TEXT NOT NULL,
  applied_version INTEGER NOT NULL,
  applied_at INTEGER NOT NULL,
  PRIMARY KEY (session_id, op_id)
);
CREATE INDEX IF NOT EXISTS idx_session_applied_ops_cleanup ON session_applied_ops(applied_at);
```

- Вставка — в транзакции apply (п.10). Retry после commit-fail невозможен частично: либо весь батч + строки есть, либо нет.
- Cleanup: retention-удаление записей старше N дней фоновой задачей/лениво при flush (N=7, деталь реализации; не блокирует протокол).
- Не alembic-миграция в step1: compat-DDL стиль (как `diagram_state_version` колонка, idempotent ensure). Отдельный alembic-вариант — open question, если потребует ревьюер.

## 5. Whitelist op-типов step1

| type | payload | Серверное применение |
|---|---|---|
| `element.updateProperties` | `elementId`, `properties{...}` | attrs семантического элемента (name, documentation и пр. plain attrs) |
| `shape.move` | `elementId`, `x`, `y` | DI bounds (все DI-фигуры элемента) |
| `shape.resize` | `elementId`, `width`, `height`, `x?`, `y?` | DI bounds |
| `shape.create` | `elementId`, `bpmnType`, `x,y,width,height`, `parentId` | семантика + DI + вставка в parent |
| `shape.delete` | `elementId` | удаление семантики + DI + инцидентных connection (bpmn-js semantics) |
| `connection.create` | `connectionId`, `bpmnType`, `sourceId`, `targetId`, `waypoints` | семантика + DI edge + DI waypoints |
| `connection.delete` | `connectionId` | удаление семантики + DI |
| `element.updateDi` | `elementId`, `waypoints?` | DI-only правка (label position и пр.) |

Всё, что вне whitelist на клиенте, не становится op — уходит в full-save flush (см. UI.md §4).

## 6. OpenAPI

- Регенерация `./scripts/update_openapi.sh` → `0 errors`, коммит `docs/openapi.yaml` (blocking rule §6.1).
- Не breaking: существующие эндпоинты не меняются. Маркер `BREAKING-API-OK` не нужен.
