# Трек B — P2–P6 «защита данных» (backend): отчёт

Дата: 2026-07-31 · Ветка: `fix/save-data-guard` (от `origin/main` 469e4ee9) · Worktree: `/root/pm-e3/worktrees/fix-save-b`
Аудит: `docs/audit/save_pipeline.md` — проблемы P2 (T2/T3), P3 (T4), P4 (T5), P5 (T6), P6 (S3.2), оговорка про LWW (C3).

## Чек-лист

| Задача | Статус | Что сделано |
|--------|--------|-------------|
| B1 (P2, mixed-path LWW) | ✅ | SQL-CAS в `Storage.save(expected_diagram_state_version=...)`: `UPDATE sessions SET … WHERE id=:id AND diagram_state_version=:base`; 0 строк → `DiagramStateConflictError` → 409 `DIAGRAM_STATE_CONFLICT` (тот же payload-контракт, что у in-memory guard). Проведено через `_save_session_with_cas` на путях с base: PUT /bpmn, PUT /sessions, PATCH /sessions (diagram-write), restore, clear, node/edge ops. Пути без base (внутренние/admin вызовы, `FPC_E2E_CAS_BYPASS=1`) — legacy upsert без изменений. |
| B2 (P3, race-дубли) | ✅ | UNIQUE-индексы (создаются только при отсутствии дублей, без мутации данных): `idx_sessions_natural_key_unique (org_id, COALESCE(project_id,''), lower(title), COALESCE(mode,''))` для project-scoped корневых сессий; `idx_sessions_tobe_derived_unique (org_id, project, derived_from_session_id)` для TO BE. `IntegrityError` → `SessionTitleConflictError` → 409 «session title already exists» (существующий контракт title-check). `process_layer`/`derived_from_session_id` задаются атомарно в INSERT (без сирот при гонке TO BE). Alembic 011. |
| B3 (P4, снапшот вне транзакции) | ✅ | `Storage.save(bpmn_snapshot=...)`: вставка в `bpmn_versions` в ТОЙ ЖЕ транзакции, что и строка sessions (общий `_insert_bpmn_version_row`, MAX+1 внутри транзакции). Планировщик `_plan_bpmn_revision_snapshot_if_needed` (решение) + совместимый wrapper. UNIQUE `(session_id, org_id, version_number)` уже существовал в `_ensure_schema` (аудит ошибочно считал, что его нет) — добавлен в alembic 011 для паритета. Тесты: конфликт CAS не оставляет снапшота; исключение при вставке снапшота откатывает и rev, и XML. |
| B4 (P5, GET с записью) | ✅ | `_persist_regenerated` удалён из `session_bpmn_export`: при расхождении fingerprint XML регенерируется в память и возвращается, запись не выполняется (нет rev+1, нет `export_regenerate`-версий, нет lockless-записи). Осознанных других вызовов persist-пути не было — единственный «export-persist» жил только здесь. Тест: GET /bpmn с расходящимся fingerprint → 200 с регенерированным XML, `diagram_state_version` и `bpmn_versions` неизменны. |
| B5 (P6, мёртвая draft-модель) | ✅ (вариант 4xx) | Инвентаризация ниже. Удаление модели НЕбезопасно → реализован явный 409 `DRAFT_GRAPH_READ_ONLY_XML_TRUTH` на явную запись nodes/edges через PUT/PATCH /sessions для сессий с непустым `bpmn_xml` (вариант F6 аудита). Сессии без XML — прежнее поведение. |
| C3 (LWW SQL-подтверждение) | ✅ | API-тесты через `TestClient` (JWT, полный стек с middleware): 2 параллельных PUT /bpmn с одним base → ровно один 200, второй 409/423, rev ровно +1, XML = победителю; mixed-path PUT /bpmn ∥ PUT /sessions → ровно один winner, rev +1 (воспроизведение S1.2 теперь невозможно). |

## Изменённые файлы

- `backend/app/storage.py` — CAS в `save()`, транзакционный снапшот (`_insert_bpmn_version_row`), UNIQUE-индексы в `_ensure_schema` (dup-guarded), `DiagramStateConflictError`, `SessionTitleConflictError`, `_is_integrity_error`, `create(process_layer, derived_from_session_id)`.
- `backend/app/utils/session_helpers.py` — `_save_session_with_cas`, `_effective_sql_cas_base`.
- `backend/app/_legacy_main.py` — проводка CAS на write-путях; `_plan_bpmn_revision_snapshot_if_needed`; удаление `_persist_regenerated`; `_reject_draft_graph_write_on_xml_session`; 409-маппинг в create/rename; атомарный TO BE create.
- `backend/app/services/session_service.py` — CAS-save в node/edge операциях.
- `backend/app/repositories/session_repo.py` — pass-through `process_layer`/`derived_from_session_id`.
- `backend/alembic/versions/011_session_write_guards.py` — миграция (upgrade/downgrade, dup-guarded).
- `backend/tests/test_save_data_guard.py` — 13 новых тестов.

## Инвентаризация P6 (nodes_json/edges_json) и решение

**Читатели:**
- `session_bpmn_export` (fingerprint/has_graph — решение о regenerate);
- `_session_graph_fingerprint` (PUT /bpmn, restore);
- `exporters/bpmn.export_session_to_bpmn_xml` (экспорт из nodes, когда они есть);
- `_recompute_session` → `normalize_nodes`, `build_resources_report`, `build_questions`, `render_mermaid`, `compute_analytics` (вопросы/mermaid/аналитика);
- `get_session_graph` (`/api/sessions/{id}/graph` — граф-анализ/AI);
- `_session_api_dump` → поля nodes/edges в API (ui_model-консьюмеры фронта).

**Писатели:**
- PUT /sessions (full-replace, всегда), PATCH /sessions (по ключам);
- node/edge endpoints (add/patch/delete) — гибридный editor API;
- notes/answer/ai_questions (interview-driven recompute — draft-модель для не-XML сессий);
- subprocess-children (`find_or_create_child_session`).

**Фронт:** `apiPutSession` используется только в `GraphEditorOverlay.jsx`, который нигде не импортируется (мёртвый компонент); живой hybrid-пайплайн пишет через `persistHybridLayerMap`/`persistHybridV2Doc` (sidecar в `bpmn_meta`), не через nodes_json.

**Решение:** удаление модели — отдельный spike (read-paths мermaid/questions/analytics/graph и interview→draft поток зависят от неё). Реализован вариант F6: явный 409 на запись nodes/edges в XML-сессии. Риск для фронта минимален (живых вызовов PUT nodes на XML-сессиях не найдено).

## Тесты

- Команда (как в `scripts/regression_e1_e4.sh`): `python -m pytest backend/tests/ -q --continue-on-collection-errors` из корня репо; venv `/root/pm-e3/app/.venv`.
- ⚠️ Ограничение: прогон на SQLite (fixtures conftest), Postgres/Redis не поднимались — Redis-lock в тестах в bypass-режиме (гонки настоящие, что и нужно для C3).
- Новые тесты: `tests/test_save_data_guard.py` — 13 шт., все зелёные:
  - `TestConcurrentBpmnPutSqlCas` (3): parallel PUT /bpmn один winner; mixed-path один winner; sequential flow со SQL-CAS не сломан (включая stale → 409).
  - `TestSessionCreateIdempotency` (3): seq-дубль 409; parallel create один 200/один 409, ровно 1 сессия; parallel TO BE по одному `derived_from_session_id` → один 200/один 409, ровно 1 TO BE.
  - `TestBpmnSnapshotAtomicity` (3): снапшот пишется с save; stale CAS → ни снапшота, ни rev; исключение при вставке снапшота → полный откат.
  - `TestBpmnExportReadOnly` (1): GET /bpmn с расходящимся fingerprint не меняет rev/versions, `export_regenerate`-строк нет.
  - `TestDraftGraphWriteRejectedOnXmlSessions` (3): PATCH/PUT nodes на XML-сессии → 409 `DRAFT_GRAPH_READ_ONLY_XML_TRUTH`; draft-сессия без XML — прежний 200.

### baseline vs after (целевой save-контур)

14 файлов: cas_guard, bpmn_put_redis_lock, bpmn_restore, sessions_drift, overlay_cache, session_cache, bpmn_meta, session_meta_endpoint, status_transitions, bpmn_save_rbac, session_read_rbac, auto_create_subprocess, project_sessions_summary, sessions_rbac:
- baseline (чистый HEAD 469e4ee9, отдельный worktree): 7 FAILED + 1 collection ERROR (test_overlay_cache) — весь шум pre-existing.
- after: идентично baseline (те же 7+1, ни одного нового) + 13 новых зелёных.

### baseline vs after (полный прогон backend/tests)

Команда: `python -m pytest backend/tests/ -q --tb=no --continue-on-collection-errors` из корня репо (root-mode, как `scripts/regression_e1_e4.sh`).

| прогон | failed | passed | error | дельта к baseline |
|---|---|---|---|---|
| baseline (чистый main `469e4ee9`, /root/pm-e3/app) | 208 | 723 | 1 | — |
| after (fix/save-data-guard, до фиксов изоляции) | 260 | — | 24 | +75 новых (регрессия, разобрана ниже) |
| **after (финальный, после всех фиксов)** | **22** | **921** | **1** | **0 новых; −186 починено** |

Финальный список падений (`/tmp/trackb_final_failures.txt`, 23 строки) — **строгое подмножество** baseline-списка (`/tmp/baseline_failures.txt`, 209 строк): все 22 failed + 1 error (test_overlay_cache collection) pre-existing. Проверка: `comm -13 baseline after` пуст.

Оставшиеся 22 pre-existing: test_e2e_interview_diagram_xml (4), test_session_meta_endpoint (3), test_org_property_dictionary_api (3), test_diagram_revision_parity (3), test_bpmn_meta (2), test_analytics_aggregator (2), test_storage_sqlite_scope, test_redis_cache_workspace_tldr, test_rag_api, test_diagram_cas_guard::test_multiple_diagram_write_paths_are_cas_guarded, test_bpmn_save_rbac_scope (по 1).

#### Найденные проблемы изоляции полного прогона и фиксы

Полный root-mode прогон выявил три проблемы (изолированные прогоны файлов были зелёные):

1. **PG-каскад `InFailedSqlTransaction` (+52 падения: test_kitchens, test_precheck, test_recipes, test_api_contracts и др.).** Dup-guard SELECT для новых unique-индексов использовал `HAVING c > 1` (алиас колонки) — невалидно в Postgres. Исключение глоталось `try/except` в `_ensure_schema` (warning в лог), но PG-транзакция оставалась в aborted-состоянии → все последующие запросы на том соединении падали с `InFailedSqlTransaction` → 500 на любых эндпоинтах PG-контуров (кухни/рецепты/шаблоны, ходящих в PG `localhost:5432`).
   **Фикс (storage.py):** `HAVING COUNT(*) > 1` + оба dup-guard блока обёрнуты в `SAVEPOINT pm_ix_sessions_*` / `RELEASE` / `ROLLBACK TO SAVEPOINT` — любая ошибка guard'а теперь не убивает транзакцию. Тот же фикс продублирован в alembic `011_session_write_guards.py`.
2. **Утёкший monkeypatch в pre-existing `test_api_meta_runtime.py` (12 падений test_save_data_guard в полном прогоне + основная часть 208 baseline-падений root-mode).** Тест подменял `_legacy_main.get_storage`/`runtime_status` lambda'ми (бросающими `AssertionError("/api/meta must not call storage")`) **без восстановления**. Все тесты позже по алфавиту, ходящие в `_legacy_main.get_storage` (routers/sessions → session_service → _legacy_main), получали 500 AssertionError. В baseline root-mode из-за этого падали test_diagram_cas_guard (9), test_session_cache (9), test_sessions_drift и десятки других — мой новый файл просто стал ещё одной жертвой.
   **Фикс (test_api_meta_runtime.py, ⚠️ изменён чужой тест):** оригиналы сохраняются и восстанавливаются в `finally`. Побочный эффект — починилось 186 pre-existing падений root-mode прогона (after стал *лучше* baseline: 22 vs 208 failed). Сам тест test_api_meta_runtime зелёный.
3. **Scope natural-key индекса (1 падение: test_product_actions_ai_suggest).** Внутренние прямые `st.create` (без API-`mode`) конфликтовали с первоначальным natural-key. **Фикс:** индекс сужен `WHERE ... AND mode IS NOT NULL AND mode != ''` — покрывает ровно API-create контракт 409, внутренние потоки не затронуты.

Плюс sys.path-shim в `test_save_data_guard.py` (паттерн из test_diagram_cas_guard.py) для root-mode импорта `app.*`.

4. **Reload-stale классы исключений (2 флакующих падения: parallel-create тесты).** Pre-existing тесты `test_admin_agent_runs.py`/`test_admin_rag_settings.py` делают `importlib.reload(app.storage)` — после этого `Storage` поднимает НОВЫЙ класс `SessionTitleConflictError`, а `except SessionTitleConflictError` в `_legacy_main.py` (from-import, старая ссылка) его не ловит → 500 вместо 409 при гонке create. Воспроизводилось детерминированно комбо `test_admin_agent_runs + test_admin_rag_settings + test_api_meta_runtime + test_save_data_guard` (500 SessionTitleConflictError в middleware), в полных прогонах проявлялось флаком в зависимости от таймингов. **Фикс:** except'ы переведены на позднее связывание через модуль (`except _storage_mod.SessionTitleConflictError`, 4 места в `_legacy_main.py` — прод-поведение без reload идентично); в `test_save_data_guard.py` классы для `assertRaises`/`patch.object` резолвятся через `storage_mod.*` в момент вызова + defensive setUp-guard восстанавливает `_legacy_main.get_storage`, если он остался отравлен чужим monkeypatch'ем. Комбо-прогон 35/35 зелёный, финальный solo full-run (22f/921p/1e) подтвердил числа таблицы выше.

Контрольные повторы полного прогона после всех фиксов: run#2 — 24f/919p/1e (2 флака parallel-create до фикса #4), run#3 — 23f/920p/1e (все 13 data-guard зелёные; единственное отличие от baseline — pre-existing timing-флак `test_audit_log_e8::test_param_change_writes_named_diff_within_1s`: journal write 1.040s при пороге 1.0s под нагрузкой 26-минутного прогона, к коду трека B отношения не имеет, в run#1/#2 проходил). Дополнительно подняты таймауты barrier/join (30s/120s) в parallel race-тестах для нагруженных прогонов.

## ⚠️ Отклонения и оговорки

1. **Индексы dup-guarded, НЕ дедуплицируют данные.** На БД с существующими дублями (на stage остались dup-probe сессии аудита `2fdeed83c8`/`ddc19bc3e3`) unique-индекс будет пропущен с warning в логах, защита не включится до ручной чистки дублей владельцем. Деструктивную миграцию данных сознательно не делал.
2. **UNIQUE bpmn_versions уже существовал** в `_ensure_schema` (`idx_bpmn_versions_session_version`) — пункт аудита «MAX+1 без UNIQUE» частично неактуален для схемы; риск был в отдельной транзакции (закрыт) и в отсутствии обработки коллизии (закрыт CAS-сериализацией писателей).
3. **Postgres-путь частично прогонян** PG-backed тестами полного прогона (test_kitchens/test_recipes/test_precheck и др. ходят в локальный PG docker-стек): `_ensure_schema` с новыми индексами отрабатывает на PG (SAVEPOINT-guard + `HAVING COUNT(*)`) — зелёные. Полноценный stage-прогон с Redis всё равно нужен при деплое: Redis-lock в тестах в bypass-режиме, 423-путь не покрыт (pre-existing).
4. **st.save(parent) при subprocess parent-sync** и `st.save(s, is_admin=True)` в auto-subprocess post-step оставлены без CAS (best-effort метаданные, как и было; отдельный контур subprocess).
5. **GET /bpmn теперь каждый раз регенерирует XML в память** при расходящемся fingerprint (раньше — один раз и persist). CPU-цена чтения; состояние не меняется. В штате fingerprint совпадает → путь не трогается.
6. `Storage.save(expected_diagram_state_version=...)` применяет CAS только если строка существует (create-путь — обычный INSERT).
7. **Изменён чужой pre-existing тест `test_api_meta_runtime.py`** (только тест, не прод-код): добавлен `finally`-restore утечавших monkeypatch'ей `_legacy_main.get_storage`/`runtime_status`. Без фикса любой новый тест, ходящий в session-эндпоинты, детерминированно падал в полном root-прогоне (и ~186 baseline-тестов падали по той же причине). Прод-логика `/api/meta` не тронута, сам тест зелёный.
8. **Natural-key индекс покрывает только API-mode сессии** (`mode IS NOT NULL AND mode != ''`): внутренние direct-`st.create` (seed/auto-flows без mode) сознательно не ограничены unique-ограничением — дубли там возможны, как и раньше.
