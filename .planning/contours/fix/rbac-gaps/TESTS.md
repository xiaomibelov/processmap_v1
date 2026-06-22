# TESTS.md — Тестовое покрытие fix/rbac-gaps

## Новый backend-тест
**Файл:** `backend/tests/test_rbac_gap_fixes.py`

### Фикстуры (план)
- `setUp` создаёт временные `PROCESS_STORAGE_DIR`/`PROJECT_STORAGE_DIR`, пользователей: `platform_admin`, `org_admin`, `editor`, `viewer`.
- Создаёт org, project, session.
- `_set_permissions(user, org_id, permissions_json)` — обновляет `org_memberships.permissions_json` через raw SQL.
- `_mk_req(user, org_id)` — `_DummyRequest` с `auth_user` + `active_org_id` + `org_memberships` (чтобы `get_user_org_permissions` не ходил в БД).

### Список тестов

#### Patch 1 — Session delete
| # | Тест | Ожидаемый результат |
|---|------|---------------------|
| 1.1 | `test_editor_without_delete_cannot_delete_someone_elses_session` | 403 |
| 1.2 | `test_editor_with_delete_can_delete_someone_elses_session` | 200 |
| 1.3 | `test_org_admin_can_delete_by_role_fallback` | 200 |
| 1.4 | `test_owner_can_delete_own_session` | 200 |

#### Patch 2 — Export
| # | Тест | Ожидаемый результат |
|---|------|---------------------|
| 2.1 | `test_viewer_cannot_export_session` | 403 |
| 2.2 | `test_viewer_with_export_can_export_session` | 200 |
| 2.3 | `test_editor_can_export_session_by_role_fallback` | 200 |

#### Patch 3 — Discussions create
| # | Тест | Ожидаемый результат |
|---|------|---------------------|
| 3.1 | `test_viewer_cannot_create_note_thread` | 403 |
| 3.2 | `test_viewer_with_create_can_create_note_thread` | 201 |
| 3.3 | `test_editor_can_create_note_thread_by_role_fallback` | 201 |

#### Patch 4 — Templates org-scope
| # | Тест | Ожидаемый результат |
|---|------|---------------------|
| 4.1 | `test_editor_without_create_cannot_create_org_template` | 403 |
| 4.2 | `test_editor_with_create_can_create_org_template` | 200 |
| 4.3 | `test_editor_without_delete_cannot_delete_org_template` | 403 |
| 4.4 | `test_editor_with_delete_can_delete_org_template` | 204 |
| 4.5 | `test_editor_without_create_cannot_create_org_folder` | 403 |
| 4.6 | `test_editor_with_create_can_create_org_folder` | 200 |

#### Patch 5 — BPMN save
| # | Тест | Ожидаемый результат |
|---|------|---------------------|
| 5.1 | `test_viewer_cannot_save_bpmn` | 403 |
| 5.2 | `test_viewer_with_edit_can_save_bpmn` | 200 |
| 5.3 | `test_editor_can_save_bpmn_by_role_fallback` | 200 |
| 5.4 | `test_org_admin_with_edit_false_cannot_save_bpmn` | 403 |

## Regression — обновлённые существующие тесты
- `backend/tests/test_session_read_rbac.py`
  - `test_org_admin_cannot_delete_someone_elses_session` → переименовать/переписать в `test_org_admin_can_delete_session_by_role_fallback` с ожиданием 200.

## Frontend-тесты
В рамках этого контура UI не изменяется (кнопки уже скрываются/показываются по ролям в user-access-redesign). Frontend-тесты **опциональны**; если появятся, они будут в:
- `frontend/src/features/process/notes/rbac-guard.test.mjs` (если нужно проверить видимость кнопки "Новое обсуждение" по `create`)
- `frontend/src/features/process/bpmn/rbac-guard.test.mjs` (если нужно проверить видимость save/export по флагам)
- `frontend/src/features/templates/model/templatesRbac.test.mjs` (create/delete по флагам)

## Команды запуска
```bash
cd /opt/processmap-test/.worktrees/fix-rbac-gaps
# все новые тесты
backend/.venv/bin/pytest backend/tests/test_rbac_gap_fixes.py -q
# регрессия по RBAC
backend/.venv/bin/pytest backend/tests/test_session_read_rbac.py backend/tests/test_bpmn_save_rbac_scope.py backend/tests/test_notes_mvp1_api.py backend/tests/test_templates_rbac.py -q
# весь backend suite (перед PR)
backend/.venv/bin/pytest backend/tests -q
```

## Критерий готовности
- `test_rbac_gap_fixes.py` — все тесты проходят.
- Каждый патч имеет ≥1 тест, который падает до патча и проходит после.
- Существующие RBAC-тесты не ломаются (кроме одного осознанного изменения для org_admin delete).
