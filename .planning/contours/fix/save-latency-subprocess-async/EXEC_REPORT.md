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

### Этапы 1–4 (frontend Ф1–Ф4) — в работе (другой агент)
