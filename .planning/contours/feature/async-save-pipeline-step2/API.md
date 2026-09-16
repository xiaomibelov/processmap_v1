# API.md — feature/async-save-pipeline-step2 (backend-контракт)

> Дата: 2026-09-16. Baseline: `origin/main @ 999f0e37`. PLAN.md — источник scope.

## 1. `ops_committed` — событие шины

SSE-канал существует: `GET /api/sessions/{session_id}/events` (`routers/session_events.py:58`), in-process шина `services/session_event_bus.py`. Добавляется событие:

```
event: ops_committed
data: {
  "session_id": str,
  "version": int,            # diagram_state_version после коммита
  "operations": [wire-op],   # для full-save пути — []
  "actor_client_id": str,    # clientId автора (presence clientId); "" если неизвестен
  "full": bool,              # true если источник — PUT /bpmn (full save)
  "at": float                # epoch seconds
}
```

- **Publisher**: `session_operations_apply` — после успешного commit (после `_save_session_with_cas`), payload = применённые wire-ops (без служебных `__*`), actor = `actor_client_id` из payload сессии если есть, иначе "". Full-save: `session_bpmn_save` — после успешного commit, `operations=[]`, `full=true`.
- **Публикация НЕ блокирует ответ**: `publish_nowait` (sync-safe). Ошибки публикации — лог, не 5xx.
- Порядок: событие публикуется только после durable commit; при rollback батча — не публикуется.

## 2. Redis pub/sub fan-in (multi-worker)

`WEB_CONCURRENCY=2` ⇒ in-process шина не достаёт до подписчиков на соседнем worker'е.

- Канал: `pm:session-events`, сообщение: JSON `{session_id, event, data}`.
- `SessionEventBus.publish/publish_nowait`: писать локальные очереди + `redis publish` (best-effort; Redis недоступен → пропуск без ошибки, degraded-доставка).
- `session_events.py` (SSE-стрим): при старте подписки — `redis pubsub subscribe` на канал; входящие сообщения релеить в локальный bus. Отписка при закрытии стрима. Redis down → только in-process (текущее поведение).
- Redis client: `redis_client.py` (существующий); НЕ вводить новый клиент/зависимость. Если у текущего клиента нет publish/pubsub-методов — добавить тонкие обёртки там же.

## 3. Идемпотентность доставки

Сервер не дедуплицирует события между subscriber'ами: opId-дедупликация (`session_applied_ops`) — на write-пути. Клиент фильтрует собственные ops по `actor_client_id` и/или opId (контракт UI.md §4). Повторные доставки (redis relay + local) безопасны.

## 4. Presence: soft-lock поле

`SessionPresenceTouchIn` (schemas) + touch-handler (`sessions_core.py:711-796`):

- Новое опциональное поле `editingElementId: str | None` (max 64 chars, валидируется как bpmn id — `[A-Za-z0-9_:\-.]+`, пустая строка = снятие).
- `active_users[]` в touch-ответе: добавить `editingElementId` на user-entry (null если нет).
- Хранение: колонка в `session_presence` (code-ensured `_ensure_schema`, как у соседних колонок) + `touch`/`list` обновлены; TTL существующий (60 s) распространяется на поле автоматически.
- **Advisory only**: никакой проверки/блокировки на write-путях. Нарушение формата → 422 валидация (не 500).
- `DELETE /presence` (leave) снимает поле вместе со строкой (существующее поведение).

⇒ **Регенерация `docs/openapi.yaml`** через `./scripts/update_openapi.sh` (redocly 0 errors; AGENTS.md §6.1). BREAKING-нет (аддитивно).

## 5. Наследие step1 (backend-часть)

1. **Двойная регистрация роута**: удалить `@app.post(.../operations)`-дубль в `_legacy_main.py` (оставить `routers/sessions.py:243`); убедиться, что `LEGACY_ROUTE_EXPORT` этот путь не экспортирует; `session_service.operations_apply` продолжает звать `_lm.session_operations_apply` (handler-функция остаётся, удаляется только декоратор-дубль).
2. **Org-explicit conflict reload в `_save_session_with_cas`** (`session_helpers.py:281`): reload с явным `org_id` (паттерн #989: `sess` как fallback, `org_id` первичный источник). Регрессионный тест по образцу `test_conflict_includes_server_xml_for_non_default_org`.
3. **Parent re-embed ordering** (operations-handler, `_legacy_main.py:~4995-5033`): parent subprocess re-embed — **после** `_save_session_with_cas` commit child. При ошибке re-embed: изолированный retry (celery task `processmap.overlay...`-стиль не вводим — inline retry с экспоненциальным бэкофом 3 попытки + лог WARN), child-коммит НЕ откатывается. Ответ сохраняет `parent_synced` (false при неудаче re-embed после успешного child). PUT /bpmn не меняется.
4. **Applier: `connection.reconnect`** (`save_services/ops_applier.py`): op `{opId, type:"connection.reconnect", connectionId|elementId, source, target}`. Применение: rewrite `sourceRef`/`targetRef` элемента, перелинковка `incoming`/`outgoing` у старых и новых source/target, обновление DI-edge (waypoints остаются — DI-only миграция краёв). Валидация: source/target существуют в XML; иначе `OperationApplyError` → 422 batch-rollback. Rules-движок bpmn-js НЕ дублируется (зафиксированное отступление, PLAN §3.6).
5. **Applier: client-generated id для create**: `shape.create`/`connection.create` принимают опциональный `id`; при наличии — элемент создаётся с этим id (без регенерации); replay create при 409-rebase становится безопасным. Без `id` — текущее поведение (генерация). Коллизия id в XML → `OperationApplyError` → 422.
6. **Cleanup**: dead keepalive-код — frontend-часть (UI.md §6); backend следов не имеет (подтверждено grep'ом).

## 6. Отступления от step1-контракта

- API.md step1 §3: порядок шагов приведён к факту (re-embed после commit) — документируется здесь, отдельной правки API.md step1 не требуется (читается в паре).
- Формат 200 `/operations` не меняется. 409 payload не меняется. SSE-фрейм `ops_committed` — новое событие того же стрима (клиенты step1 его просто не обрабатывают — обратная совместимость сохранена).

## 7. Тесты (backend)

Матрица в TESTS.md §2. Прогон: `pytest` в изолированном окружении (docker python:3.11-slim или venv, requirements из backend/requirements.txt), БД — temp SQLite/Postgres по образцу `backend/tests/test_session_operations_api.py`. Стек `processmap_v1` (docker) — не пересоздавать; env-lock при любом его mutate.
