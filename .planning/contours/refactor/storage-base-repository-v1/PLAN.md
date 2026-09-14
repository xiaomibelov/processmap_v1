# PLAN: Storage Base Repository (P2-дедуп CRUD-клонов)

**Contour:** `refactor/storage-base-repository-v1` · ветка `refactor/storage-base-repository-v1` от `origin/main@2843f4d0`
**Workspace:** `.wt-storage-base-repo` (worktree от p0-work, canonical remote `git@github.com:xiaomibelov/processmap_v1.git`)
**Источник аудита:** P2 — внутрифайловые CRUD-клоны (jscpd): compat 1213 клон-строк / 37 клонов, org_auth 630, ai 514, notes 361, audit_telemetry 87
**Статус:** на approve

## 0. Ключевой факт дизайна (из разведки)

Во всех 12 файлах `*/repository.py` **нет классов-репозиториев** — только module-level функции. Классы есть только в compat (`_PgCompatConnection`, `_PgResult`, `_RowCompat`). Поэтому:

- **BaseRepository проектируется как функциональный модуль `backend/app/domains/storage/base.py`** (generic-хелперы, принимающие `con`/открывающие сами), а не как класс с конструктором. Перевод функций в методы-классы = ломающий рефакторинг всех call-sites — вне границ контура.
- Публичные сигнатуры repository-функций сохраняются дословно; меняется только тело (вызовы base-хелперов).

## 1. Состав base.py

```python
# backend/app/domains/storage/base.py
# Синхронный sqlite/psycopg-контур, placeholder "?" (как во всём домене).

_json_dumps / _json_loads          # перенос из compat (ensure_ascii=False, pydantic-aware), re-export из compat для обратной совместимости
gen_id(prefix="")                  # uuid4().hex[:12] с опциональным префиксом (aud_/ai_exec_/inv_)
now_ts()                           # alias переносимого _now_ts()

build_where(eq: dict, *, org_id=None, org_required=False,
            soft_delete=False, range_cols=None, like_cols=None, ts_col="ts")
                                   # единый where-builder; закрывает клоны
                                   # _build_audit_log_where / _build_error_events_where / _build_ai_execution_log_where
get_by_id(con, table, key, value, *, org_id=None, soft_delete=False, mapper=None, extra_where="")
                                   # SELECT * WHERE {key}=? [AND org_id=?] [AND deleted_at=0] LIMIT 1
insert(con, table, values: dict)    # INSERT (cols) VALUES (?..) → commit
reselect(con, table, key, value, mapper)  # SELECT по PK после insert/update (RETURNING нигде не используется — сохраняем)
update_fields(con, table, fields: dict, where: dict)  # динамический SET k=? по dict + commit
hard_delete(con, table, where: dict) -> bool           # rowcount>0
list_page(con, table, *, where, order_by, order_dir="DESC", limit, offset, mapper)
count(con, table, *, where) -> int
```

Параметризация сущности — **декларативные dict-константы в каждом домене** (не класс):

```python
# пример: audit_telemetry/repository.py
_AUDIT_LOG_SPEC = {
    "table": "audit_log", "key": "id",
    "org_required": True, "ts_col": "ts",
    "json_cols": {"meta_json": "meta"},        # rename при чтении
    "limit": 500,
}
```

- Мапперы (`_row_to_dict`-клоны ×6, `_json_field`-клоны ×7) сводятся к **одному** `row_to_dict(row, *, json_cols=None, drop_suffix=True)` в base; доменные нормализации (priority, scope, usage-sanitize) остаются тонкими обёртками поверх него.
- **ВНЕ v1-шаблона** (остаются доменной спецификой): upsert-разнобой (ON CONFLICT DO UPDATE/DO NOTHING / INSERT OR IGNORE / OR REPLACE), составные PK, bootstrap-побочные эффекты при чтении, CTE-агрегации, каскадные удаления, retention-cleanup.

## 2. Карта миграции по доменам

### 2.1 notes (1372 строк, 361 клон-строк) — шаг 1
- **В base:** `get_note_thread`, `get_note_comment` (get_by_id + org + soft_delete), `create_note_thread`, `add_note_comment` (insert + reselect), `patch_note_thread` (update_fields + reselect), `update_note_comment`, `delete_note_thread`/`delete_note_comment` (soft-delete — доменный шаблон `_soft_delete(con, table, id, *, by)` в base, используется только notes), `acknowledge_note_mention`, `acknowledge_note_thread_attention` (get_by_id + update_fields).
- **Остаётся:** `list_note_threads` (batch-загрузка), `list_note_notifications_for_user` (CTE ~200 строк), `list_active_note_mentions_for_user`, `mark_note_thread_read` (upsert ON CONFLICT reads), upsert `_upsert_note_thread_read`, read-state хелперы, mention-вставки.
- JSON: `scope_ref_json`→`scope_ref` — через `json_cols` спека.

### 2.2 audit_telemetry (594 строк, 87 клон-строк) — шаг 2
- **В base:** `append_audit_log`, `append_error_event` (insert + reselect), `list_*`/`count_*` (build_where + list_page/count), `update_error_event` (update_fields + reselect), `delete_error_event` (hard_delete), `cleanup_*` (where по range + hard_delete с rowcount).
- **Остаётся/выносится:** `get_effective_project_scope`, `user_has_project_access` — вообще не SQL (делегируют org_auth/project); отметка в PLAN, перенос за пределами контура (call-site'ы не меняются).
- Удаляются дубли where-builder'ов (`_build_audit_log_where`, `_build_error_events_where`) → `build_where`.

### 2.3 ai (559 строк, 514 клон-строк) — шаг 3
- **В base:** `list_ai_execution_log`/`count_ai_execution_log` (build_where + range created_at), `get_ai_prompt_version` (get_by_id, key=`prompt_id`), `create_ai_prompt_draft` (insert + reselect), `update_agent_conversation_summary` (update_fields).
- **Остаётся:** `append_ai_execution_log` (**INSERT OR REPLACE** — исключение, не укладывается в generic insert; оставляем, тело через `_json_dumps`), agents-conversations блок (агрегации COUNT/SUM), нормализация scope-level/status (raise ValueError).
- Исключение зафиксировано в PLAN, а не «натянуто» на шаблон — поведение не меняется.

### 2.4 org_auth (2403 строки, 630 клон-строк) — шаг 4
- **В base:** `get_org_group`, `get_org_invite_by_id`, `get_workspace_record`, `get_org_git_mirror_config` (get_by_id + org), `list_org_groups`, `list_org_invites` (list_page), `set_org_active`, `rename_org_record`, `rename_workspace_record`, `revoke_org_invite`, `promote_regenerated_org_invite`, `update_org_git_mirror_config` (update_fields + reselect), `delete_org_invite`, `remove_group_member` (hard_delete по составному where — build_where поддерживает dict).
- **Остаётся:** upsert-семейство (`_upsert_auth_user`, memberships ON CONFLICT, `_ensure_workspace_record`), invites-транзакции (token hash, regenerate), `list_user_org_memberships` (bootstrap side-effect), groups-каскад, `increment_and_get_next_version` (UPDATE CASE), `append_audit_log` (телеметрия — остаётся на месте, call-sites не трогаем), мапперы templates (cross-domain, не двигаем).

### 2.5 compat (6113 строк, 1213 клон-строк / 37 клонов) — шаг 5, самый большой
- **В base:** механические get_by_id/list/insert/update/delete в session/project storage-секции (`_storage_create/save/load/list/delete/rename` — только если они следуют чистым паттернам; optimistic-version логика `base_diagram_state_version` и `DiagramStateConflictError` **остаётся** доменной обвязкой поверх base-вызовов).
- **Остаётся:** `_PgCompatConnection`/`_PgResult`/`_RowCompat` (инфраструктура), `_connect`/`_ensure_schema`/`_get_pg_pool` (переэкспорт в base), request-scope ContextVars, upsert-cемантики, агрегаты.
- Только после шагов 1–4: к этому моменту base уже обкатан, и дельта jscpd максимальна.
- compat также отдаёт в base `_row_to_dict`, `_json_dumps/_json_loads`, `_now_ts` (canonical-версии), сам импортирует их обратно — совместимость импортов сохраняется.

## 3. Порядок коммитов (один домен = один коммит, откат пошаговый)

0. `backend/app/domains/storage/base.py` + characterization-тесты мапперов/where-builder'ов (RED) — **без миграции доменов**; домены пока не трогаем, тесты покрывают base на sqlite-tmpdir.
1. notes → коммит
2. audit_telemetry → коммит
3. ai → коммит
4. org_auth → коммит
5. compat → коммит
6. `PLAN.md` + `STATE.json` + handoff (planning-коммит)

## 4. Тесты и верификация на каждом шаге

- **Существующие:** `cd backend && pytest tests -x -q` — зелёные на каждом шаге (покрытие косвенное через API: test_error_event_repo, test_audit_log*, test_ai_*, test_notes_mvp1_*, test_org_invites*, test_org_groups, …).
- **Characterization:** прямых unit-тестов мапперов нет → перед миграцией notes добавляем fast mapper-level тесты (`tests/storage/test_base_row_to_dict.py`, `test_base_build_where.py`) на sqlite tmpdir; критичные непокрытые методы (`mark_note_thread_read`, `cleanup_org_invites`, `increment_and_get_next_version`, agents-conversations) получают characterization-тест до переноса.
- **jscpd-дельта:** `npx jscpd backend/app/domains/storage --min-lines 5 --min-tokens 50` до/после каждого шага; цель контура ≥ 2500 клон-строк суммарно.
- **DB-plane:** схема БД неизменна — `git diff origin/main -- backend/alembic backend/app/**/models*` пустой + `_ensure_schema()` DDL-строки не меняются (проверяется diff'ом: SQL-строки в патчах идентичны исходным, кроме where-сборки через build_where — семантически эквивалентной).
- **Поведение SQL:** каждый перенесённый метод — тот же результат (те же колонки, порядок, JSON-ключи, limit'ы, org-scoping, soft-delete). Порядок колонок в SELECT `*` и row→dict сохраняется.

## 5. Границы

- Не менять схему БД и alembic-миграции.
- Не трогать `storage.py` (god-hub — отдельный контур).
- Публичные сигнатуры и имена импортируемых хелперов (`_row_to_dict`, `_json_dumps` и т.д. из compat) сохраняются — base реэкспортирует.
- Cross-domain дубли (prompt-version CRUD в canvas_session, `append_audit_log` в org_auth, мапперы templates) — только фиксируются в отчёте, не двигаются в этом контуре.

## 6. Приёмка

- [ ] ≥ 2500 клон-строк устранено (jscpd-дельта по storage-домену)
- [ ] Все существующие тесты storage-домена зелёные на каждом коммите
- [ ] Публичные сигнатуры repository-классов/функций сохранены
- [ ] Схема БД неизменна (alembic/models diff пустой)
- [ ] 5-plane proof в PR; PR на русском; mirror в Obsidian; merge после approve
