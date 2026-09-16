# TESTS — fix/tobe-element-provenance-persistence-v1

> Все прогоны — изолированные docker-раннеры (общий стек `processmap_v1-*` не
> пересоздавался и не рестартовался). Backend: образ `processmap_v1-api` +
> `pip install pytest==9.1.1 httpx==0.27.2 fakeredis`, монтировка
> `backend/` ворктри; SQLite-режим через env (PROCESS_DB_PATH и т.п.),
> Postgres/Redis на хосте не поднимались. Frontend: `node:20-alpine`,
> `npm ci` в named volume `provtest-fe-node-modules`.

## 1. unit: запись/чтение pm:derived_from (фронт)

Команда (в `frontend/`):
```
docker run --rm -v "$PWD:/app" -v provtest-fe-node-modules:/app/node_modules -w /app \
  node:20-alpine node --test src/features/technologist/workspace/tobeProvenance.test.mjs
```
Результат: **9 passed / 0 failed** (TDD: RED — ERR_MODULE_NOT_FOUND до реализации;
GREEN — 9/9 после).

Покрыто: инверсия trace_map; consolidated N→1 (Task_a ← [AsIs_1, AsIs_2]);
removed (draft_node_ids=[]) не создаёт TO BE-записи; sidecar-снапшот;
embed пишет pm:Trace + массив pm:derived_from + fate/rule_id; существующие
extensionElements (camunda:properties) не затираются; идемпотентность;
extract; round-trip.

## 2. round-trip (интеграционный, фронт)

Тест `round-trip: embed -> правка в моделлере -> save/reload -> provenance цел
у 100% элементов` в том же файле — **pass**.

Сценарий: embed в XML → bpmn-moddle fromXML (загрузка, как в bpmn-js) → rename
задачи → toXML (saveXML) → повторный parse (reload) → extract →
`ROUND_TRIP_100_PERCENT = true` (2/2 элемента с derived_from, fate совпали,
правка имени сохранилась). Доказательство см. WORKER_REPORT.md §Round-trip.

**Ограничение (зафиксировано):** полноценный e2e через браузерный bpmn-js
(реальный modeler + saveCoordinator + backend) в контуре не прогонялся — в
изолированном раннере нет браузерного окружения; round-trip доказан на уровне
bpmn-moddle (тот же движок сериализации XML, что использует bpmn-js saveXML)
+ unit/jsdom-совместимых тестах. Проверка в живом рантайме — зона ответственности
Agent 3 (Reviewer) по регламенту контура.

## 3. api: sidecar create/meta (backend)

Команда (в корне ворктри):
```
docker run --rm -v "$PWD/backend:/app/backend" -w /app/backend processmap_v1-api \
  sh -c "pip install -q pytest==9.1.1 httpx==0.27.2 fakeredis; \
         python -m pytest tests/test_tobe_provenance_sidecar.py -q"
```
Результат: **6 passed / 0 failed** (TDD: RED — 4 failed/2 passed до реализации;
GREEN — 6/6 после).

Покрыто: create персистит bpmn_meta.provenance в bpmn_meta_json (removed-элемент
цел); W4-поля не сломаны; create без bpmn_meta — пустая meta; 422 на
несериализуемый bpmn_meta; GET /sessions/{id}/meta отдаёт provenance;
meta без sidecar → provenance=null; explorer-путь create.

## 4. no-regression

### 4.1 Схема op-протокола не изменена (снапшот-сравнение)

`git diff origin/main...HEAD -- backend/app/_legacy_main.py backend/app/routers/sessions.py backend/app/schemas/legacy_api.py`
→ **пусто** (exit 0). saveCoordinator.js не изменён.

### 4.2 Backend save-сьют (-k save)

- Контур: `6 failed, 59 passed, 34 skipped, 2 errors` (15m47s)
- origin/main (baseline, те же условия): `6 failed, 59 passed, 34 skipped, 2 errors` (16m05s)

Множества падений идентичны (agent_analysis ×2, bpmn_save_rbac_scope ×2,
dead_session ×1, session_meta_endpoint ×1; errors — precheck psycopg, требует
Postgres). **Новых падений нет.** Базовые числа брифа (71 passed) получены в
эталонном окружении с поднятыми сервисами; в изолированном раннере часть тестов
skipped/env-failed одинаково на main и ветке.

### 4.3 Backend persistence-сьют (-k persist)

- Контур: `3 failed, 22 passed` (2 из passed — новые тесты контура)
- origin/main (baseline): `3 failed, 20 passed`

Падения идентичны (agent_analysis ×2 — файл целиком 16 failed на обоих деревьях;
rag_hybrid ×1 — в изоляции файл 8/8 passed на обоих деревьях, падение
порядок-зависимое в составе сьюта). **Новых падений нет.**

### 4.4 Frontend

- Новые тесты: 9/9 (см. §1).
- Полный `npm test` (`node --test` по всем *.test.mjs): 3764 тестов, 82 failed —
  подмножество предсуществующих env-падений (vitest-стиль файлов под node --test,
  флаки порядка). Точечная сверка подозрительных файлов (App.leave-navigation-guard,
  sessionPresenceModel, stepStates, overlay, WorkspacePanel) — падают
  **идентично на origin/main**. Файлы контура в падениях отсутствуют.
- Сборка: `npm run build` — ✓ built in 21.29s, exit 0.

### 4.5 OpenAPI

Дельта спеки — только `bpmn_meta` в `CreateSessionBody`; `docs/openapi.yaml`
регенерирован через `scripts/dump_openapi.py`; `npx @redocly/cli lint` →
«Your API description is valid» (0 errors). spec-drift пройдёт.
