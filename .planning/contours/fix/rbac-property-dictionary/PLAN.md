# Plan: fix/rbac-property-dictionary

## Goal

Закрыть 10 эндпоинтов `org_property_dictionary.py` от `open-within-org` до role-based авторизации.

## Source Truth

- Repo: `/root/processmap_v1`
- Branch: `fix/rbac-property-dictionary`
- HEAD: `b3b93dd50ccfa418e1af2c701510df0a0f0d03b1`
- Base truth: `main`

## Scope

### Allowed files

- `backend/app/routers/org_property_dictionary.py`
- `backend/tests/test_org_property_dictionary_rbac.py` (new)
- `.planning/contours/fix/rbac-property-dictionary/PR.md` (new)

### Endpoints (10)

1. `GET /api/orgs/{org_id}/property-dictionary/operations`
2. `POST /api/orgs/{org_id}/property-dictionary/operations`
3. `PATCH /api/orgs/{org_id}/property-dictionary/operations/{operation_key}`
4. `GET /api/orgs/{org_id}/property-dictionary/operations/{operation_key}`
5. `POST /api/orgs/{org_id}/property-dictionary/operations/{operation_key}/properties`
6. `PATCH /api/orgs/{org_id}/property-dictionary/operations/{operation_key}/properties/{property_key}`
7. `DELETE /api/orgs/{org_id}/property-dictionary/operations/{operation_key}/properties/{property_key}`
8. `POST /api/orgs/{org_id}/property-dictionary/operations/{operation_key}/properties/{property_key}/values`
9. `PATCH /api/orgs/{org_id}/property-dictionary/values/{value_id}`
10. `DELETE /api/orgs/{org_id}/property-dictionary/values/{value_id}`

### Authz mapping

- **Read (GET)** → `ORG_READ_ROLES` (viewer+).
- **Write (POST/PATCH/DELETE)** → `ORG_WRITE_ROLES` (org_admin/owner).
- Консервативно: любые сомнения — org_admin/owner.

### Non-goals

- Не менять storage-функции.
- Не добавлять новые роли/флаги.
- Не менять поведение dictionary за пределами authz.

## Implementation Steps

### Task 1: Add role helpers

**Files:** `backend/app/routers/org_property_dictionary.py`

- [ ] Import `ORG_READ_ROLES`, `ORG_WRITE_ROLES`, `is_role_allowed` from `..utils.authz`.
- [ ] Modify `_ensure_org_member` to return role.
- [ ] Add `_require_org_role(request, org_id, allowed_roles)` helper.

### Task 2: Apply role checks

**Files:** `backend/app/routers/org_property_dictionary.py`

- [ ] GET endpoints — `_ensure_org_member` + `_require_org_role(..., ORG_READ_ROLES)`.
- [ ] POST/PATCH/DELETE endpoints — `_ensure_org_member` + `_require_org_role(..., ORG_WRITE_ROLES)`.

### Task 3: Tests

**Files:** `backend/tests/test_org_property_dictionary_rbac.py` (new)

- [ ] Set up org, users (org_admin, editor, viewer).
- [ ] `test_viewer_get_operations_returns_200`.
- [ ] `test_viewer_post_operations_returns_403`.
- [ ] `test_org_admin_post_operations_returns_200`.

### Task 4: Validation

- [ ] `PYTHONPATH=. .venv/bin/pytest tests/test_org_property_dictionary_rbac.py -v`
- [ ] `git diff --check`

### Task 5: Commit and PR.md

- [ ] Скоммитить с сообщением:
  ```
  fix(rbac): ограничить org_property_dictionary по ролям

  - GET: ORG_READ_ROLES (viewer+)
  - POST/PATCH/DELETE: ORG_WRITE_ROLES (org_admin/owner)
  - tests: viewer 403 на write, 200 на read
  ```
- [ ] Написать `.planning/contours/fix/rbac-property-dictionary/PR.md`.
- [ ] Остановиться и запросить explicit approve для push.

## Validation

- `git diff --check` — без whitespace-ошибок.
- Новые тесты проходят.
- Только scoped файлы изменены.

## Runtime Proof

- `pytest` output.
- `git diff --stat`.
