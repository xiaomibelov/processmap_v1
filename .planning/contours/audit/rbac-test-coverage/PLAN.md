# audit/rbac-test-coverage — план

## Контур
- **contour_id:** `audit/rbac-test-coverage`
- **branch:** `audit/rbac-test-coverage` от `origin/main` (`f3a1eaa0f2cd7db93bba771f7461b5e527b26648`)
- **worktree:** `/opt/processmap-test/.worktrees/audit-rbac-test-coverage`
- **goal:** Проверить, покрывают ли существующие тесты 10 ключевых RBAC-гэпов ProcessMap.
- **bounded scope:** Только диагностика и отчёт. **Product code не пишется.**

## Анализируемые тесты
1. `backend/tests/test_templates_rbac.py`
2. `backend/tests/test_session_read_rbac.py`
3. `backend/tests/test_bpmn_save_rbac_scope.py`
4. `backend/tests/test_notes_mvp1_api.py`
5. `backend/tests/test_admin_user_management_api.py`
6. `backend/tests/test_session_status_transitions.py`
7. `backend/tests/test_org_property_dictionary_api.py`
8. `backend/tests/test_workspace_access_controls.py`
9. `backend/tests/test_project_membership_scope.py`
10. `backend/tests/test_auth_users_db_profile_storage.py`

## Проверяемые RBAC-гэпы
1. **Session delete** — разделён ли от `edit`? Тестируется ли 403 для `editor` без `delete`-права?
2. **Export** — проверяется ли 403 для `viewer` при `GET /api/sessions/{id}/export`?
3. **Discussions** — проверяется ли 403 для `viewer` при `POST /api/sessions/{id}/note-threads`?
4. **Templates org-scope** — проверяется ли 403 для `editor` при создании org-шаблона?
5. **Invites** — проверяется ли делегирование `manage_users`?
6. **Project members** — проверяется ли granular управление members?
7. **AI / auto-pass** — проверяется ли 403 для `viewer`?
8. **Property Dictionary** — проверяется ли 403 для `editor`?
9. **BPMN save** — проверяется ли granular (`create`/`edit`/`delete`) внутри `ORG_WRITE_ROLES`?
10. **Admin panel** — проверяется ли разграничение `platform-admin` vs `org-admin`?

## Методика
1. Прочитать каждый тест-файл целиком.
2. Выписать все `assert` на `status_code` 401/403/404/409 и описать сценарий.
3. Сопоставить с backend router endpoint'ами.
4. Для каждого из 10 гэпов отметить:
   - `[ПОКРЫТО]` — есть прямой тест на 403/запрет;
   - `[ЧАСТИЧНО]` — есть смежный тест, но не целевой сценарий;
   - `[НЕ ПОКРЫТО]` — нет теста.
5. Для `[НЕ ПОКРЫТО]` и `[ЧАСТИЧНО]` указать конкретный сценарий, который нужно протестировать.

## Артефакты
- `PLAN.md` — этот документ.
- `AUDIT-TESTS.md` — матрица гэп × тест × статус + выводы.
- `READY_FOR_EXECUTION` — маркер готовности.

## Acceptance criteria
- [ ] Все 10 тест-файлов прочитаны.
- [ ] Матрица `AUDIT-TESTS.md` заполнена.
- [ ] Для каждого непокрытого гэпа указан конкретный рекомендуемый тест.
- [ ] Артефакты замиррорены в Obsidian.
- [ ] Product code не изменён.
- [ ] Пользователь explicit approve перед любым merge/deploy/PR.
