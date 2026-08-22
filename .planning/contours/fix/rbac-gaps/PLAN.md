# fix/rbac-gaps — план

## Runtime/source truth (per AGENTS.md §3)
- **pwd:** `/opt/processmap-test`
- **remote:** `origin git@github.com:xiaomibelov/processmap_v1.git`
- **current branch (main checkout):** `feature/user-access-redesign` @ `96da2cf7`
- **contour branch/worktree:** `fix/rbac-gaps` @ `f3a1eaa0` (от `origin/main`)
- **worktree:** `/opt/processmap-test/.worktrees/fix-rbac-gaps`
- **origin/main:** `f3a1eaa0f2cd7db93bba771f7461b5e527b26648`
- **status:** clean, no unrelated diffs

## Контур
- **contour_id:** `fix/rbac-gaps`
- **contour_type:** `fix`
- **branch:** `fix/rbac-gaps` от `origin/main`
- **goal:** Закрыть 5 P0-P1 RBAC-гэпов, введённых после добавления `permissions_json`, с тестовым покрытием.
- **bounded scope:** Только 5 патчей ниже. Остальные gap'ы из `audit/authz-impl` — deferred.

## Источники
- `audit/authz-impl` (`/srv/obsidian/project-atlas/ProcessMap/AgentReports/audit/authz-impl/`)
- `audit/rbac-test-coverage` (`/srv/obsidian/project-atlas/ProcessMap/AgentReports/audit/rbac-test-coverage/`)
- RAG preflight: `.planning/contours/fix/rbac-gaps/RAG_PREFLIGHT_PLANNER.md`

## 5 патчей (P0-P1)

| # | Гэп | Endpoint(ы) | Файлы для изменения | Permission-флаг | Fallback |
|---|-----|-------------|---------------------|-----------------|----------|
| 1 | Session delete | `DELETE /api/sessions/{id}` | `backend/app/services/session_service.py` | `delete` | `org_owner`/`org_admin` (role template) |
| 2 | Export | `GET /api/sessions/{id}/export`, `/export.zip` | `backend/app/routers/sessions.py` | `export` | `editor`/`project_manager`/`org_admin` (role template) |
| 3 | Discussions create | `POST /api/sessions/{id}/note-threads` | `backend/app/routers/notes.py` | `create` | `editor`/`project_manager`/`org_admin` |
| 4 | Templates org-scope | `POST/PATCH/DELETE /api/templates`, `/api/template-folders` | `backend/app/routers/templates.py` | `create`/`edit`/`delete` | `_ORG_TEMPLATE_WRITE_ROLES` / `_ORG_FOLDER_WRITE_ROLES` |
| 5 | BPMN save | `PUT /api/sessions/{id}/bpmn` | `backend/app/services/session_service.py` (wrapper) + `backend/app/routers/sessions.py` | `edit` | `_can_edit_workspace` roles |

## Общий helper
- **Новый файл/изменение:** `backend/app/utils/authz.py`
- `get_user_org_permissions(user_id, org_id, request=None)` — читает `permissions` из `request.state.org_memberships` или из `storage.list_user_org_memberships`.
- `request_has_org_permission(request, org_id, permission)` — bool.
- `require_org_permission(request, org_id, permission)` — HTTPException 403, если флаг False.
- `require_session_permission(request, session_id, permission)` — комбинация `session_access_from_request` + `require_org_permission`.

## Backward compatibility
- Если `permissions_json` не задан, `storage._normalize_membership_permissions` возвращает role-template (например, `editor` → `create/edit/export=True`, `delete/manage_users=False`; `org_admin` → все True).
- Все проверки сначала смотрят permission-флаг; при отсутствии явного `False` fallback на роль происходит автоматически через normalized permissions.
- Platform admin всегда проходит.

## Тесты
- Новый файл: `backend/tests/test_rbac_gap_fixes.py`.
- Для каждого патча ≥2 теста: "разрешено при флаге/роли" + "запрещено без флага".
- Существующие тесты:
  - `test_session_read_rbac.py` — нужно обновить `test_org_admin_cannot_delete_someone_elses_session`, т.к. новая политика разрешает `org_admin` удалять (fallback delete=True). Переименуем/перепишем на `test_org_admin_can_delete_with_delete_permission_or_role`.
  - `test_bpmn_save_rbac_scope.py`, `test_notes_mvp1_api.py`, `test_templates_rbac.py` — должны продолжать проходить (fallback не ломает ролевую логику).

## Артефакты
| Артефакт | Назначение |
|----------|------------|
| `PLAN.md` | Этот файл |
| `FIX.md` | Описание каждого патча + псевдо-diff |
| `TESTS.md` | Список новых тестов + команды запуска |
| `PR.md` | Русское описание PR |
| `STATE.json` | Состояние контура |
| `READY_FOR_EXECUTION` | Timestamp планирования |

## Acceptance criteria
- [ ] PLAN.md, FIX.md, TESTS.md, PR.md, STATE.json созданы и замиррорены.
- [ ] Пользователь explicit approve плана.
- [ ] Каждый из 5 патчей реализован.
- [ ] `backend/tests/test_rbac_gap_fixes.py` проходит.
- [ ] Существующие RBAC-тесты проходят (с учётом корректировки `test_session_read_rbac.py`).
- [ ] Frontend `node:test` для rbac-guard проходит (если затронут UI).
- [ ] Нет изменений storage schema, user-access-redesign UI, других роутеров.
- [ ] No merge/deploy/PR без явного approve.

## Риски
- **Session delete:** меняет поведение для `org_admin` (сейчас 403, станет 200). Это осознанное изменение согласно требованию "или org_admin".
- **Export:** роутер `export`/`export_zip` не принимал `request`; нужно аккуратно добавить параметр, не сломав сигнатуру для внутренних вызовов.
- **BPMN save:** логика в `_legacy_main.py` уже проверяет `_can_edit_workspace`. Мы добавим permission-check в `session_service.bpmn_save` или в роутер, чтобы не трогать legacy.
- **Template permissions:** для org-scope шаблонов/папок нужно передавать `request` в `_template_can_manage`/`_template_folder_can_manage` (сейчас туда передаётся `org_role`).

## Команды для повторения
```bash
cd /opt/processmap-test/.worktrees/fix-rbac-gaps
# backend tests
backend/.venv/bin/pytest backend/tests/test_rbac_gap_fixes.py -q
backend/.venv/bin/pytest backend/tests/test_session_read_rbac.py backend/tests/test_bpmn_save_rbac_scope.py backend/tests/test_notes_mvp1_api.py backend/tests/test_templates_rbac.py -q
# frontend tests (если добавятся)
cd frontend && node --test src/features/**/rbac-guard*.test.mjs
```
