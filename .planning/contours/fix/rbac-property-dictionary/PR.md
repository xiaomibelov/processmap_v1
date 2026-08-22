# PR: fix(rbac): ограничить org_property_dictionary по ролям

**Ветка:** `fix/rbac-property-dictionary`  
**База:** `main`  
**Контур:** `.planning/contours/fix/rbac-property-dictionary/`

## Что изменено

Все 10 эндпоинтов `org_property_dictionary.py` переведены с `open-within-org` (любой member) на role-based авторизацию.

## Mapping операций → роли

| Метод | Эндпоинт | Роль |
|-------|----------|------|
| GET | `/api/orgs/{id}/property-dictionary/operations` | `ORG_READ_ROLES` (viewer+) |
| POST | `/api/orgs/{id}/property-dictionary/operations` | `ORG_WRITE_ROLES` (org_admin/owner) |
| PATCH | `/api/orgs/{id}/property-dictionary/operations/{key}` | `ORG_WRITE_ROLES` |
| GET | `/api/orgs/{id}/property-dictionary/operations/{key}` | `ORG_READ_ROLES` |
| POST | `/api/orgs/{id}/property-dictionary/operations/{key}/properties` | `ORG_WRITE_ROLES` |
| PATCH | `/api/orgs/{id}/property-dictionary/operations/{key}/properties/{key}` | `ORG_WRITE_ROLES` |
| DELETE | `/api/orgs/{id}/property-dictionary/operations/{key}/properties/{key}` | `ORG_WRITE_ROLES` |
| POST | `/api/orgs/{id}/property-dictionary/operations/{key}/properties/{key}/values` | `ORG_WRITE_ROLES` |
| PATCH | `/api/orgs/{id}/property-dictionary/values/{id}` | `ORG_WRITE_ROLES` |
| DELETE | `/api/orgs/{id}/property-dictionary/values/{id}` | `ORG_WRITE_ROLES` |

## Роли

- `ORG_READ_ROLES` = `{org_owner, org_admin, project_manager, editor, viewer, org_viewer, auditor}`
- `ORG_WRITE_ROLES` = `{org_owner, org_admin}`
- Platform admin (`is_admin=True`) сохраняет полный доступ.

## Изменённые файлы

- `backend/app/routers/org_property_dictionary.py`:
  - Добавлены импорты `ORG_READ_ROLES`, `ORG_WRITE_ROLES`, `is_role_allowed`.
  - `_ensure_org_member` теперь возвращает роль.
  - Добавлен `_require_org_role(request, org_id, allowed_roles)`.
  - Все GET-эндпоинты используют `ORG_READ_ROLES`.
  - Все POST/PATCH/DELETE используют `ORG_WRITE_ROLES`.
- `backend/tests/test_org_property_dictionary_rbac.py` — новый тестовый файл.

## Тесты

- `test_viewer_get_operations_returns_200` — viewer может читать.
- `test_viewer_post_operations_returns_403` — viewer не может mutировать.
- `test_org_admin_post_operations_returns_200` — org admin может mutировать.

## Проверка

```bash
cd backend
PYTHONPATH=. .venv/bin/pytest tests/test_org_property_dictionary_rbac.py -v
PYTHONPATH=. .venv/bin/pytest tests/test_session_read_rbac.py tests/test_workspace_access_controls.py -v
```

Результат: 26 passed.

## Риски

- `org_property_dictionary` раньше был открыт любому member org. Теперь write-операции доступны только org_admin/owner. Пользователи с ролями editor/viewer, которые раньше могли изменять dictionary, теперь получат 403.

## Merge / Deploy

**No merge/deploy без explicit approve.**
