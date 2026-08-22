# audit/authz-impl — план

## Контур
- **contour_id:** `audit/authz-impl`
- **branch:** `audit/authz-impl`
- **worktree:** `/opt/processmap-test/.worktrees/audit-authz-impl`
- **baseline:** `origin/main @ f3a1eaa0f2cd7db93bba771f7461b5e527b26648`
- **audited code:** основная рабочая копия на `feature/user-access-redesign` @ `bf2a3b8c` (там появилась колонка `permissions_json` и admin UI/API)
- **goal:** Проверить, где в backend роутерах и сервисах реально проверяются гранулярные флаги `permissions_json` (view/create/edit/export/delete/manage_users), введённые в `feature/user-access-redesign`.
- **bounded scope:** Только аудит и документирование. **Продуктовый код не меняем**, merge/deploy/PR — только после explicit approve пользователя.

## Контекст: что появилось в user-access-redesign
- `backend/app/storage.py`: в `org_memberships` добавлена колонка `permissions_json`; `_PERMISSION_KEYS = ("view", "create", "edit", "export", "delete", "manage_users")`; роль по-прежнему authoritative, флаги нормализуются.
- `backend/app/routers/admin.py`: POST/PATCH `/api/admin/users` сохраняют `permissions` в membership.
- `frontend/src/lib/apiModules/adminApi.js`: `normalizeMembershipPermissions` гарантирует корректные булевы значения.

Вопрос, на который отвечает этот контур: **а backend authz-слой вообще читает эти флаги?**

## Методология
1. Построить полный инвентарь backend роутеров и endpoint'ов (grep `@router.`).
2. Для каждого роутера зафиксировать используемые authz-хелперы:
   - `backend/app/utils/authz.py` — `can_edit_workspace`, `can_manage_workspace`, `can_delete_workspace_content`, `is_role_allowed`, `session_access_from_request`, `enterprise_require_project_access`
   - `backend/app/services/org_workspace.py` — `require_org_member_for_enterprise`, `enterprise_require_org_member`, `enterprise_require_org_role`, `can_edit_workspace`, `project_scope_for_request`, `project_access_allowed`
   - `backend/app/_legacy_main.py` — `_can_edit_workspace`, `_can_delete_workspace_content`, `_legacy_load_session_scoped`, `_legacy_load_project_scoped`, `_org_role_for_request`, `_is_role_allowed`
   - middleware `register_auth_guard` — публичные пути, membership-check по `path_org_id`
3. Проверить, есть ли чтение `permissions_json` или `permissions` вне admin API.
4. Составить матрицу endpoint × authz-проверка × ролевая/флаговая основа.
5. Ответить на 5 ключевых вопросов (см. `AUDIT-IMPL.md`).
6. Выделить приоритетные gap'ы в `GAPS.md`.

## Артефакты
| Артефакт | Назначение |
|----------|------------|
| `PLAN.md` | Этот файл: цель, scope, методология, критерии приёмки |
| `AUDIT-IMPL.md` | Матрица endpoint × authz, ответы на 5 вопросов, сводка по роутерам |
| `GAPS.md` | Приоритизированный список gap'ов (critical/high/medium/low) и рекомендации |
| `STATE.json` | Состояние контура, gates, next action |
| `READY_FOR_EXECUTION` | Timestamp готовности к выполнению после approve |

## Acceptance criteria
- [x] Инвентарь роутеров и endpoint'ов собран.
- [x] Для всех 5 core-фич (templates, sessions, versions/snapshots, BPMN-элементы, notes) задокументированы authz-проверки.
- [x] 5 ключевых вопросов о `permissions_json` / `ORG_WRITE_ROLES` / открытых endpoint'ах / `is_admin` / project-scope получили ответы.
- [x] `GAPS.md` содержит ≥5 gap'ов с severity и рекомендациями.
- [x] Нет изменений продуктового кода.
- [x] Артефакты замиррорены в Obsidian.
- [ ] Пользователь explicit approve перед следующим шагом (fix-контур).

## Риски и ограничения
- **Worktree отстаёт от feature branch.** `audit/authz-impl` создан от `origin/main`, поэтому планируемые артефакты пишутся в worktree, а анализируемый код — в основной рабочей копии `feature/user-access-redesign`.
- **Legacy-coupling.** Многие проверки спрятаны в `_legacy_main.py`; grep помогает, но финальные выводы требуют ручного чтения.
- **Нет тестов в этом контуре.** Это чистый аудит; тесты появятся в последующем fix-контуре.

## Команды для повторения
```bash
cd /opt/processmap-test
# инвентарь endpoint'ов
grep -Rhn "@router\." backend/app/routers/ --include="*.py" | sort
# где используются authz-хелперы
grep -Rhn "can_edit_workspace\|can_manage_workspace\|can_delete_workspace_content\|is_role_allowed\|session_access_from_request\|enterprise_require" backend/app/routers backend/app/services --include="*.py"
# читается ли permissions_json где-либо вне admin/storage
grep -Rhn "permissions_json\|\.permissions" backend/app --include="*.py" | grep -v storage.py | grep -v admin.py | grep -v routers/admin.py
```
