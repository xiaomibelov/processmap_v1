# HYPOTHESIS.md — session delete/rename "not found"

## Гипотеза 1 (наиболее вероятная): повреждение системного индекса PostgreSQL

**Утверждение:**  
В каталоге PostgreSQL повреждён индекс `pg_index_indrelid_index`. Это приводит к тому, что:

- любое новое подключение backend падает на `_ensure_schema`;
- существующие соединения могут получать ложно-отрицательные результаты от `SELECT ... WHERE id=? AND org_id=?` (сессия есть, но приложение не видит её);
- `DELETE` может возвращать `rowcount=0` даже при наличии строки, что `session_repo.delete` превращает в `False`, а router тем не менее отвечает `{"ok":true}`.

**За:**
- Прямые логи PostgreSQL: `ERROR: heap tid from index tuple (4,40) points past end of heap page line pointer array at offset 161 of block 1 in index "pg_index_indrelid_index"`.
- Repro изнутри контейнера `app-api-1` воспроизводит ту же ошибку при `get_storage()`.
- Поведение "сессия есть в psql, но приложение говорит not found" характерно для повреждённых индексов.
- `session_repo.delete` ловит исключения и возвращает `False`, что позволяет ошибке БД проявляться как "not found" / молчаливая потеря delete.

**Против:**
- Не все запросы падают; большинство GET/PUT работает. Это может объясняться тем, что повреждён только определённый индекс/план и пул соединений, созданный до повреждения.

**Проверка:**
- `REINDEX SYSTEM processmap` в окне обслуживания + `REINDEX TABLE CONCURRENTLY sessions`.
- После восстановления индексов повторить repro (`get_storage()` + `session_repo.load(...)`).

---

## Гипотеза 2: RBAC/scope mismatch — пользователь видит сессию, но не может мутировать

**Утверждение:**  
Пользователи с `editor` / `org_member` / project-scoped доступом могут видеть сессии через list/read endpoints, но mutation endpoints (`PATCH`, `DELETE`) требуют владельца или админа. Legacy `patch_session` и новый `session_service.delete_session` возвращают `not found` / 403 вместо понятного сообщения.

**За:**
- В `error_events` видны rename-ошибки от пользователей, которые не являются `owner_user_id` целевых сессий.
- `session_service.delete_session` явно проверяет `owner_user_id == ctx_user_id` для не-админов.
- `Storage.delete` добавляет `AND owner_user_id = ?` для не-админов.
- `_legacy_load_session_scoped` отфильтровывает сессии, если `_project_scope_for_request` вернул `mode=scoped` и `project_id` не в allowed.

**Против:**
- Один из запросов идёт от глобального админа (`d.belov`, `is_admin=1`), для которого owner-check должен быть bypassed.

**Проверка:**
- Добавить трассировку в `patch_session` / `delete_session`, логирующую на каждом шаге: `resolved_oid`, `scope`, `role`, `is_admin`, `owner_user_id`, `rowcount`.
- Изменить API-контракт: честный 403 при недостатке прав, а не `not found`.

---

## Гипотеза 3: новый router delete возвращает успех независимо от результата

**Утверждение:**  
Даже если `_svc.delete_session` вернул `False` (сессия не найдена, ошибка БД, права), endpoint `DELETE /api/sessions/{id}` отвечает `{"ok":true}`. Пользователь думает, что удалил, а сессия остаётся. При повторной попытке UI может показать "not found", если между тем сессия исчезла из-за другого процесса.

**За:**
- Код `backend/app/routers/sessions.py:96-98` игнорирует возвращаемое значение `_svc.delete_session`.
- `session_repo.delete` глотает исключения, возвращая `False` без логирования.

**Против:**
- Телеметрия пока фиксирует rename-ошибки, а не delete-ошибки; но это может быть связано с тем, что delete не логирует failure на фронте (ответ всегда ok).

**Проверка:**
- Исправить router: возвращать 404/403 на основе результата `_svc.delete_session`.
- Добавить backend-логирование в `session_repo.delete` при исключениях.

---

## Гипотеза 4: org candidate resolution для глобального админа без org_memberships

**Утверждение:**  
Глобальный админ `d.belov` не состоит в `org_memberships` для `8b89c83ea810`. `_request_org_candidates` включает active org, поэтому load должен работать, но если active org в request отличается от org сессии (например, fallback на `org_default`), `_legacy_load_session_scoped` вернёт `None`.

**За:**
- `org_memberships` для `389893aa9e1e4823aa9b0f4498817655` в `8b89c83ea810` отсутствуют.
- `_legacy_load_session_scoped` итеративно перебирает org candidates.

**Против:**
- `trusted_org_id` в `error_events` равен `8b89c83ea810`, то есть active org в запросе совпадает с org сессии.

**Проверка:**
- Трассировка `_request_active_org_id` и `_request_org_candidates` для падающих запросов.

---

## Итоговая оценка вероятности

| Гипотеза | Вероятность | Почему |
|----------|-------------|--------|
| 1 — коррупция индекса PostgreSQL | **высокая** | Есть прямые логи, repro падает, объясняет и 404, и молчаливую потерю delete |
| 2 — RBAC mismatch | **средняя** | Объясняет ошибки не-владельцев, но не объясняет админа |
| 3 — router delete игнорирует результат | **высокая** | Прямо видно в коде; скрывает реальные ошибки удаления |
| 4 — org candidate mismatch | **низкая** | Active org совпадает с org сессии по телеметрии |

**Рекомендуемый порядок действий:**
1. Восстановить БД (гипотеза 1) — блокирует всё остальное.
2. Исправить API-контракт delete (гипотеза 3) и логирование исключений в `session_repo.delete`.
3. Унифицировать RBAC для rename/delete, чтобы выдавать честный 403 вместо `not found` (гипотеза 2).
4. Добавить runtime tracing для однозначной диагностики гипотезы 4.
