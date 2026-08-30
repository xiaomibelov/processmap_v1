# CHANGES: fix/storage-domain-split

## Итерация 1 — базовый разрез

### Карта перемещений

| старый блок `backend/app/storage.py` | новый модуль | примечание |
|--------------------------------------|--------------|------------|
| 62-463 (`storage_compat` helpers) | `backend/app/domains/storage/compat/repository.py` | low-level helpers, request scope, connection compat |
| 466-505 (`canvas/session` errors) | `backend/app/domains/storage/canvas_session/repository.py` | `DiagramStateConflictError`, `SessionNotFoundError`, `SessionTitleConflictError` |
| 595-858 (`dictionaries`) | `backend/app/domains/storage/dictionaries/repository.py` | process property metadata, reference options |
| 861-934 (`canvas/session` version helpers) | `backend/app/domains/storage/canvas_session/repository.py` | `build_session_version_payload`, `_owner_clause`, `_org_clause` |
| 937-1115 (`storage_compat` scope/sql) | `backend/app/domains/storage/compat/repository.py` | `_session_read_scope*`, `_row_value`, `_column_exists`, `_table_exists` |
| 1118-1372 (`utils` note helpers) | `backend/app/domains/storage/utils/repository.py` | `_normalize_note_*`, `_note_*_row_to_dict` |
| 1375-2949 (`storage_compat` schema) | `backend/app/domains/storage/compat/repository.py` | `_ensure_schema` |
| 2952-3134 (`platform`) | `backend/app/domains/storage/platform/repository.py` | feature flags, deployment notices, RAG settings |
| 3137-3238 (`storage_compat` legacy) | `backend/app/domains/storage/compat/repository.py` | `_read_legacy_json`, `_maybe_migrate_legacy_files` |
| 3241-3420 (`org/auth`) | `backend/app/domains/storage/org_auth/repository.py` | `_default_org_id`, `_auth_user_*` |
| 3426-3545 (`storage_compat` users) | `backend/app/domains/storage/compat/repository.py` | `_users_has_role_column`, `_get_auth_user_by_*` |
| 3548-3707 (`org/auth`) | `backend/app/domains/storage/org_auth/repository.py` | `get_auth_user_by_id`, `create_auth_user`, `update_auth_user` |
| 3840-3931 (`org/auth` bootstrap) | `backend/app/domains/storage/org_auth/repository.py` | `_ensure_workspace_record`, `_ensure_org_workspaces_bootstrap` |
| 3934-6157 (`storage_compat` core + `Storage`/`ProjectStorage`) | `backend/app/domains/storage/compat/repository.py` | row mapping, `Storage`/`ProjectStorage` method implementations |
| 6160-7030 (`org/auth`) | `backend/app/domains/storage/org_auth/repository.py` | orgs, workspaces, memberships, permissions |
| 7033-7358 (`storage_compat` admin/permissions) | `backend/app/domains/storage/compat/repository.py` | admin entity permissions, workspace folders |
| 7361-7462 (`project`) | `backend/app/domains/storage/project/repository.py` | project memberships |
| 7465-7993 (`org/auth`) | `backend/app/domains/storage/org_auth/repository.py` | org memberships, groups |
| 7996-8187 (`explorer`) | `backend/app/domains/storage/explorer/repository.py` | template folders |
| 8190-8358 (`templates/legacy`) | `backend/app/domains/storage/templates_legacy/repository.py` | templates CRUD |
| 8467-8934 (`dictionaries`) | `backend/app/domains/storage/dictionaries/repository.py` | org property dictionaries |
| 8937-9473 (`org/auth`) | `backend/app/domains/storage/org_auth/repository.py` | org invites |
| 9479-9573 (`dictionaries`) | `backend/app/domains/storage/dictionaries/repository.py` | user preferences |
| 9576-9721 (`audit/telemetry`) | `backend/app/domains/storage/audit_telemetry/repository.py` | audit log |
| 9724-10066 (`ai`) | `backend/app/domains/storage/ai/repository.py` | AI execution log |
| 10069-10225 (`canvas/session`) | `backend/app/domains/storage/canvas_session/repository.py` | AI prompt versions |
| 10228-10634 (`audit/telemetry`) | `backend/app/domains/storage/audit_telemetry/repository.py` | error events |
| 10637-10803 (`canvas/session`) | `backend/app/domains/storage/canvas_session/repository.py` | session presence |
| 10806-10994 (`storage_compat` runtime) | `backend/app/domains/storage/compat/repository.py` | `startup_db_check`, `get_project_storage`, `get_storage` helpers |
| 10997-12314 (`notes`) | `backend/app/domains/storage/notes/repository.py` | note threads, comments, mentions |
| 12317-12535 (`canvas/session`) | `backend/app/domains/storage/canvas_session/repository.py` | open notes aggregate |
| 12538-13396 (`explorer`) | `backend/app/domains/storage/explorer/repository.py` | workspace folders, tree |
| 13399-13595 (`project`) | `backend/app/domains/storage/project/repository.py` | `create_project_in_folder`, `move_project_to_folder` |
| 13598-13866 (`canvas/session`) | `backend/app/domains/storage/canvas_session/repository.py` | project session tree |
| 13875-14016 (`storage_compat` agent tables) | `backend/app/domains/storage/compat/repository.py` | `_ensure_agent_tables`, `_conversation_row_to_dict` |
| 14019-14192 (`ai`) | `backend/app/domains/storage/ai/repository.py` | agent conversations |

## Итерация 2 — закрытие review R1..R4

### R1. Детерминизм генератора

- `tools/split_storage_domains.py`:
  - `FACADE_CLASSES` и `FACADE_DEPENDENT_FUNCTIONS` заменены на кортежи.
  - `generate()` принимает `target_root` / `storage_path` для изолированного тестирования.
- Добавлен `test_generator_determinism` — два запуска с `PYTHONHASHSEED=0` и `PYTHONHASHSEED=42` дают байт-идентичный результат.

### R2. Cross-domain транзакции

- В `CHANGES.md` удалён устаревший список из 6 транзакций.
- Создан `tools/report_storage_cross_domain.py` и сгенерирован `CROSS_DOMAIN_TX.md` — полный список функций, содержащих `with _connect()` и обращающихся к другим доменам, с указанием файла:строки, затронутых доменов и типа связки (read/write).

### R3. Границы доменов

- Все cross-domain импорты классифицированы:
  - `[INTERNAL]` — оба домена остаются внутри будущего storage-сервиса.
  - `[MISPLACED]` — один из доменов (`ai`, `org_auth`, `notes`) предназначен для отдельного сервиса.
  - `[FACADE]` — импорты между внутренними доменами storage переписаны на вызовы через публичный фасад (`from ..<domain> import <public_name>`).
- Создан `MISPLACED.md` со списком и обоснованием.
- `grep`-скан: `[FACADE]` импортов через `.repository` — 0; неклассифицированных импортов — 0.

### R4. Тонкий фасад `storage.py`

- `backend/app/storage.py` переписан: классы `Storage`/`ProjectStorage` подцепляют методы динамически из `app.domains.storage.compat.repository`.
- Не-re-export кода в `storage.py` — ≤30 строк (фабрики фасадов + `_attach_compat_methods`).
- Backward-compat scan: 365 top-level имён из оригинального `storage.py` доступны через `app.storage`, missing = 0.

## Что осталось в `backend/app/storage.py`

- `get_storage()` / `get_project_storage()` — фабрики фасадов.
- `Storage` / `ProjectStorage` — тонкие фасады; методы делегируют в `compat.repository._storage_*` / `_projectstorage_*`.
- Re-exports всех публичных и приватных имён для обратной совместимости (`from app.storage import X`).

## Генератор

Скрипт `tools/split_storage_domains.py` воспроизводит разрез из исходного `backend/app/storage.py` и `entity_domain_map.json`. Детерминизм гарантируется сортированными структурами данных.
