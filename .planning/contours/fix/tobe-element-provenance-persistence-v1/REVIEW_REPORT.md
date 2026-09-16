# REVIEW_REPORT — fix/tobe-element-provenance-persistence-v1

> Agent 3 (Reviewer), независимое ревью. Дата: 2026-09-16.
> Принцип: отчёты исполнителя не доверяем — каждый пункт перепроверен самостоятельно.

## Вердикт

**PASS_WITH_NITS** — блокеров нет, мажоров нет, ниты не блокируют merge.
Доработка исполнителю не требуется; ниты — по усмотрению (косметика/observations).

## 1. Runtime/source truth (зафиксировано самим ревьюером)

```
pwd: /Users/mac/agents_place/kimi_PM/p0-work-worktrees/fix-tobe-element-provenance-persistence-v1
git remote -v: origin git@github.com:xiaomibelov/processmap_v1.git (+ graphify, не используется)
git branch --show-current: fix/tobe-element-provenance-persistence-v1
git rev-parse HEAD: 8d74bfb096e5c18dcf72caf793ead29004acd466
git rev-parse origin/main: 999f0e37c8138a736373550b9c978108424ac74c
git status -sb: ## fix/tobe-element-provenance-persistence-v1...origin/fix/tobe-element-provenance-persistence-v1 (чисто)
git diff --stat origin/main...HEAD: 17 файлов, +1105/-3 (продуктовый код:
  backend/app/projects.py +26, backend/app/routers/explorer.py +13/-3,
  backend/app/services/session_service.py +4, frontend App.jsx +22/-2,
  Workspace.jsx +3, pmModdleDescriptor.js +23, tobeProvenance.js NEW +145,
  тесты: backend +206, frontend +132; docs/openapi.yaml +4; артефакты контура)
```

HEAD (8d74bfb0) ≠ head из WORKER_REPORT/STATE.json (dc19f039) — ветка
продвинулась коммитами артефактов контура после отчёта исполнителя; продуктовый
diff тот же по сути, base совпадает (999f0e37).

## 2. Runtime-proof (5-plane, serving mode)

- `curl -sSI http://localhost:5177` → **HTTP 200**, `Cache-Control: no-cache, no-store, must-revalidate`, `Pragma: no-cache`, `Expires: 0` — заголовки no-cache на месте.
- `curl http://localhost:8011/api/health` → `{"ok":true,...,"api":"ready"}`; статус `degraded` по причине миграций БД общего стека (alembic 034 vs head 036) — **дрейф общего стека, к контуру отношения не имеет**.
- **Serving mode ≠ intended (зафиксировано как ограничение):** общий стек `processmap_v1-*` serve-ит код **main**, не ветку контура. Доказательство: `docker exec processmap_v1-api-1 ls /app/backend/tests/test_tobe_provenance_sidecar.py` → No such file; `pmModdleDescriptor.js` в контейнере отсутствует. Ветка верифицировалась изолированными docker-раннерами (см. §3–§5) + живым прогоном канала 1 через API общего стека (§6), что допустимо, т.к. канал 1 (XML as-is) агностичен версии backend-ветки.

## 3. Независимые прогоны тестов контура (факт, не цитата)

| Сьют | Команда | Результат ревьюера |
|---|---|---|
| Frontend tobeProvenance.test.mjs | `docker run --rm -v "$PWD:/app" -v provtest-fe-node-modules:/app/node_modules -w /app node:20-alpine node --test src/features/technologist/workspace/tobeProvenance.test.mjs` (из `frontend/`) | **9 passed, 0 failed** — совпадает с ожиданием 9 |
| Backend test_tobe_provenance_sidecar.py | `docker run --rm -v "$PWD/backend:/app/backend" -w /app/backend processmap_v1-api sh -c "pip install -q pytest==9.1.1 httpx==0.27.2 fakeredis; python -m pytest tests/test_tobe_provenance_sidecar.py -q"` | **6 passed, 0 failed** — совпадает с ожиданием 6 |

Оба прогона выполнены ревьюером самостоятельно; заявленные числа исполнителя подтверждены.

## 4. No-regression (независимый прогон, baseline origin/main в /tmp/pm-main-baseline, detached 999f0e37)

Особенность раннера: полные сьюты требуют запуска из `/app` (`python -m pytest backend/tests -k ...`),
т.к. 34 тест-файла импортируют `backend.app...` (namespace-пакет с /app), а 197 — `app...`;
запуск с `-w /app/backend` даёт 96 ошибок коллекции на ОБОИХ деревьях (не является
регрессией контура — артефакт изоляции).

| Сьют | Ветка контура | origin/main (999f0e37) | Вывод |
|---|---|---|---|
| `-k persist` | 3 failed, **22 passed** (1833 deselected) | 3 failed, **20 passed** (1829 deselected) | Падения поимённо идентичны: `test_agent_analysis_pipeline::TestProcessor::test_failed_llm_persists_failed_artifact`, `...::test_run_persists_done_artifact`, `test_rag_hybrid_api::...::test_admin_patch_whitelists_new_fields_and_persists`. +2 passed на ветке = 2 новых теста контура. Новых падений нет |
| `-k save` | 6 failed, **59 passed**, 34 skipped, 2 errors (986s) | 6 failed, **59 passed**, 34 skipped, 2 errors (987s) | Падения поимённо идентичны: `agent_analysis_pipeline::TestSaveHook::{test_patch_session_schedules_analysis, test_publish_failure_does_not_break_save}`, `bpmn_save_rbac_scope::{test_editor_can_export_bpmn_for_project_session, test_org_admin_cannot_write_foreign_org_session}`, `dead_session::test_existing_session_fresh_base_still_saves`, `session_meta_endpoint::test_meta_endpoint_returns_property_save_response`; errors — `precheck` psycopg (требует Postgres). Новых падений нет |

Сравнение падений выполнено ревьюером по фактическим логам всех четырёх прогонов.
Заявленные исполнителем числа (save 6f/59p/34s/2e, persist 3f/22p vs 3f/20p)
подтверждены ревьюером независимо.

## 5. Код-ревью diff'а (origin/main...HEAD)

### Жёсткие запреты — соблюдены

- `git diff origin/main...HEAD -- backend/app/_legacy_main.py backend/app/routers/sessions.py backend/app/schemas/legacy_api.py` → **пусто** (exit 0) — op-протокол `/operations` не тронут, проверено ревьюером.
- saveCoordinator.js, canvas/рендер, overlay UI, diff-логика — в diff отсутствуют (`git diff --name-only | grep -E 'saveCoordinator|canvas|overlay'` → none).

### Канал 1 — pm:Trace embed

- `pmModdleDescriptor.js:25-47`: тип `pm:Trace` (superClass Element) в существующем pm namespace (`http://processmap.ai/schema/bpmn/1.0`), `derived_from` isMany String (дочерние элементы — корректно для N→1), `fate`/`rule_id` isAttr. Namespace/prefix консистентны с `pm:RobotMeta`. Дескриптор — singleton, импортирован и в wiring моделлера: `BpmnStage.jsx:1501,4574` (`moddleExtensions: { pm: pmModdleDescriptor, ... }`), также `BpmnVersionDiffOverlay.jsx:102`, `BpmnVersionPreview.jsx:114` → bpmn-js распознает pm:Trace как известный тип; механизм тот же, что у pm:RobotMeta (battle-tested).
- `tobeProvenance.js:50-66` `buildProvenanceByTobeId`: корректная инверсия trace_map; consolidated N→1 складывает несколько AS IS id в один TO BE-элемент, дедуп через `includes`, fate/ruleId — первый непустой источник (осознанная деградация при конфликте судеб — документирована).
- `tobeProvenance.js:98-107` `upsertTraceExtension`: фильтрует только свой `$type === "pm:Trace"`, чужие extensionElements (camunda:properties, pm:RobotMeta) не трогает; идемпотентность подтверждена тестом (повторный embed не дублирует).
- `tobeProvenance.js:110-123`: рекурсия в SubProcess (`eachFlowElement`) — вложенные элементы покрываются; sequenceFlow — flowElement, покрывается.
- Точка встраивания `App.jsx:3816-3850` (`handleTobePublished`): embed **до** `apiPutBpmnXml`, обёрнут в try/catch best-effort — сбой embed не ломает публикацию, sidecar уже записан в create. Подтверждено по коду: `created` проверяется до PUT, sidecar в теле create (`App.jsx:3834-3836`).
- `Workspace.jsx:431-438`: `traceMap` проброшен из стейта (`Workspace.jsx:102`, ставится в `handleTransform` строкой 563) в `onPublishedTobe`. Единственный call-site (`App.jsx:4381`). Дефолт `{ ... } = {}` в handleTobePublished — старые вызовы не ломаются.
- Отдельный `createModdle()` (новый инстанс bpmn-moddle) — **не дублирование** существующего парсера: на момент embed моделлер ещё не существует (сессия только создаётся), общей moddle-фабрики в кодовой базе нет (каждый потребитель создаёт свой инстанс). Правило единой реализации парсера extensionElements (контур `fix/bpmn-properties-parser-audit-v1`) не нарушено: DOM-парсер zeebe/camunda-пропертей (`camundaExtensions.js`, `extractCamundaZeebePropertyEntries.js` и т.п.) — для других типов и не пересекается с pm:Trace; паттерн pm-дескриптора переиспользован, новый парсер-конкурент не создан.

### Канал 2 — sidecar в bpmn_meta_json

- `projects.py:_initial_bpmn_meta_patch` (369-387): shallow merge поверх `sess.bpmn_meta`, 422 на несериализуемый JSON. Применён в обоих путях create: atomic (437-445) и fallback TypeError (481-483). Гонки/потери при fallback нет: пути взаимоисключающие (except TypeError), fallback-ветка добивает те же поля, что и atomic при INSERT. Несериализуемый bpmn_meta по HTTP фактически недостижим (тело уже распарсил pydantic из JSON) — 422 защита для прямых вызовов сервиса.
- `explorer.py:1338-1350`: `CreateSessionBody.bpmn_meta` (Optional dict), тот же merge + 422; условие load-save расширено на `bpmn_meta` — для as_is create без meta поведение прежнее (условие короткое, лишнего write нет).
- Чтение: `session_service.py:609-612` — `provenance` additive в `get_session_meta`, `None` при отсутствии sidecar (подтверждено тестами 4/5). Проекция `GET /api/sessions/{id}` не теряет provenance: `_normalize_bpmn_meta` (`_legacy_main.py:2772-2779`) пропускает неизвестные ключи через passthrough-loop. Проверено по коду.
- OpenAPI: дельта спеки — только `bpmn_meta` в `CreateSessionBody` (openapi.yaml:1208-1211). Ревьюером независимо прогнан `npx @redocly/cli lint docs/openapi.yaml --extends recommended` (Docker node:20-alpine, `-y`) → **«Your API description is valid», 0 errors** (exit 0).

### Критерии приёмки PLAN.md §4

1. unit запись/чтение pm:derived_from + N→1 — **выполнен** (9/9, прогон ревьюера).
2. round-trip create→правка→save→reload→export→100% — **выполнен** на уровне bpmn-moddle (unit) **и усилен живым прогоном через реальный backend** общего стека (§6): 2/2 элемента, ROUND_TRIP_100_PERCENT=true. Полноценный браузерный bpmn-js e2e — не выполнялся ни исполнителем, ни ревьюером. Оценка ревьюера: **не блокер** — регистрация дескриптора в моделлере идентична работающему в проде pm:RobotMeta; слой сериализации (bpmn-moddle) тот же, живой save/reload через API доказан. Остаётся известным ограничением.
3. api create→sidecar→meta чтение — **выполнен** (6/6, прогон ревьюера).
4. no-regression save/persist + снапшот op-протокола — **выполнен**: persist (3f/22p vs 3f/20p, падения идентичны), save (6f/59p/34s/2e — побайтово идентичный набор падений на main), снапшот op-протокола пуст — всё подтверждено прогонами ревьюера (§4, §5).

## 6. Точный user-scenario (фактический метод проверки)

Сценарий «create TO BE из draft → правка → save → reload → provenance цел»:
- Браузерный draft→transform→publish цикл в изолированном окружении воспроизвести нельзя (нет браузера/LLM). Воспроизведён максимально близко **живым прогоном через API общего стека** (`:8011`, JWT admin@local):
  1. `POST /api/projects` → проект `290bb4d6b8`; `POST /api/projects/{pid}/sessions?mode=quick_skeleton` (process_layer=to_be, derived_from_session_id) → сессия `82a95d4a9d`.
  2. embed provenance кодом ветки (`tobeProvenance.js`, trace_map с consolidated N→1 + removed) → XML с `pm:Trace` (2 элемента: Task_a ← [AsIs_1, AsIs_2], Flow_a_b ← [AsIs_4]).
  3. `PUT /api/sessions/{sid}/bpmn` (base_diagram_state_version=0) → **ok, version 2**.
  4. «Правка в моделлере»: импорт/правка/сериализация через bpmn-moddle (тот же движок saveXML): rename Task_a + добавление ручной задачи Task_c → повторный `PUT` (base=1) → **ok, diagram_state_version 2**.
  5. Reload: `GET /api/sessions/{sid}/bpmn` → extract кодом ветки → `{"Task_a":{"derived_from":["AsIs_1","AsIs_2"],"fate":"transformed_to","rule_id":"R01_move"},"Flow_a_b":{"derived_from":["AsIs_4"],"fate":"transformed_to","rule_id":""}}` → **ROUND_TRIP_100_PERCENT=true, правка пользователя сохранилась**.
- Sidecar-ветка сценария (create с bpmn_meta → GET meta provenance) доказана тестами `test_tobe_provenance_sidecar.py` (6/6) на коде ветки — общий стек serve-ит main и sidecar-поле там ещё нет, что и есть зафиксированное расхождение serving mode (§2).
- Тестовая сессия `82a95d4a9d` / проект `290bb4d6b8` оставлены в dev-БД общего стека (мусор review-прогона, безопасно удалить при желании).

## 7. Ниты

1. **`backend/app/projects.py:369-387` + `backend/app/routers/explorer.py:1345-1349`** — 422 на несериализуемый `bpmn_meta` поднимается **после** создания сессии (сирота в storage при failed request). По HTTP недостижимо (pydantic уже распарсил JSON-тело); наблюдение, не дефект.
2. **`backend/app/routers/explorer.py:1338-1350`** — attach meta через post-create load-modify-save (неатомарно), тогда как W4-поля в `projects.py` пишутся атомарно в INSERT (audit P3). Окно гонки микроскопическое (сессия только что создана этим запросом); консистентность не нарушается. Observation.
3. **`frontend/src/features/technologist/workspace/tobeProvenance.test.mjs:3-4`** — шапочный комментарий упоминает `pm:trace_fate`/`pm:trace_rule_id`, реализация пишет атрибуты `fate`/`rule_id` — расхождение комментария с кодом (косметика). Аналогично `API.md:12-15` — пример XML с `<pm:trace` в нижнем регистре при дескрипторе `pm:Trace` (косметика документации).
4. **Браузерный e2e round-trip** — не выполнен (ни у исполнителя, ни у ревьюера). Оценка: не блокер (обоснование §5, критерий 2). Рекомендуется как последующий контур uiux/test с реальным bpmn-js, если критично.

## 8. Итог

- Блокеров: **0**. Мажоров: **0**. Нитов: **4** (косметика/observations).
- Критерии приёмки PLAN.md §4: 4/4 выполнены; round-trip 100% доказан на bpmn-moddle + усилен живым прогоном через реальный backend.
- Вердикт: **PASS_WITH_NITS**. Доработка исполнителю не требуется.
