# SAVE_TOUCHPOINT_MAP — матрица пересечений save-контуров с зоной layerManager + карта op-протокола

> Дата: 2026-09-16. База: `origin/main` @ `ae91569b`. Read-only аудит.

## Часть 1. Touchpoint-матрица (задача 5)

### Зона layerManager / canvas-миграции overlay (реальные пути)

| Файл | Путь |
|---|---|
| BpmnStage | `frontend/src/components/process/BpmnStage.jsx` |
| SaveCoordinator (хаб пайплайнов сохранения) | `frontend/src/features/session/saveCoordinator.js` |
| Runtime-wiring канваса | `frontend/src/features/process/bpmn/stage/orchestration/wireBpmnStageRuntimeEvents.js` |
| Overlay/decor-слой | `frontend/src/features/process/bpmn/stage/decor/decorManager.js` |

### Затрагиваемые файлы открытых save-контуров (по git diff их веток, не по отчётам)

**fix/save-pipeline-self-conflict-v1** (ветка `origin/fix/save-pipeline-self-conflict-v1` @ `7048b4c6`, контурный коммит поверх `99cb7a0e`; base в STATE.json `5552932a`):
- `frontend/src/features/session/saveCoordinator.js` (+19/−)
- `frontend/src/features/process/bpmn/persistence/createBpmnPersistence.js`
- `frontend/src/features/process/save/saveBpmnState.js`
- `backend/app/_legacy_main.py` (+9; 423 `SESSION_LOCK_BUSY` + `server_current_version`)
- `backend/tests/test_bpmn_put_redis_lock.py`
- (⚠️ `git diff 5552932a..branch` показывает также processman/agent-edit файлы — это ПРОМЕЖУТОЧНЫЙ коммит `99cb7a0e` «canvas edit highlight (#936)», уже в main; контурный коммит `7048b4c6` его не касается)

**fix/canvas-save-intent-single-lane-v1** (ветка `origin/fix/canvas-save-intent-single-lane-v1` @ `7a895eee`, merge-base с main `078a52e7`):
- `frontend/src/features/session/saveCoordinator.js` (+60/−, крупнейшая правка)
- `frontend/src/features/process/bpmn/coordinator/createBpmnCoordinator.js`
- `frontend/src/features/process/bpmn/persistence/createBpmnPersistence.js`

**Референс: feature/async-save-pipeline-step1** (уже в main, squash `aeca4fcb` / PR #982):
- `frontend/src/components/process/BpmnStage.jsx` (+82), `frontend/src/components/ProcessStage.jsx` (+36)
- `frontend/src/features/process/bpmn/runtime/createBpmnRuntime.js` (+194), `bpmn/stage/wiring/bpmnWiring.js`, `bpmn/coordinator/createBpmnCoordinator.js`, `createLocalMutationStaging.js`, `bpmn/stage/imperative/bpmnStageImperativeApi.js`
- `frontend/src/features/process/bpmn/save/opsOutbox/*` (новый каталог, 8 файлов)

### Матрица пересечений

| Файл зоны layerManager | self-conflict-v1 | canvas-save-intent-v1 | step1 (в main) |
|---|---|---|---|
| `BpmnStage.jsx` | — | — | **ДА** (+82) |
| `saveCoordinator.js` | **ДА** (+19/−) | **ДА** (+60/−) | — (через публичный API пайплайнов) |
| `wireBpmnStageRuntimeEvents.js` | — | — | — (косвенно через `bpmnWiring.js`, +23) |
| `decorManager.js` | — | — | — |

### Выводы по пересечениям

1. **Прямой конфликт слияний минимален**: ни один из двух открытых fix-контуров не трогает `BpmnStage.jsx`, `wireBpmnStageRuntimeEvents.js`, `decorManager.js`. Единственная общая точка — `saveCoordinator.js`.
2. **Конфликт по семантике — реален**: оба fix-контура меняют жизненный цикл flush'ей/таймаутов/ack внутри `saveCoordinator.js` (single-lane сериализация, keep-latest replay, timeout-reconciliation). Любая будущая layerManager-логика, инициирующая сохранение (canvas overlay → mutation → save), опирается на эти же инварианты. Порядок мержа этих двух веток важен: второй придётся ребазить по семантике, а не только по тексту.
3. **step1 уже изменил зону**: `BpmnStage.jsx` и runtime/wiring получили ops-хуки из main. layerManager-миграция overlay будет накладываться на step1-код с первого коммита.
4. Статусы: оба fix-контура `ready_for_review` (STATE.json, флаг READY_FOR_REVIEW), но **не влиты в main** (ветки существуют, merge-base старый). Их инварианты не являются частью baseline для step2/layerManager, пока не вмержены.

## Часть 2. Карта op-протокола (задача 6, текстовая, без кода)

### Envelope батча

`POST /api/sessions/{id}/operations`, body:
- `baseVersion` — int, опционально (null → резолвер из payload/заголовков); CAS-база.
- `operations` — список 1..200 op-объектов.

Ответы: 200 `{ok, session_id, version, applied, skipped}` (`version` — новый `diagram_state_version`, инкремент на батч); 409 detail `{code, client_base_version, server_current_version, server_last_write, server_current_xml}` (`_legacy_main.py:4831-4846`); 422 `OPERATION_UNSUPPORTED` с `opId/type/reason` и откатом батча; 423 `SESSION_LOCK_BUSY` (+ `server_current_version`).

### Поля op-объекта (wire-формат)

Общие обязательные: `opId` (uuid, идемпотентность по `session_applied_ops`), `type` (8 значений). Трассировочное: `source` (`user|agent|e2e|replay`, нормализуется `normalize_op_source`, `ops_applier.py:263-265`).

| type | Payload-поля (wire) |
|---|---|
| `element.updateProperties` | `elementId`, `properties` {name, …} — ключ `id` заблокирован → 422 (`ops_applier.py:284-287`) |
| `shape.move` | `elementId`, `delta` {x,y} **или** `bounds`/плоские x,y |
| `shape.resize` | `elementId`, `bounds` {x,y,width,height} **или** плоские `width`,`height` (+x,y опц.) |
| `shape.create` | `elementId`, `bpmnType`/`elementType`, `bounds` (x,y,width,height), опц. `parentId` (participant → processRef resolution), опц. `name` |
| `shape.delete` | `elementId` |
| `connection.create` | `elementId`, `elementType`, `waypoints` (≥2 точки, `_require_waypoints`), `sourceId`, `targetId` (`ops_applier.py:533-534`) |
| `connection.delete` | `elementId`/`connectionId` (алиасы) |
| `element.updateDi` | `elementId`, `waypoints`/`bounds` (wire-алиасы принимает) |

НЕ-wire (служебные, вырезаются `toWireOp` — `opsBatchSerializer.js`): `__ts`, `__committed`, `__coalesceCount`.

Схема `SessionOperationsIn` (`schemas/legacy_api.py:327`): `extra="allow"` — неизвестные поля op проходят валидацию; серверный applier их игнорирует (dispatch строго по `type`, неизвестный type → 422 `unsupported_op_type`).

### Куда ТЕХНИЧЕСКИ могло бы встать поле `layer` (as_is/to_be)

1. **Op-level envelope-поле** (напр. `"layer": "to_be"` рядом с `opId/type`) — проходит wire без правок валидации (`extra="allow"`), но для семантики потребует: dispatch/фильтрация в applier, хранение (колонка в `session_applied_ops` рядом с `source` либо оставить в payload), и маппинг на клиенте в `commandToOps.js`. Самое «чистое» место, т.к. не пересекается с bpmn-семантикой полей.
2. **Batch-level** (рядом с `baseVersion`) — если слой фиксирован на батч; ограничение: coalesce/rebase миксуют ops разных команд в один батч, батч-гранулярность может быть грубой.
3. **Внутри `properties`** (для `element.updateProperties`) — бесплатно уезжает на сервер как атрибут, но смешивает слой с BPMN-атрибутами элемента и не покрывает move/resize/create — не рекомендуется как единственный канал.
4. **Трассировочный sibling поля `source`** — паттерн уже существует (`source` нормализуется и пишется в applied_ops): поле `layer` можно провести по той же трубе (валидатор-список + колонка + `normalize_op_layer`).

Препятствия для любого варианта: серверный applier сейчас stateless относительно слоёв (один XML на сессию) — поле `layer` без server-side модели слоёв будет мёртвым грузом; CAS-версионирование (`baseVersion`) слой-агностично и это либо плюс (слой не ломает протокол), либо минус (конфликты между слоями не различимы в 409).
