# PREMIUM/URGENT audit: session delete/rename → "not found"

Контур: `audit/session-delete-not-found`  
Хост: `deploy@45.87.104.206` (`clearvestnic.ru` / `processmap.ru`)  
Репозиторий продакшн-кода: `/opt/processmap/app` (HEAD `dbda26e6`, ветка `main` отстаёт от `origin/main` на ~970 коммитов)  
Канонический dev-репозиторий: `/opt/processmap-test` (ветка `fix/bpmn-drilldown-ui`, HEAD `7f6232e2`)  
Доступ: SSH password auth (ключ `processmap_v1_deploy_key` не авторизован на сервере)  
Режим: **только read-only**. Никаких изменений на продакшн-сервере произведено не было.

## Краткий вывод (executive summary)

На продакшн-сервере зафиксировано два независимых, но усиливающих друг друга класса проблем:

1. **База данных PostgreSQL повреждена**: системный каталогный индекс `pg_index_indrelid_index` выдаёт `IndexCorrupted`. Любое новое подключение приложения падает на `_ensure_schema` при попытке `CREATE INDEX IF NOT EXISTS`. Уже работающие воркеры держат старые соединения, но коррупция может давать ложно-отрицательные результаты `SELECT`/`DELETE` (сессия "есть", но приложение получает `not found`).
2. **Код разрешений mute-ит ошибки и маскирует 403 как 404**: `session_repo.delete` ловит все исключения и возвращает `False`; новый router `DELETE /api/sessions/{id}` игнорирует результат `_svc.delete_session` и всегда возвращает `{"ok": true}`. `PATCH /api/sessions/{id}` возвращает тело `{"error":"not found"}` c HTTP 200, а фронтенд (`okOrError`) интерпретирует это как 404. При этом `delete_session` в `session_service.py` жёстко требует владельца/админа — пользователи с project-уровнем доступа видят сессию, но получают 403 (для удаления) или `not found` (для rename).

**Риск:** любой перезапуск контейнеров `app-api-1` / `app-postgres-1` сейчас скорее всего приведёт к полному отказу приложения, потому что `_ensure_schema` не сможет создать индекс `idx_sessions_parent_element` из-за повреждённого системного индекса.

## 5-plane proof

### 1. Symptom plane

Пользователь сообщает: при попытке удалить или переименовать существующую сессию приходит ответ "not found".

Подтверждение в телеметрии (`error_events`):

```
method  endpoint                    status (инференс фронта)  message
PATCH   /api/sessions/ae3c10de70    404                       not found
PATCH   /api/sessions/ef1f5f3ec2    404                       not found
PATCH   /api/sessions/33fa95e978    404                       not found
PATCH   /api/sessions/0f5c72ec39    404                       not found
PATCH   /api/sessions/99d940ed4f    404                       not found
PATCH   /api/sessions/4f07aeba57    404                       not found
PATCH   /api/sessions/578dfe9233    404                       not found
PATCH   /api/sessions/a9327ed0b1    404                       not found
```

Запросы идут от разных пользователей (включая глобального администратора `d.belov@automacon.ru`, `is_admin=1`) к сессиям, которые физически присутствуют в БД.

### 2. Log plane

- PostgreSQL logs (`app-postgres-1`, `--since 48h`) содержат повторяющиеся ошибки коррупции:

```text
2026-06-16 11:11:36.783 UTC [2722] ERROR:  heap tid from index tuple (4,40) points past end of heap page line pointer array at offset 161 of block 1 in index "pg_index_indrelid_index"
2026-06-16 11:11:36.939 UTC [2729] ERROR:  heap tid from index tuple (4,40) points past end of heap page line pointer array at offset 161 of block 1 in index "pg_index_indrelid_index"
2026-06-18 07:37:17.170 UTC [224598] ERROR:  heap tid from index tuple (4,40) points past end of heap page line pointer array at offset 161 of block 1 in index "pg_index_indrelid_index"
2026-06-18 07:39:03.874 UTC [224769] ERROR:  heap tid from index tuple (4,40) points past end of heap page line pointer array at offset 161 of block 1 in index "pg_index_indrelid_index"
```

- Также зафиксирована попытка `REINDEX CONCURRENTLY` из функции и `canceling autovacuum task`, что указывает на предыдущие попытки починки индекса.

- Backend access logs показывают `PATCH /api/sessions/{id} 200 OK`, но тело ответа содержит `{"error":"not found"}`; фронтендный слой `okOrError` превращает это в 404.

### 3. State plane

- Сессии, на которые жаловались, присутствуют в БД:

```text
id            | title                                 | owner_user_id                    | org_id       | project_id
ae3c10de70    | Салат Цезарь с куриной грудкой гриль  | 32aab52e519f4c00828778fdb6c3fbc6 | 8b89c83ea810 | 62c89a9a4d
33fa95e978    | Меренга Торт Бенто "С днем рождения"  | b9df018741be499388b7f12f51f7b4fd | 8b89c83ea810 | 5f6d6ca103
```

- Пользователь `389893aa9e1e4823aa9b0f4498817655` (d.belov), инициировавший rename `ae3c10de70`, является глобальным администратором (`users.is_admin = 1`), но **не состоит в `org_memberships`** для `8b89c83ea810`.
- `project_memberships` для этих пользователей пусты.
- Индексы таблицы `sessions`:

```text
sessions_pkey
idx_sessions_org_project_updated
idx_sessions_owner_updated
idx_sessions_project
```

- В схеме отсутствует ожидаемый `_ensure_schema` индекс `idx_sessions_parent_element`; его создание падает с `IndexCorrupted`.

### 4. Code plane

- `backend/app/_legacy_main.py::patch_session` возвращает `{"error":"not found"}` в двух местах:
  - если `_legacy_load_session_scoped(session_id, request)` вернул `None`;
  - если `st.rename(...)` вернул `None`.
- `_legacy_load_session_scoped` бежит по `_request_org_candidates(request, oid)` и применяет `_project_scope_for_request`; если scope `mode=scoped` и `project_id` сессии не в `allowed`, возвращает `None`.
- `backend/app/services/session_service.py::delete_session`:

```python
if not ctx_is_admin:
    owner_id = str(getattr(sess, "owner_user_id", "") or "").strip()
    if not ctx_user_id or not owner_id or owner_id != str(ctx_user_id or "").strip():
        raise HTTPException(status_code=403, detail="Только владелец сессии может её удалить.")
```

- `backend/app/repositories/session_repo.py::delete`:

```python
try:
    st.delete(session_id, ...)
    return True
except Exception:
    return False
```

- `backend/app/routers/sessions.py::delete_session_api`:

```python
_svc.delete_session(session_id, request=request)
return {"ok": True}
```

- Фронтенд `frontend/src/lib/apiCore.js::okOrError` интерпретирует `r.data.error === "not found"` как статус 404.

### 5. Dependency plane

- Продакшн работает в Docker Compose project `app` (`/opt/processmap/app`):
  - `app-api-1` — uvicorn backend, mount `/opt/processmap/app/backend` → `/app/backend`;
  - `app-postgres-1` — PostgreSQL 16-alpine;
  - `app-frontend-1`, `app-celery-worker-1`, `app-redis-1`, `app-gateway-1`.
- Продакшн-код сильно отличается от dev-ветки `/opt/processmap-test`: локальная `main` в `/opt/processmap/app` отстаёт от `origin/main` на ~970 коммитов, содержит незакоммиченные/добавленные файлы.
- Версия PostgreSQL: `postgres:16-alpine`.
- Повреждён системный каталог `pg_index_indrelid_index`; любое новое подключение падает на `_ensure_schema`.

## Критические риски

1. **Перезапуск = downtime.** Если перезапустить `app-api-1` или `app-postgres-1`, новые подключения backend к PostgreSQL не смогут пройти `_ensure_schema` из-за `IndexCorrupted`.
2. **Молчаливая потеря delete.** `DELETE /api/sessions/{id}` возвращает `{"ok":true}` даже если `_svc.delete_session` вернул `False` (например, из-за повреждения индекса или прав). Пользователь думает, что удалил, а сессия осталась.
3. **Путаница 403/404.** Rename/delete не-владельцами возвращает `not found` вместо честного 403, что затрудняет диагностику.

## Рекомендации (read-only, требуют approve)

1. Сделать полный логический бэкап БД (`pg_dumpall` / `pg_dump`) перед любыми действиями.
2. Восстановить целостность PostgreSQL: `REINDEX SYSTEM processmap` (или пересоздать индекс `pg_index_indrelid_index`) в окне обслуживания.
3. Проверить индексы пользовательских таблиц (`REINDEX TABLE CONCURRENTLY sessions`, `error_events`, `session_state_versions`).
4. Исправить контракты API:
   - `DELETE /api/sessions/{id}` должен возвращать ошибку, если `_svc.delete_session` вернул `False`;
   - `session_repo.delete` не должен глотать исключения без логирования;
   - rename/delete не-владельцами должны возвращать 403, а не 404/`not found`.
5. Провести исправления сначала на стенде `processmap_stage`, затем — по плану rollout — на продакшн.

## Статус

- Audit завершён.
- Артефакты: `AUDIT.md`, `EVIDENCE.md`, `HYPOTHESIS.md`, `NOGO.md`, `STATE.json`.
- Явный user approve требуется для любых write-операций на продакшн-сервере или в коде.
