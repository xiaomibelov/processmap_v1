# PR — fix/rbac-gaps

## Название
fix(rbac): enforce granular permissions_json for 5 P0-P1 authz gaps

## Описание
В `feature/user-access-redesign` появилось поле `org_memberships.permissions_json` (view/create/edit/export/delete/manage_users), которое сохраняется через admin API/UI, но не применялось в authz-слое. Этот PR закрывает 5 критичных/высокоприоритетных gap'ов, добавляя проверку соответствующих permission-флагов с fallback на старую ролевую логику.

## Что изменено

### Backend
- `backend/app/utils/authz.py`
  - Новые helpers: `get_user_org_permissions`, `request_has_org_permission`, `require_org_permission`, `require_session_permission`.
- `backend/app/services/session_service.py`
  - `delete_session`: проверка `delete`-флага (fallback org_admin).
  - `bpmn_save`: проверка `edit`-флага (fallback editor/admin).
- `backend/app/routers/sessions.py`
  - `export` / `export_zip`: проверка `export`-флага.
- `backend/app/routers/notes.py`
  - `create_session_note_thread`: проверка `create`-флага.
- `backend/app/routers/templates.py`
  - Org-scope create/patch/delete для templates и folders: проверка `create`/`edit`/`delete` флагов.

### Tests
- `backend/tests/test_rbac_gap_fixes.py` — 15+ новых тестов, по 3 на каждый патч.
- `backend/tests/test_session_read_rbac.py` — обновлён тест `test_org_admin_cannot_delete_someone_elses_session` → `test_org_admin_can_delete_session_by_role_fallback` (новая политика разрешает org_admin).

## Backward compatibility
- Если `permissions_json` не задан, `storage._normalize_membership_permissions` возвращает role-template.
- Platform admin всегда имеет все права.
- Старые ролевые проверки остаются как fallback, не удаляются.

## Что не входит (deferred)
- Node/edge mutations, BPMN-meta, overlays, BPMN clear, AI questions/answers, global session create, property dictionary, view/manage_users flags.

## Как проверить
```bash
backend/.venv/bin/pytest backend/tests/test_rbac_gap_fixes.py -q
backend/.venv/bin/pytest backend/tests/test_session_read_rbac.py backend/tests/test_bpmn_save_rbac_scope.py backend/tests/test_notes_mvp1_api.py backend/tests/test_templates_rbac.py -q
backend/.venv/bin/pytest backend/tests -q
```

## Merge gate
- [ ] Code review
- [ ] Все backend-тесты проходят
- [ ] Пользователь explicit approve
