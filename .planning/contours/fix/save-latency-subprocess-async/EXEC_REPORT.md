# EXEC REPORT — fix/save-latency-subprocess-async

**Роль:** Agent 2 (Executor)
**Дата старта:** 2026-09-12
**Ветка:** `fix/save-latency-subprocess-async`
**Workspace:** `/Users/mac/agents_place/kimi_PM/p0-work-worktrees/fix-save-latency-subprocess-async` (worktree от `p0-work`)

## Git-proof (старт)

- Rebase на `origin/main` (`654a33b4`, включает PR #963) — чистый, конфликтов нет.
- HEAD после rebase: `cf1ffd6b` (коммит `a337425` переписан ребейзом).
- `git status -sb`: clean, ветка отслеживает `origin/fix/save-latency-subprocess-async` (ahead 4 / behind 5 — ожидаемо после rebase, force-push по факту готовности).

## Этап 0 — pre-flight grep-обход (2026-09-12)

1. **Callers `rollbackTrackedDiagramStateVersion`** — только `frontend/src/features/session/saveCoordinator.js` (alias импорта `rollbackVersion` из casVersionTracker): строки 528, 564, 618. Внешних callers нет (createBpmnPersistence не трогает).
2. **Сигнатура `_save_session_with_cas`** — `backend/app/utils/session_helpers.py:220`: `(storage, sess, *, client_base_version, user_id=None, org_id=None, is_admin=None, bpmn_snapshot=None) -> None`; base=None → legacy full-row upsert; иначе SQL-CAS через `storage.save(..., expected_diagram_state_version=base)`; 0 rows → `DiagramStateConflictError` (409). Импорт из session_helpers в сервисах существует (используется в session_service).
3. **Side-effects `SessionStorage.save`** — реализация `backend/app/domains/storage/compat/repository.py:5402` (`_storage_save`, метод класса `Storage` через `_attach_compat_methods`). Внутри: owner-scope guard (строки ~5425–5458: `_scope_user_id`, `_scope_is_admin`, `_scope_org_id`, проверка `existing_owner != owner_scope` при not admin), upsert строки, инкремент `version`/`updated_at`. Б5-метод `update_derived_fields` обязан сохранить owner-scope guard; инвалидация кэшей — уточнено в ходе реализации (grep `_storage_save` tail + сессионные кэши).
4. **`reconcileConflict`** — реализован в `frontend/src/features/process/bpmn/persistence/createBpmnPersistence.js:45`, регистрируется как хук конфигурации pipeline (`saveCoordinator.js:104,127`, вызов на 409 в `_runPipeline`: 552–555). Образец для Ф2 (reconcileTimeout).
5. **Callers `resolveConflict`** — `frontend/src/features/process/hybrid/controllers/useHybridPersistController.js:206` (overwrite), `frontend/src/components/ProcessStage.jsx:1623` (overwrite), `:2484` (refresh), `:2523` (overwrite), `:2608` (overwrite). Прямого вызова с `"cancel"` не найдено — семантика cancel используется через gate/модалку (уточнение: SAVE_CONFLICT_RESOLUTION.CANCEL — см. ниже). UI-реакция на новую семантику Ф3 (cancel не удаляет конфликт) — совместима: callers либо перечитывают данные (refresh), либо форсируют перезапись (overwrite).

## Ход работы

_(заполняется по мере прохождения этапов)_

### Дефекты 1–3 коммита a337425 (backend) — DONE (Agent 2 backend)

**Дефект 2 (`_child_sync_scope(..., is_admin=s_admin)`) — DONE.**
- RED (дерево с дефектом): 9 failed / 23 passed в `test_subprocess_navigation` /
  `test_create_subprocesses_endpoint_regression` / `test_subprocess_navigate_owner_scope` /
  `test_workspace_subprocess_tree_view`; причина `UnboundLocalError: s_admin`
  (kwarg `is_admin` не существует + использование до присваивания).
- Фикс: откат трёх call-site к позиционному `admin` как на origin/main.
- Коммит `8b8a1179` (файл: `backend/app/services/session_service.py`, 3 строки).
- GREEN: 32 passed (все 4 файла).

**Дефект 1 (Б5, `update_derived_fields`) — DONE.**
- RED чистый (stash prod-кода): 5 failed (`AttributeError: 'Storage' object has
  no attribute 'update_derived_fields'`) в `test_recompute_derived_fields_write`.
- Новый метод `_storage_update_derived_fields` (`compat/repository.py`, аттач через
  `_attach_compat_methods`): UPDATE строго white-list колонок
  (`normalized/resources/questions/mermaid_simple/mermaid_lanes/mermaid/analytics/version/updated_at`),
  «злые» ключи в `fields` фильтруются внутри метода; owner/org guard и
  `SessionNotFoundError` — как у `_storage_save`; RAG-enqueue не нужен (bpmn_xml не меняется).
- `recompute_session` вызывает метод с fields-dict из пересчитанной сессии + инвалидация
  сессионных кэшей (`_invalidate_session_caches`, как у соседних write-путей —
  на main recompute кэши не инвалидировал, отмечено как сознательное отклонение).
- Коммит `e9e0066b`. GREEN: 5 passed.

**Дефект 3 (F1, `sync_subprocesses_task`) — DONE.**
- RED чистый (stash): 5 failed (`ImportError: cannot import name 'sync_subprocesses_task'`)
  в `test_subprocess_sync_task`.
- Celery-задача `processmap.sessions.sync_subprocesses_task` (`app/tasks.py`, bind=True,
  max_retries=2, ignore_result=True): идемпотентна; Redis-lock TTL 120 s (занят → retry
  countdown=2^retries, ≤3 попыток, исчерпание → лог+метрика, без всплытия); НЕ пишет
  строку родителя (счётчики — read-model Б3). Dispatch в `bpmn_save` (cf1ffd6b) не менялся.
- Коммит `e2561f12`. GREEN: 8 passed.
- НАХОДКА: `CELERY_TASK_ALWAYS_EAGER=1` в `tests/conftest.py` НЕ действует —
  `celery_app.py` не читает env-конфиг (`task_always_eager=False` даже с env).
  Тесты мокают celery точечно (patch `sync_subprocesses_task.delay` → `.run`).
  Pre-existing инфра-долг, вне скоупа контура.
- НАХОДКА 2: `session_repo.list_session_children` сломан ещё на main
  (`st.list_session_children` не существует; все call-site'ы в try/except → тихий
  пропуск). Не чинил (вне скоупа); в тестах читаю через доменную функцию
  `app.storage.list_session_children(oid, pid, sid, ...)`.

**Этап 6 (Б6, answer CAS-commit) — DONE.**
- `session_answers.answer`: `st.save(s)` → `_save_session_with_cas(st, s,
  client_base_version=<тот же base, что прошёл _require_diagram_cas_or_409>)`.
  Scope-кwargs НЕ передаём (паритет с прежним `st.save(s)` — guard'ов не было).
  `_mark_diagram_truth_write` без изменений (dsv+1 в том же UPDATE).
- RED чистый (stash): `test_answer_race_with_parallel_bpmn_put` — молчаливая
  перезапись вместо 409 (hook-инъекция PUT'а в окно guard→write через patch
  `_recompute_session`). Parity-якоря (stale-base 409, happy-path, «question not
  found») зелёные и до, и после.
- Коммит `ea7e8aa5`. GREEN: 4 passed.

**OpenAPI:** PUT /bpmn, POST /recompute, POST /answer — response без строгой схемы
(`schema: {}`), новые ключи ответа спеку не меняют; эндпоинты не добавлялись →
`docs/openapi.yaml` регенерировать не нужно.

### Финальная валидация backend (2026-09-12/13, Agent 2)

- **Targeted subset** (13 файлов: subprocess×4, save_revision_hygiene,
  save_data_guard, save_path_decoupling, bpmn_save_rbac_scope,
  auto_create_subprocess_sessions, diagram_cas_guard + 3 новых файла):
  **81 passed, 42 skipped** (skip_if_hanging — норма), **2 failed** —
  `test_bpmn_save_rbac_scope` (оба **pre-existing**: падают на baseline 654a33b4
  тем же `TypeError` в overlay_cache, проверено отдельным прогоном).
- **Полный прогон** (1650 тестов, 198 файлов, чанки по 16 файлов, xdist -n3/4,
  `-p no:schemathesis` — плагин крашит sessionfinish под xdist):
  ветка **46 failed**, baseline 654a33b4 (worktree `agent2-baseline-main`) **46 failed**.
  Дельта: 1 тест (`TestSaveHook::test_patch_session_schedules_analysis`) упал на
  ветке и не на baseline, и наоборот 1 (`test_publish_failure_does_not_break_save`)
  на baseline и не на ветке — оба в `test_agent_analysis_pipeline.py`, оба **зелёные
  последовательно на обоих деревьях** (19/19) → xdist-флаки, **реальная дельта = 0**.
  Остальные 45 падений каждой стороны — общие env-падения (LLM/deepseek без
  сети и ключей, redis/overlay/rag без брокера, migration-035 PG-специфика и т.п.),
  множества совпадают.
- Отдельный sequential-прогон save-смежных файлов (`test_dead_session`,
  `test_diagram_revision_parity` — входят в общие 46): падения воспроизводятся
  на обоих деревьях → pre-existing.

### Этапы 1–4 (frontend Ф1–Ф4) — готово

Коммиты `d08e30c1` (Ф1), `3202cd4f` (Ф2), `14b42816` (Ф3), `ceb8338c` (Ф4). Детали — в разделе ниже «Фронтенд (Ф1–Ф5) — финальный отчёт».

---

## Фронтенд (Ф1–Ф5) — финальный отчёт

Прогоны `node --test` (npm test): baseline 3533 теста (3450 pass / 79 fail / 4 skip) → финал 3577 (3494 / 79 / 4). Дельта падений = 0 (набор падений свержен построчно с baseline). 79 pre-existing fails включают `saveBpmnState.property-pipeline … transport hangs` — тест написан под старый timeout 10 s, конфликтует с #963 (60 s); вне скоупа контура.

- **Ф1 (L1)** `d08e30c1`: `bumpedInRun` в `_runPipeline`; rollback только при bump в прогоне (404/timeout/error); на 409 rollback убран полностью. Тесты `__tests__/saveCoordinator.rollback-discipline.test.mjs` (5).
- **Ф2 (L2)** `3202cd4f`: хук `reconcileTimeout` в registerPipeline; вызов ровно 1 раз на throw из транспорта (timeout / network-error status-0) до failure-path; `{ok:true}` → `completeSuccess({...reconciled, reconciled:true})`. Реализация в xml-pipeline: `GET /meta`, успех ⇔ dsv > sentBase И XML с сервера == отправленному (export-dialect). **Отклонение от плана (зафиксировано)**: `current_session_payload_hash` из /meta — sha256 канонического JSON всей строки, из одного XML на клиенте не воспроизводится → эквивалентное доказательство «dsv↑ + XML-совпадение» (hash unchanged-check fnv1a). Хук только в rawXml/xml пайплайнах; ложный комментарий про abort заменён фактическим. Eligibility: только throw из транспорта. Тесты: `saveCoordinator.reconcile-timeout.test.mjs` (6) + `createBpmnPersistence.reconcileTimeout.test.mjs` (15).
- **Ф3 (L3)** `14b42816`: `refresh` → `setTrackedDiagramStateVersion(serverVersion)` + удаление конфликта; `cancel` → конфликт НЕ удаляется, `{ok:true, action:"cancel"}`, gate блокирует следующий save без транспорта; `overwrite` без изменений. Тесты `saveCoordinator.resolve-conflict.test.mjs` (5).
- **Ф4 (L10)** `ceb8338c`: `rollbackVersion` → `notifyVersionListeners("rollback", …)` при реальном pop; `crossTabVersionSync` adopt'ит `rollback` (guard от stale-отката); автоподписка в `bind()`. ProcessStage.jsx не тронут.
- **Ф5** `1c51c22e`: проброс `subprocesses_sync`/`subprocesses_sync_failed` из ack PUT /bpmn (api.js → createBpmnPersistence.saveRaw → createBpmnCoordinator SAVE_PERSIST_DONE → saveUploadStatus → saveStatusSlotModel → DiagramToolbarSaveStatusSlot): при `state==="saved"` + pending — лейбл «Подпроцессы синхронизируются…» (`data-testid="diagram-toolbar-save-status-subprocesses"`). Без модалок/alert, i18n-словарей нет — в стиле соседнего кода. ProcessStage.jsx не тронут (слот хедера питается от badge). +11 тестов, дельта падений 0.

Инфраструктурно: на хосте нет Node — использован portable Node v24.15.0 в `/tmp/fpc-node/` (scratch; `npm ci` выполнен в `frontend/node_modules`).

## Backend — верификация прогонов (в работе)

- Раннер: `.venv311-test` (python3.11) — venv на Python 3.13 не собирается (pydantic-core 2.16 без cp313 wheel → source build fails); `.venv311-test` в .gitignore.
- Целевые прогоны новых тестов (`test_recompute_derived_fields_write`, `test_answer_cas_commit`, `test_subprocess_sync_task`): **17 passed**. Независимая верификация поверх прогонов backend-агента.
- Регрессионная save/subprocess-группа (9 файлов): 55 passed / 2 failed — оба (`test_bpmn_save_rbac_scope`) воспроизводятся на baseline `origin/main` один в один (pre-existing).
- Полный сьют ветки vs полный сьют baseline (`origin/main`, отдельный worktree):
  - baseline: 58 failed / 1472 passed / 103 skipped.
  - Первая пара прогонов (конкурентно): ветка 61 failed — из них 2 (`test_agent_analysis_pipeline::TestManualEndpoints`) флаky из-за общего default-storage при конкурентных прогонах (на baseline standalone падают те же 2; на ветке standalone 19/19 green), 1 (`test_subprocess_sync_task::...broker_down`) — поллюция `task_always_eager=True` из `test_overlay_cache.py` → исправлено гвардом в setUp (`7e46c2cd`), парный прогон pollutant+файл: 8/8 green.
  - Финальный последовательный прогон ветки: результат ниже.

## Этап 8 (E2E + замеры) — статус

- E2E-спека `canvas-editing-stability.spec.mjs`: **написана** (коммит `b4bd25a3`, +375 строк: сценарий 8.1 «slow PUT 12 s + печать в интервью» и 8.2 «большая схема 377 элементов/34 подпроцесса, серия правок, замеры gaps/p95»; существующие 4 теста файла не тронуты; синтаксис и `playwright --list` проверены, генератор XML валидирован через bpmn-moddle). **Запуск — на stage после deploy-approve** (PLAN §7); локально против worktree невозможен без мутации общего docker-стека.
- Локальный запуск E2E против worktree невозможен без мутации общего docker-стека (сервисы `processmap_v1` монтируют canonical checkout `p0-work`, а не worktree; поднятие параллельного стека запрещено AGENTS.md §9.4). Замер p95 на stage — только после approve на deploy (PLAN §7). Это сознательное ограничение, зафиксировано для review.
