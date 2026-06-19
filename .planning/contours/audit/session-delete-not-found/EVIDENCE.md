# EVIDENCE.md — session delete/rename "not found"

## 1. Инфраструктура и доступ

### 1.1 Контейнеры продакшн

```text
CONTAINER ID   NAMES                              IMAGE                            STATUS                  PORTS
4ac375c75072   app-api-1                          app-api                          Up 45 hours (healthy)   8000/tcp
78f23872df18   app-gateway-1                      app-gateway:may2                 Up 45 hours (healthy)   80/tcp, 0.0.0.0:443->443/tcp, [::]:443->443/tcp
e44b906c3e1a   app-frontend-1                     app-frontend                     Up 45 hours             5177/tcp
b9f79d6dad96   app-celery-worker-1                app-celery-worker                Up 45 hours             8000/tcp
0127d812948f   app-postgres-1                     postgres:16-alpine               Up 45 hours (healthy)   5432/tcp
b1c8ca31c9a8   app-redis-1                        redis:7.2-alpine                 Up 45 hours (healthy)   6379/tcp
```

### 1.2 Mounts backend-контейнера

```json
[
  {"Type":"bind","Source":"/opt/processmap/app/backend","Destination":"/app/backend","Mode":"rw","RW":true},
  {"Type":"bind","Source":"/opt/processmap/data/prod/workspace","Destination":"/app/workspace","Mode":"rw","RW":true}
]
```

Продакшн-код живёт в `/opt/processmap/app`, а не в `/home/deploy/app` и не в `/opt/processmap-test`.

### 1.3 Состояние git в продакшн-дереве

```text
HEAD: dbda26e6775964df948409280e979039d8cb56d6
branch: main
origin/main: behind 970 commits
working tree: содержит множество незакоммиченных/добавленных файлов относительно origin/main
```

---

## 2. База данных — сессии существуют

### 2.1 Проверка наличия затронутых сессий

```sql
SELECT id, title, owner_user_id, org_id, project_id, mode, updated_at, created_at
FROM sessions
WHERE id IN ('ae3c10de70','ef1f5f3ec2','33fa95e978');
```

```text
id          | title                                 | owner_user_id                    | org_id       | project_id   | mode           | updated_at | created_at
ae3c10de70  | Салат Цезарь с куриной грудкой гриль  | 32aab52e519f4c00828778fdb6c3fbc6 | 8b89c83ea810 | 62c89a9a4d   | quick_skeleton | 1780575018 | 1780573721
33fa95e978  | Меренга Торт Бенто "С днем рождения"  | b9df018741be499388b7f12f51f7b4fd | 8b89c83ea810 | 5f6d6ca103   | quick_skeleton | 1781766039 | 1780670154
```

`ef1f5f3ec2` не найдена — возможно, уже удалена или ID из другого контекста.

### 2.2 Индексы таблицы sessions

```text
indexname                       indexdef
sessions_pkey                   CREATE UNIQUE INDEX sessions_pkey ON public.sessions USING btree (id)
idx_sessions_org_project_updated CREATE INDEX idx_sessions_org_project_updated ON public.sessions USING btree (org_id, project_id, updated_at DESC)
idx_sessions_owner_updated      CREATE INDEX idx_sessions_owner_updated ON public.sessions USING btree (owner_user_id, updated_at DESC)
idx_sessions_project            CREATE INDEX idx_sessions_project ON public.sessions USING btree (project_id)
```

---

## 3. Телеметрия — frontend видит "not found"

### 3.1 Последние rename-ошибки (PATCH /api/sessions/{id})

```sql
SELECT id, occurred_at, user_id, org_id, message, context_json
FROM error_events
WHERE event_type='api_failure' AND message='not found' AND context_json LIKE '%PATCH%/api/sessions/%'
ORDER BY occurred_at DESC
LIMIT 17;
```

```text
id                occurred_at  user_id                           org_id        message    context_json
evt_e4e417f57593  1781767480   389893aa9e1e4823aa9b0f4498817655  8b89c83ea810  not found  {"method":"PATCH","endpoint":"/api/sessions/ae3c10de70","url":"/api/sessions/ae3c10de70","status":404,...}
evt_17508b302f35  1781767478   389893aa9e1e4823aa9b0f4498817655  8b89c83ea810  not found  .../api/sessions/ae3c10de70...
evt_efe2cf1654e9  1781766776   389893aa9e1e4823aa9b0f4498817655  8b89c83ea810  not found  .../api/sessions/ef1f5f3ec2...
evt_356921b7a7c2  1781766774   389893aa9e1e4823aa9b0f4498817655  8b89c83ea810  not found  .../api/sessions/ef1f5f3ec2...
evt_7ae4efcc704d  1781766210   4f275591fb154c69b4528611c2f845e0  8b89c83ea810  not found  .../api/sessions/33fa95e978...
evt_ea0637af55dd  1781703450   c0fe369194cb451c9d1e6e7c30d86b64  8b89c83ea810  not found  .../api/sessions/0f5c72ec39...
evt_4c55699ada5e  1781679058   c0fe369194cb451c9d1e6e7c30d86b64  8b89c83ea810  not found  .../api/sessions/99d940ed4f...
evt_1d80478052b8  1781644569   b9df018741be499388b7f12f51f7b4fd  8b89c83ea810  not found  .../api/sessions/4f07aeba57...
...
```

### 3.2 Распределение по часам

```text
hour                  count
2026-06-15 11:00:00   107
2026-06-15 10:00:00    39
2026-06-15 13:00:00    30
2026-06-16 07:00:00    11
2026-06-16 13:00:00     8
```

---

## 4. Пользователи и членство в организации

### 4.1 Учётные записи

```sql
SELECT id, email, is_admin FROM users WHERE id IN (...);
```

```text
id                                email                     is_admin
32aab52e519f4c00828778fdb6c3fbc6  n.naumenko@automacon.ru   0
389893aa9e1e4823aa9b0f4498817655  d.belov@automacon.ru      1   <-- global admin, инициатор rename ae3c10de70
4f275591fb154c69b4528611c2f845e0  ai.mikhaylov@automacon.ru 0
b9df018741be499388b7f12f51f7b4fd  v.erofeev@automacon.ru    0
c0fe369194cb451c9d1e6e7c30d86b64  a.pavlichenko@techvill.ru 0
```

### 4.2 Орг-членство

```sql
SELECT user_id, org_id, role FROM org_memberships
WHERE org_id='8b89c83ea810' AND user_id IN (...);
```

```text
user_id                           org_id        role
32aab52e519f4c00828778fdb6c3fbc6  8b89c83ea810  org_admin
4f275591fb154c69b4528611c2f845e0  8b89c83ea810  org_admin
b9df018741be499388b7f12f51f7b4fd  8b89c83ea810  editor
c0fe369194cb451c9d1e6e7c30d86b64  8b89c83ea810  editor
```

**Глобальный администратор `d.belov` (389893...) не состоит в `org_memberships`** для активной организации `8b89c83ea810`.

### 4.3 Project-членство

```sql
SELECT user_id, org_id, project_id, role FROM project_memberships
WHERE org_id='8b89c83ea810' AND user_id IN (...);
```

```text
(0 rows)
```

---

## 5. PostgreSQL — коррупция индекса

### 5.1 Логи контейнера app-postgres-1

```text
2026-06-16 11:01:06.474 UTC [1667] ERROR:  canceling autovacuum task
2026-06-16 11:01:29.919 UTC [1751] ERROR:  REINDEX CONCURRENTLY cannot be executed from a function
2026-06-16 11:11:36.783 UTC [2722] ERROR:  heap tid from index tuple (4,40) points past end of heap page line pointer array at offset 161 of block 1 in index "pg_index_indrelid_index"
2026-06-16 11:11:36.939 UTC [2729] ERROR:  heap tid from index tuple (4,40) points past end of heap page line pointer array at offset 161 of block 1 in index "pg_index_indrelid_index"
2026-06-16 11:11:37.066 UTC [2736] ERROR:  heap tid from index tuple (4,40) points past end of heap page line pointer array at offset 161 of block 1 in index "pg_index_indrelid_index"
2026-06-18 07:37:17.170 UTC [224598] ERROR:  heap tid from index tuple (4,40) points past end of heap page line pointer array at offset 161 of block 1 in index "pg_index_indrelid_index"
2026-06-18 07:39:03.874 UTC [224769] ERROR:  heap tid from index tuple (4,40) points past end of heap page line pointer array at offset 161 of block 1 in index "pg_index_indrelid_index"
```

### 5.2 Попытка загрузить storage из Python (read-only repro)

```bash
docker exec app-api-1 python -c "
import sys, os
os.environ.setdefault('FPC_DB_BACKEND','postgres')
os.environ.setdefault('DATABASE_URL','postgresql://fpc:...@app-postgres-1:5432/processmap')
sys.path.insert(0, '/app/backend')
from app.repositories import session_repo
from app.storage import get_storage
st = get_storage()
sess = session_repo.load('ae3c10de70', org_id='8b89c83ea810', is_admin=True)
"
```

```text
psycopg.errors.IndexCorrupted: heap tid from index tuple (4,40) points past end
of heap page line pointer array at offset 161 of block 1 in index "pg_index_indrelid_index"
```

То же самое происходит при вызове `get_storage()` — `_ensure_schema` пытается создать `idx_sessions_parent_element` и падает на проверке существующих индексов.

### 5.3 Отсутствующий индекс

```sql
SELECT indexname FROM pg_indexes WHERE tablename='sessions' AND indexname='idx_sessions_parent_element';
```

```text
(0 rows)
```

---

## 6. Код продакшн — точки отказа

### 6.1 `backend/app/_legacy_main.py::patch_session` (строки ~4014)

```python
@app.patch("/api/sessions/{session_id}")
def patch_session(session_id: str, inp: UpdateSessionIn, request: Request = None) -> Dict[str, Any]:
    user = _request_auth_user(request) if request is not None else {}
    user_id = str(user.get("id") or "").strip() if isinstance(user, dict) else ""
    is_admin = bool(user.get("is_admin", False)) if isinstance(user, dict) else False
    effective_is_admin = is_admin or request is None
    st = get_storage()
    sess, oid, _ = _legacy_load_session_scoped(session_id, request)
    if not sess:
        return {"error": "not found"}          # <-- HTTP 200 + error body
    ...
    if "title" in data and data["title"] is not None:
        if not _can_edit_workspace(role, is_admin=effective_is_admin):
            raise HTTPException(status_code=403, detail="forbidden")
        ...
        sess2 = st.rename(session_id, title, user_id=user_id, is_admin=True)
        if not sess2:
            return {"error": "not found"}      # <-- HTTP 200 + error body
```

### 6.2 `backend/app/_legacy_main.py::delete_session_api` (строки ~4304)

```python
@app.delete("/api/sessions/{session_id}")
def delete_session_api(session_id: str, request: Request = None):
    sid = str(session_id or "").strip()
    if not sid:
        return {"ok": False, "error": "session_not_found", "session_id": str(session_id)}
    sess, oid, _ = _legacy_load_session_scoped(sid, request)
    if not sess:
        return {"ok": False, "error": "session_not_found", "session_id": sid}
    role = _org_role_for_request(request, oid) if request is not None and oid else ""
    user = _request_auth_user(request) if request is not None else {}
    is_admin = bool(user.get("is_admin", False)) if isinstance(user, dict) else False
    if not _can_delete_workspace_content(role, is_admin=is_admin):
        raise HTTPException(status_code=403, detail="forbidden")
    st = get_storage()
    deleted = st.delete(sid, org_id=oid, is_admin=True)
    if not deleted:
        return {"ok": False, "error": "session_not_found", "session_id": sid}
    ...
```

### 6.3 `backend/app/services/session_service.py::delete_session`

```python
def delete_session(session_id: str, *, ..., request: Optional[Any] = None) -> bool:
    ctx = _request_context(request)
    ctx_user_id = user_id if user_id is not None else ctx.get("user_id")
    ctx_org_id  = org_id  if org_id  is not None else ctx.get("org_id")
    ctx_is_admin = is_admin if is_admin is not None else ctx.get("is_admin")
    sess = session_repo.load(session_id, org_id=ctx_org_id, is_admin=True)
    if not sess:
        return False
    if not ctx_is_admin:
        owner_id = str(getattr(sess, "owner_user_id", "") or "").strip()
        if not ctx_user_id or not owner_id or owner_id != str(ctx_user_id or "").strip():
            raise HTTPException(status_code=403, detail="Только владелец сессии может её удалить.")
    return session_repo.delete(session_id, user_id=ctx_user_id, org_id=ctx_org_id, is_admin=ctx_is_admin)
```

### 6.4 `backend/app/routers/sessions.py::delete_session_api` (новый router)

```python
@router.delete('/api/sessions/{session_id}')
def delete_session_api(session_id: str, request: Request = None):
    _svc.delete_session(session_id, request=request)
    return {"ok": True}            # <-- результат delete игнорируется
```

### 6.5 `backend/app/repositories/session_repo.py::delete`

```python
def delete(...):
    st = get_storage()
    try:
        st.delete(session_id, user_id=user_id, is_admin=is_admin, org_id=org_id)
        return True
    except Exception:
        return False                 # <-- исключения глотаются
```

### 6.6 Frontend `okOrError` — интерпретация тела как статус

```javascript
export function okOrError(r) {
  if (!r.ok) return r;
  if (r.data && typeof r.data === "object" && !Array.isArray(r.data) && (r.data.error || r.data.detail)) {
    const errText = normalizeApiErrorText(r.data.error || r.data.detail || r.data) || "request failed";
    const marker = errText.toLowerCase();
    const inferredStatus = marker.includes("not found")
      ? 404
      : marker.includes("unauthorized")
        ? 401
        : marker.includes("forbidden")
          ? 403
          : ...;
    void reportApiFailureEvent({ ..., status: inferredStatus, errorName: "ok_error_payload" });
    return { ...r, ok: false, status: inferredStatus, error: errText };
  }
  return r;
}
```

---

## 7. Audit log — удаления ранее проходили

```sql
SELECT action, entity_type, COUNT(*) FROM audit_log
WHERE action IN ('session.delete','session.update') GROUP BY action, entity_type;
```

```text
action       | entity_type | count
session.delete | session     |   105
session.update | session     | 29815
```

Последние 3 удаления:

```text
aud_7fc0093cc7d8  1781164717  4f275591...  8b89c83ea810  afa015283c  ok
aud_7e9f17fff557  1781164391  4f275591...  8b89c83ea810  611ec94276  ok
aud_6e8c7112d4d9  1780998262  4f275591...  8b89c83ea810  62099b462d  ok
```

Это показывает, что функция удаления работала для владельцев/админов до начала всплеска ошибок.
