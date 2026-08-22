# AUDIT.md — RBAC 5 core features

## Source/runtime truth (captured at planning time)
- **worktree:** `/opt/processmap-test/.worktrees/fix-rbac-5-features`
- **branch:** `fix/rbac-5-features`
- **HEAD:** `f3a1eaa0f2cd7db93bba771f7461b5e527b26648` (origin/main)
- **runtime version before deploy:** `6cf35d18 fix/sub-process-navigation`
- **deployed version after user request:** `a1020f4a feature/user-access-redesign`

> Note: the runtime on `clearvestnic.ru:5177` was temporarily redeployed to `feature/user-access-redesign` during the previous task. This contour's work will be done in isolated worktree and deployed only after user approval.

## Authz helper inventory

| Helper | Location | Behavior | Granular? |
|--------|----------|----------|-----------|
| `practical_role_for_org` | `backend/app/utils/authz.py:35` | Сводит роль к `admin/editor/viewer` | ❌ role names |
| `can_manage_workspace` | `backend/app/utils/authz.py:46` | `practical_role == admin` | ❌ role names |
| `can_edit_workspace` | `backend/app/utils/authz.py:50` | `practical_role in {admin,editor}` | ❌ role names |
| `can_delete_workspace_content` | `backend/app/utils/authz.py:54` | `practical_role == admin` | ❌ role names |
| `is_role_allowed` | `backend/app/utils/authz.py:113` | Проверяет роль по множеству | ❌ role names |
| `enterprise_require_org_member` | `backend/app/services/org_workspace.py:210` | Проверяет membership + роль в `ORG_READ_ROLES` | ❌ role names |
| `require_org_member_for_enterprise` | `backend/app/services/org_workspace.py:38` | Требует membership, возвращает роль | ❌ role names |
| `can_edit_workspace` (org_workspace) | `backend/app/services/org_workspace.py:55` | Hardcoded `{org_owner,org_admin,project_manager,editor}` | ❌ role names |

**Granular flags (`view/create/edit/delete/export/manage_users`) из `permissions_json` пока нигде не читаются за пределами admin API.**

## Предварительные findings (subject to phase-1 deep audit)

### 1. Шаблоны (`templates.py`)
- `_template_can_manage` (L146) проверяет `is_admin`, ownership, или `_ORG_TEMPLATE_WRITE_ROLES` (`org_owner/org_admin/project_manager`).
- `_template_folder_can_manage` (L197) аналогично: personal — ownership, org — `_ORG_FOLDER_WRITE_ROLES` (`org_owner/org_admin`).
- **Gap:** `editor` с `edit=True` не может редактировать org-шаблон; `project_manager` с `edit=False` — может.
- **Gap:** read-доступ к org-шаблонам проверяет `enterprise_require_org_member` + `ORG_READ_ROLES`, а не флаг `view`.

### 2. Сессии (`sessions.py` + `session_service.py`)
- `create_session` (L33) не требует ни org membership, ни authz-проверки (принимает `roles`/`start_role` извне).
- `create_project_session` делегирует `_legacy_main.create_project_session`.
- `delete_session` (L172) разрешает удаление только владельцу или платформенному админу.
- `patch_session` / `put_session` делегируют `_legacy_main.patch_session`.
- **Gap:** `delete_session` не учитывает org-роль/флаг `delete` (например, org_admin должен иметь право, но не платформенный admin).
- **Gap:** `patch_session` (title/status) не проверяет флаг `edit`.
- **Gap:** `create_project_session` должна проверять флаг `create`.

### 3. Версии сессий / snapshot
- `bpmn_save`, `bpmn_restore`, `bpmn_clear`, `bpmn_versions_list`, `bpmn_version_detail` делегируют `_legacy_main`.
- **Gap:** версионные операции, вероятно, используют `can_edit_workspace`/role-name проверки вместо флагов `view`/`edit`.
- **Risk:** `bpmn_restore` — это write-операция, которая должна требовать `edit`/`delete` в зависимости от политики.

### 4. BPMN-элементы и оверлеи
- `patch_node`, `add_node`, `delete_node`, `add_edge`, `delete_edge`, `session_bpmn_save` в `session_service.py`.
- Часть операций идёт через `_legacy_main`.
- **Gap:** модификация элементов должна проверять флаг `edit` (или `create`/`delete` для add/remove).
- **Gap:** overlay-слои (`/overlays`) — read-only, но должны проверять `view`.

### 5. Обсуждения и @mentions (`notes.py`)
- `_load_session_for_notes(..., write=True)` (L87) использует `can_edit_workspace(request, org_id)`.
- **Gap:** write-доступ к обсуждениям зависит от role-name, а не флага `edit`.
- **Gap/Risk:** edit/delete чужого комментария может быть разрешён любому с write-доступом; нужна проверка ownership.
- `_mentionable_users_for_session` (L151) выдаёт всех участников проекта/org; нужно убедиться, что упоминаемые пользователи имеют `view` доступ.

## Deferred (out of scope)
- Полный перевод authz на granular flags во всех фичах (requires broad refactor).
- Изменение JWT/токенов для включения granular flags.
- Переход от role-based к permission-based middleware.
- UI-редизайн управления доступом (это контур `feature/user-access-redesign`).

## Next step
Глубокий аудит фазой 1 с построчным разбором каждого endpoint'а и формированием финальной матрицы.
