# EXEC REPORT: storage-base-repository-v1

**Ветка:** `refactor/storage-base-repository-v1` от `origin/main@2843f4d0` · 12 коммитов · workspace `.wt-storage-base-repo` (worktree от p0-work, canonical remote)
**Статус:** реализация завершена, PR открыт, merge после approve

## Что сделано

**Шаг 0** (`9ef96430`, `da920eb8`): `backend/app/domains/storage/base.py` — функциональный generic-слой: `build_where`, `get_by_id`, `insert`, `reselect`, `update_fields`, `hard_delete`, `list_page`, `count`, `row_to_dict(json_cols)`, `gen_id`, `now_ts`, `check_ident` (whitelist идентификаторов, alias-qualified). 21 characterization-тест.

**Шаг 1 notes** (`31e67902`): 11 функций делегированы в base; общие хелперы `_get_live_thread`, `_list_thread_comment_dicts`, `_fetch_note_mentions_by_comment_ids`; фильтры всех list-функций через `build_where`. 17 characterization-тестов. Дельта −5.

**Шаг 2 audit_telemetry** (`97d77160`): `_build_audit_log_where`/`_build_error_events_where` удалены → `build_where`; append/list/count/update/delete/cleanup → base. `append_audit_log` мигрирован в org_auth (там его каноническое место). `app/storage.py`: удалены dead-imports. 19 characterization-тестов. Дельта −43.

**Шаг 3 ai** (`d6e1c9fb`): `_build_ai_execution_log_where` удалён; list/count/get/create_draft/update_summary → base. `append_ai_execution_log` оставлен raw (INSERT OR REPLACE — задокументированное исключение). `_build_ai_prompt_where` не тронут (общий с canvas_session — вне контура). 16 characterization-тестов. Дельта −36.

**Шаг 4 org_auth** (`8e469c90`): get/list/update/delete/rename/revoke/promote → base; `_resolve_session_org_scope`-подобные дедупы (`_ORG_ROW_SELECT`, `_fetch_org_row`, `_org_record_payload`, `_INVITE_ROW_SELECT`). Upsert-семейство, invites-транзакции, bootstrap-read оставлены raw (по карте). 13 characterization-тестов. Дельта −127.

**Шаг 5a** (`e6d942f8`, `7450f3a4`): **DIVERGENCE_TABLE.md** (условие approve №1): 25 row-мапперов — 3 ЭКВИВАЛЕНТ / 22 ОТЛИЧИЕ (доменные DTO-проекции, не канонизированы, каждое отличие задокументировано); `_now_ts` — из 5 исторических вариантов в домене дожили 2 фактических дубля, оба ЭКВИВАЛЕНТ, мигрированы. Канонические `_json_dumps/_json_loads/_now_ts/_row_to_dict` переехали в base.py; compat re-export (base самодостаточен, circular import проверен).

**Шаг 5b** (`ea61273a`): compat session/project CRUD (`_storage_load/delete/count/list`, `_storage_find_by_parent_element`, bpmn-versions фильтры) → base; внутренние дедупы `_resolve_session_org_scope`, `_bpmn_version_payload`, `_registry_source_*`. Optimistic-version CAS, upsert, адаптеры, scope ContextVars, DDL, legacy-миграции — не тронуты. 12 characterization-тестов. Дельта −137.

## Покрытие и зелень

- Итоговый гейт: **200 passed** (28 файлов: все существующие storage-тесты + 78 новых characterization-тестов).
- Каждый шаг коммитился только при зелёном гейте и строго положительной jscpd-дельте (условия approve №2, №3 соблюдены; фиксация на зелёном шаге не потребовалась).

## jscpd (канонический конфиг аудита: `--min-lines 5 --min-tokens 25`, `backend/app/domains/storage`)

| Точка | Clones | Duplicated lines |
|---|---|---|
| baseline | 268 | 2568 |
| шаг 1 notes | 269 | 2563 |
| шаг 2 audit_telemetry | — | 2520 |
| шаг 3 ai | — | 2484 |
| шаг 4 org_auth | 253 | 2357 |
| шаг 5a канонизация | — | 2336 |
| **финал 5b** | **242** | **2199** |

**Суммарная дельта: −369 duplicated lines / −26 clones (14.2% домена).**

✅ **Приёмка закрыта решением владельца (15.09.2026), вариант (а) — пересчёт метрикой аудита.** Конфиг `--min-lines 5 --min-tokens 25`, скоуп `backend/app/domains/storage`, база `origin/main@2843f4d0`:

| Метрика | База | Ветка | Дельта |
|---|---|---|---|
| Клон-строки аудита (инстанс на пару) | 2836 (аудит фиксировал ≈2805) | 2441 | **−395** |
| jscpd `duplicatedLines` | 2568 | 2199 | −369 |
| Сумма длин обоих инстансов | 5644 | 4850 | −794 |

Критерий «≥2500» признан ошибочно откалиброванным на этапе approve: математический потолок для этого diff — −2128 (1064 удалённые строки × ≤2 инстанса на клон), а весь объём клонов домена на базе — 2836. Полное достижение ≥2500 требовало выхода за утверждённые границы PLAN (DDL/upsert/CAS/агрегаты compat, 22 задокументированно-неэквивалентных DTO-маппера). Владелец принял контур по факту: скоуп PLAN выполнен, каждый шаг — зелёный гейт и положительная дельта, нетто продуктового кода −12 строк. Остаток (2441 клон-строка; крупнейшие держатели — compat, org_auth, notes, canvas_session) — в follow-up контур.

**Evidence (дампы удалены из PR решением владельца — составляли 87% объёма diff).** Контрольные суммы для верификации:
- `jscpd/baseline.json` — 326 711 байт, sha256 `58b52cb7bd31175605992f8b59eed5cff40c5ee05591bea28b4685d8bb13e7e6`
- `jscpd-final/jscpd-report.json` — 290 527 байт, sha256 `a0352d8bb2ca500a6d338cc3ea3f61c81edfad6d9075a3cfc6c19633378d8426`

## DB-plane (схема неизменна)

- `git diff origin/main -- backend/alembic backend/app/**/models* backend/app/db` — пустой по файлам схемы; DDL-строки `_ensure_schema`/`_ensure_agent_tables` в дифе не изменялись (мигрированы только DML-обвязки).
- Откат: каждый шаг — отдельный коммит; `git revert` в обратном порядке.

## Известные отклонения и риски

1. `app/storage.py`: две минимальные правки импортов (dead-import cleanup после удаления `_build_*_where`) — обе необходимы для работоспособности дерева, логика не менялась. God-hub логика не тронута.
2. `test_storage_sqlite_scope.py::test_projects_and_sessions_are_scoped_by_user` падает **на чистом origin/main** (проверено в отдельном worktree `2843f4d0`, см. git-worktree `/tmp/pm-main-check`) — pre-existing, вне контура; рекомендован отдельный fix-контур.
3. `test_audit_log_e8.py` требует Postgres — env-only, исключён из локального гейта на baseline и сейчас (в CI работает).
4. Notes: в `mark_note_thread_read` убран задвоенный `deleted_at = 0` (семантически тождественно, покрыто characterization-тестами).
5. Сознательные исключения из шаблона (задокументированы в PLAN/DIVERGENCE_TABLE): INSERT OR REPLACE (ai), upsert-семейства org_auth/compat, invites-транзакции, bootstrap-read side-effects, CTE/агрегаты, `_build_ai_prompt_where` (общий с canvas_session).

## 5-plane proof

- **code:** ветка `refactor/storage-base-repository-v1`, 12 коммитов контура + cleanup evidence (HEAD см. в PR #979); diffstat после удаления сырых jscpd-дампов: 18 файлов, ≈+2950/−1064.
- **workspace:** `.wt-storage-base-repo` (worktree от p0-work, canonical remote `git@github.com:xiaomibelov/processmap_v1.git`), `git status` чистый на момент PR.
- **DB:** схема/DDL неизменны (см. DB-plane); поведение SQL подтверждено characterization-тестами и существующими API-тестами.
- **env/compose:** тесты — python:3.11 контейнер `pm-storage-test` (deps = requirements.txt + requirements-dev.txt, как CI), sqlite tmpdir, без внешних сервисов.
- **serving mode:** контур не меняет HTTP-эндпоинтов → `docs/openapi.yaml` не дрейфует (роуты не тронуты; spec-drift не затронут).