# PLAN: fix/storage-domain-split

## Цель
Разрезать `backend/app/storage.py` (~14k строк, 388 сущностей, fan-in 131) на доменные модули внутри `backend/app/domains/storage/<domain>/`, сохранив обратную совместимость для всех текущих импортёров. Это подготовка границ будущего микросервиса, а не сам вынос.

## Scope (bounded)
- Только `backend/app/storage.py` и новые модули под `backend/app/domains/storage/`.
- Никаких изменений бизнес-логики, HTTP-роутов, моделей, БД-схемы.
- `Storage` / `ProjectStorage` превращаются в тонкие фасады, делегирующие в домены.
- Cross-domain транзакции выявляются и документируются; в этом контуре остаются в фасаде (распределённые транзакции — следующий контур).

## Источник правды
- `backend/app/storage.py` (HEAD `fix/storage-domain-split` от `origin/main`).
- Аудит: `.planning/contours/audit/file-decomposition-audit/DECOMPOSITION-MAP.md`.
- Доменная структура адаптирована под `backend/app/domains/storage/<domain>/` (требование задачи).

## Доменная карта (old block → new module)

| домен | новый модуль | что переносится | примечание |
|-------|--------------|-----------------|------------|
| `storage_compat` | `domains/storage/compat/` | низкоуровневые helpers, schema bootstrap, connection compat, row mapping, `Storage`/`ProjectStorage` фасады | остаётся ядром, от которого зависят другие домены |
| `platform` | `domains/storage/platform/` | feature flags, deployment notices, RAG settings, meta kv | почти независимый |
| `dictionaries` | `domains/storage/dictionaries/` | process property metadata, reference options, org property dictionaries, user preferences | зависит от `compat` |
| `utils` (note helpers) | `domains/storage/utils/` | normalize-функции для заметок, row-to-dict заметок, mention helpers | используется `notes` и `canvas_session` |
| `org_auth` | `domains/storage/org_auth/` | orgs, workspaces, users, memberships, groups, invites, permissions | зависит от `compat` |
| `project` | `domains/storage/project/` | project memberships, create/move project | зависит от `org_auth`, `explorer` для cross-domain операций |
| `explorer` | `domains/storage/explorer/` | folders (template + workspace), project/folder tree | зависит от `compat` |
| `templates_legacy` | `domains/storage/templates_legacy/` | templates CRUD | зависит от `explorer` для папок |
| `audit_telemetry` | `domains/storage/audit_telemetry/` | audit log, error events | зависит от `compat` |
| `ai` | `domains/storage/ai/` | AI execution log, prompts, agent conversations | зависит от `compat`, `canvas_session` для prompt versions |
| `canvas_session` | `domains/storage/canvas_session/` | session presence, AI prompt versions, open notes aggregate, project session tree, diagram truth payload | зависит от `compat`, `utils` |
| `notes` | `domains/storage/notes/` | note threads, comments, mentions, read state | зависит от `compat`, `utils`, `canvas_session` для агрегатов |

## Порядок выноса (нисходящие зависимости)
1. `compat` — базовые helpers, connection, row mapping.
2. `platform` — независимый.
3. `utils` (note helpers) — листовой.
4. `dictionaries` — зависит только от `compat`.
5. `audit_telemetry` — зависит только от `compat`.
6. `org_auth` — зависит от `compat`.
7. `explorer` — зависит от `compat`.
8. `templates_legacy` — зависит от `explorer`/`compat`.
9. `canvas_session` — зависит от `compat`/`utils`.
10. `ai` — зависит от `compat`/`canvas_session`.
11. `notes` — зависит от `compat`/`utils`/`canvas_session`.
12. `project` — зависит от `compat`/`org_auth`/`explorer`; cross-domain операции `create_project_in_folder`, `move_project_to_folder` остаются в фасаде.
13. `storage.py` — оставить `Storage`/`ProjectStorage` как фасады + cross-domain координацию + backward-compatible re-exports.

## Cross-domain транзакции (выявленные на старте)
| функция | домены | что делать в этом контуре |
|---------|--------|---------------------------|
| `_ensure_schema` | все | оставить в `compat`, вызывает DDL; доменные DDL-части остаются внутри одной транзакции |
| `_maybe_migrate_legacy_files` | compat + несколько таблиц | оставить в `compat` |
| `_ensure_auth_users_backfill` | org_auth + compat | вынести логику в `org_auth`, bootstrap-координацию в `compat` |
| `_ensure_workspace_folder_backfill` | explorer + project | оставить в фасаде `compat`/storage.py |
| `_ensure_enterprise_bootstrap` | org_auth + compat | вынести логику в `org_auth`, вызывать из `compat` |
| `_ensure_org_workspaces_bootstrap` | org_auth + explorer | вынести логику в `org_auth`, вызывать из фасада |
| `create_project_in_folder` | project + explorer | фасад: открыть транзакцию → вызвать `project.create_project_record` + `explorer.attach_project_to_folder` |
| `move_project_to_folder` | project + explorer | аналогично фасад |
| `run_workspace_folder_backfill` | explorer + project + canvas_session | фасад: координирует доменные функции |
| `Storage.create` / `save` / `patch_session_meta` и др. | canvas_session + audit/telemetry/ai | фасад: вызывает `canvas_session` операции, при необходимости audit/telemetry side-effects в той же транзакции |

## Архитектура фасадов
- `Storage(base_dir: Path)` — сохраняет текущий публичный API; методы делегируют в `domains/storage/canvas_session/...` и смежные домены.
- `ProjectStorage(root: Path)` — сохраняет текущий публичный API; делегирует в `domains/storage/project/...`.
- `storage.py` re-exports все публичные имена, которые импортировали 131 потребитель, чтобы `from app.storage import X` продолжал работать.
- Доменные модули экспортируют только явный public API; внутренние функции с `_` не импортируются извне.

## Тесты
1. **Smoke**: `python -c "from app import storage; print(len(dir(storage)))"` + импорт каждого доменного модуля.
2. **Backward-compat**: скрипт импортирует всё, что импортировалось из `app.storage` в текущем кодовой базе (автоматически собирается по `grep`/`ast`).
3. **Contract tests**: pytest для публичных функций каждого домена — минимум проверка сигнатур и репрезентативных вызовов (unit с мок БД или SQLite in-memory).
4. **Regression**: `pytest backend/tests` (существующий набор) должен проходить без изменений.

## Критерий выхода
- `pytest backend/tests` green.
- `from app.storage import <X>` работает для всех `<X>`, которые импортировались до рефакторинга.
- `git diff --stat` показывает только перемещения/делегации в `storage.py` + новые файлы; нет изменений в `backend/app/routers/`, `services/`, тестах.
- Артефакты: `CHANGES.md`, `TESTS.md`, `PR.md`.

## Риски
- Циклические импорты: `services/session_service.py` ↔ `_legacy_main.py` ↔ `storage.py`. Решение: доменные модули не импортируют `storage.py`, только `compat`/`utils`.
- Разрыв транзакций: cross-domain методы фасада сохраняют единую `con`/транзакцию.
- Потеря приватных helpers: каждый домен получает свои `_`-функции; shared helpers (например, `_json_loads`) живут в `compat`.

## Предусловие
Ветка `fix/legacy-main-session-facade` отсутствует в `origin` и локально — конфликтов нет (зафиксировано в `STATE.json`).
