# API Specification — «Пользователи и доступ» redesign

> Контур: `feature/user-access-redesign`

---

## 1. Endpoints (без изменения URL)

| Method | Route | Изменения |
|---|---|---|
| GET | `/api/admin/users` | В `memberships[]` добавлено поле `permissions`. |
| POST | `/api/admin/users` | Принимает `memberships[].permissions`. |
| PATCH | `/api/admin/users/{user_id}` | Принимает `memberships[].permissions`. |

---

## 2. Permission schema

```json
{
  "view": true,
  "create": false,
  "edit": false,
  "export": false,
  "delete": false,
  "manage_users": false
}
```

- Все ключи обязательны в ответе API.
- В запросе ключи опциональны; отсутствующие значения заполняются по шаблону роли.
- `view` всегда `true`.

### Шаблон по роли

| Роль | view | create | edit | export | delete | manage_users |
|---|---|---|---|---|---|---|
| `org_viewer` | true | false | false | false | false | false |
| `editor` | true | true | true | true | false | false |
| `org_admin` | true | true | true | true | true | true |

---

## 3. Pydantic models (backend/app/routers/admin.py)

```python
class AdminUserPermissionSet(BaseModel):
    view: bool = True
    create: bool = False
    edit: bool = False
    export: bool = False
    delete: bool = False
    manage_users: bool = False


class AdminUserMembershipIn(BaseModel):
    org_id: str
    role: str = "org_viewer"
    permissions: Optional[AdminUserPermissionSet] = None
```

`AdminUserCreateBody` и `AdminUserPatchBody` не меняются (они используют `AdminUserMembershipIn`).

---

## 4. Response shape

### GET /api/admin/users

```json
{
  "ok": true,
  "items": [
    {
      "id": "usr_...",
      "email": "user@example.com",
      "full_name": "Иван Петров",
      "job_title": "Аналитик",
      "is_active": true,
      "is_admin": false,
      "created_at": 1718880000,
      "memberships": [
        {
          "org_id": "org_a",
          "org_name": "Alpha",
          "role": "editor",
          "created_at": 1718880000,
          "permissions": {
            "view": true,
            "create": true,
            "edit": true,
            "export": true,
            "delete": false,
            "manage_users": false
          }
        }
      ]
    }
  ],
  "count": 1
}
```

### POST /api/admin/users, PATCH /api/admin/users/{id}

```json
{
  "ok": true,
  "item": { /* тот же payload, что и в GET */ }
}
```

---

## 5. Storage changes (backend/app/storage.py)

### Schema migration

Добавить в `org_memberships` колонку:

```sql
ALTER TABLE org_memberships ADD COLUMN permissions_json TEXT NOT NULL DEFAULT '{}';
```

Для SQLite `DEFAULT '{}'`, для Postgres — `DEFAULT '{}'::jsonb`? Поскольку в проекте используется универсальный SQL через `_translate_sql_for_postgres`, текстовое поле с JSON строкой проще и не требует JSONB. Используем `TEXT DEFAULT '{}'`.

**Где добавлять:** в `_ensure_schema()` рядом с созданием `org_memberships` (для новых БД) и отдельная idempotent миграция для существующих БД (проверка `PRAGMA table_info` / `information_schema.columns`).

### Functions

#### `upsert_org_membership`

```python
def upsert_org_membership(
    org_id: str,
    user_id: str,
    role: str,
    permissions: Optional[Dict[str, bool]] = None,
) -> Dict[str, Any]:
    ...
```

- `permissions` сериализуется в JSON и сохраняется в `permissions_json`.
- Если `permissions is None`, записывается `{}` (UI применит шаблон по роли).

#### `list_user_org_memberships`

- В SELECT добавить `m.permissions_json`.
- В возвращаемый item добавить `permissions: dict` (parsed JSON или fallback-шаблон по роли).

#### `list_org_memberships`

- Аналогично: вернуть `permissions` для каждого membership.

#### `_normalize_org_membership_role`

Не меняется; продолжает нормализовать роли к `org_admin`/`editor`/`org_viewer`.

---

## 6. Admin router changes

### `_normalize_admin_memberships`

- Принимает `AdminUserMembershipIn` с опциональным `permissions`.
- Если `permissions` отсутствует — не заполнять; передавать `None` в storage.
- Если `permissions` передан — валидировать, что это dict с булевыми значениями.

### `_replace_user_memberships`

- Получает `memberships: List[Dict[str, Any]]`, где каждый dict содержит `org_id`, `role`, `permissions` (Optional).
- Для каждого membership вызывает `upsert_org_membership(..., permissions=...)`, затем читает сохранённое состояние.

### `_membership_payload_for_user`

- Добавить `permissions` в item.
- Fallback: если `permissions_json` пустой/невалидный, вернуть шаблон по роли.

---

## 7. Frontend API helpers

### `frontend/src/lib/apiModules/adminApi.js`

`apiAdminCreateUser` / `apiAdminPatchUser` должны пробрасывать `permissions`:

```js
body.memberships = membershipsRaw.map((row) => ({
  org_id: String(row?.org_id || "").trim(),
  role: String(row?.role || "org_viewer").trim() || "org_viewer",
  permissions: row?.permissions && typeof row.permissions === "object"
    ? {
        view: row.permissions.view !== false,
        create: row.permissions.create === true,
        edit: row.permissions.edit === true,
        export: row.permissions.export === true,
        delete: row.permissions.delete === true,
        manage_users: row.permissions.manage_users === true,
      }
    : undefined,
})).filter((row) => row.org_id);
```

---

## 8. Backward compatibility

- Старые клиенты, не знающие `permissions`, продолжают работать: backend хранит `{}` и возвращает fallback-шаблон.
- Старые membership'ы в БД получают `permissions_json = '{}'`, UI отобразит шаблон по роли.
- Существующие тесты, проверяющие только `role`, не сломаются.

---

## 9. Authz-граница

- **В этом контуре не меняем** `backend/app/utils/authz.py` и ролевые проверки в роутах.
- `permissions` — это договорённость между UI и API; фактический доступ по-прежнему определяется `role`.
- В последующем контуре можно заменить `ORG_WRITE_ROLES` на `permissions.delete/manage_users`, а `ORG_READ_ROLES` на `permissions.view`.
