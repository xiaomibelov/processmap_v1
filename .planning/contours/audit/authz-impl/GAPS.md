# GAPS.md — Authz implementation gaps

## Legend
- **Critical**: можно получить/изменить данные без разрешения, нарушая принцип least privilege.
- **High**: write-операции завязаны только на роли, флаг `permissions_json` игнорируется; несоответствие между UI и backend.
- **Medium**: read-операции не проверяют `view`-флаг; влияет на data visibility.
- **Low**: косметические/документальные несоответствия.

## Critical

### GAP-CRIT-1: Мутация nodes/edges не проверяет права
- **Endpoint'ы**: `POST/DELETE /api/sessions/{id}/nodes`, `POST/DELETE /api/sessions/{id}/edges`, `POST /api/sessions/{id}/nodes/{node_id}`.
- **Где**: `backend/app/services/session_service.py` (`patch_node`, `add_node`, `delete_node`, `add_edge`, `delete_edge`).
- **Проблема**: Единственная проверка — `_require_diagram_cas_or_409` (optimistic locking). Нет `can_edit_workspace`, нет `edit`-флага, нет project-scope. Любой member орг (или даже viewer, если project scope позволяет читать сессию) может менять диаграмму.
- **Рекомендация**: Перед CAS вызвать `session_access_from_request(request, session_id)` и `can_edit_workspace(request, org_id)` (или проверить `edit`-флаг, когда он будет доступен). Для delete-node дополнительно учитывать `delete`-флаг.

### GAP-CRIT-2: BPMN-meta и overlays доступны без проверки прав
- **Endpoint'ы**: `GET/PATCH /api/sessions/{id}/bpmn_meta`, `POST /api/sessions/{id}/bpmn_meta/infer_rtiers`, `GET /api/sessions/{id}/overlays`.
- **Где**: `backend/app/services/session_service.py` (`bpmn_meta_get`, `bpmn_meta_patch`, `bpmn_meta_infer_rtiers`, `overlays`).
- **Проблема**: `bpmn_meta_get` не принимает `request`; `overlays` использует `session_id` без authz. PATCH/infer только CAS.
- **Рекомендация**: Передавать `request` и проверять `session_access_from_request` + `can_edit_workspace` для write, `view`-флаг/роль для read.

### GAP-CRIT-3: Export endpoints не проверяют `export`-флаг
- **Endpoint'ы**: `GET /api/sessions/{id}/export`, `GET /api/sessions/{id}/export.zip`, `GET /api/sessions/{id}/bpmn`.
- **Где**: `backend/app/services/session_service.py` (`export`, `export_zip`, `bpmn_export`).
- **Проблема**: `export/export_zip` загружают сессию без `request`; `bpmn_export` проверяет только `_legacy_load_session_scoped` (membership+project). Ни один не проверяет `export=True`.
- **Рекомендация**: Требовать `request` и проверять `export`-флаг (или ролевой эквивалент) перед экспортом.

### GAP-CRIT-4: Org property dictionary открыт любому member
- **Endpoint'ы**: все `/api/orgs/{org_id}/property-dictionary/*`.
- **Где**: `backend/app/routers/org_property_dictionary.py`.
- **Проблема**: `_ensure_org_member` проверяет только членство в орг. Любой viewer может создавать/изменять/удалять операции, свойства и значения.
- **Рекомендация**: Добавить `enterprise_require_org_role(..., ORG_WRITE_ROLES)` для write endpoint'ов; в будущем — проверять `edit`/`delete`/`create` флаги.

### GAP-CRIT-5: `POST /api/sessions` создаёт сессию глобально
- **Endpoint**: `POST /api/sessions`.
- **Где**: `backend/app/routers/sessions.py` → `session_service.create_session`.
- **Проблема**: Роутер не передаёт `request`; сессия создаётся без привязки к пользователю/орг/проект и без проверки `create`.
- **Рекомендация**: Либо удалить/deprecated endpoint, либо требовать `request` и `can_edit_workspace`/`create`-флаг.

## High

### GAP-HIGH-1: Templates используют роли вместо permission-флагов
- **Endpoint'ы**: `POST/PATCH/DELETE /api/templates`, `POST/PATCH/DELETE /api/template-folders`.
- **Где**: `backend/app/routers/templates.py`.
- **Проблема**: `_ORG_TEMPLATE_WRITE_ROLES` / `_ORG_FOLDER_WRITE_ROLES` жёстко кодируют `org_owner/org_admin/project_manager`. `editor` с `create/edit/delete=True` не может управлять org-шаблонами; `project_manager` с `edit=False` — может.
- **Рекомендация**: В `_template_can_manage` / `_template_folder_can_manage` дополнительно читать `permissions` membership и проверять соответствующий флаг.

### GAP-HIGH-2: Session delete — двойная логика и отсутствие `delete`-флага
- **Endpoint**: `DELETE /api/sessions/{id}`.
- **Где**: `backend/app/services/session_service.py` (`delete_session`) vs `backend/app/_legacy_main.py` (`delete_session_api`).
- **Проблема**: `session_service.delete_session` разрешает удаление только platform admin или owner; `_legacy_main.delete_session_api` разрешает `org_owner/org_admin` через `_can_delete_workspace_content`. Реальный роутер использует `session_service`, поэтому org_admin не может удалять сессии (подтверждается `test_session_read_rbac`). При этом `delete`-флаг не проверяется.
- **Рекомендация**: Унифицировать логику: org admin / project manager с `delete=True` / owner / platform admin могут удалять.

### GAP-HIGH-3: BPMN save / restore / clear не учитывают `edit`/`delete`-флаги
- **Endpoint'ы**: `PUT /api/sessions/{id}/bpmn`, `POST /api/sessions/{id}/bpmn/restore/{vid}`, `DELETE /api/sessions/{id}/bpmn`.
- **Где**: `_legacy_main.session_bpmn_save`, `session_bpmn_restore`, `session_bpmn_clear`.
- **Проблема**: Save/restore проверяют `_can_edit_workspace` (role). Clear вообще не проверяет права. `edit`/`delete`-флаги игнорируются.
- **Рекомендация**: Для save/restore — добавить проверку `edit`-флага; для clear — `delete`-флаг (или `edit` + explicit delete).

### GAP-HIGH-4: Notes write использует `can_edit_workspace` вместо гранулярных флагов
- **Endpoint'ы**: `POST /api/sessions/{id}/note-threads`, `POST /api/note-threads/{id}/comments`, `PATCH /api/note-threads/{id}`, `PATCH /api/note-comments/{id}`.
- **Где**: `backend/app/routers/notes.py`.
- **Проблема**: `can_edit_workspace` разрешает `editor/admin`. Пользователь с `create=True`/`edit=True` но ролью `viewer` не может создавать/редактировать обсуждения; пользователь с `editor` и `edit=False` — может.
- **Рекомендация**: Заменить/дополнить `can_edit_workspace` на проверку соответствующего permission-флага из membership.

### GAP-HIGH-5: Admin API сохраняет `permissions`, но backend не применяет их
- **Где**: `backend/app/routers/admin.py` + `backend/app/storage.py`.
- **Проблема**: UI показывает permission-матрицу, пользователь ожидает, что флаги работают. На деле флаги пишутся в БД и игнорируются.
- **Рекомендация**: Ввести helper `get_user_permissions(user_id, org_id)` и использовать его в authz-функциях.

## Medium

### GAP-MED-1: Read endpoint'ы не проверяют `view`-флаг
- **Endpoint'ы**: `GET /api/sessions/{id}`, `GET /api/sessions`, `GET /api/projects/{id}/sessions`, `GET /api/sessions/{id}/note-threads`, `GET /api/templates`, `GET /api/template-folders`, `GET /api/sessions/{id}/bpmn/versions` и др.
- **Где**: storage read scope / `_legacy_load_session_scoped`.
- **Проблема**: Доступ определяется ролью и project scope. `viewer` с `view=False` (если такое возможно, т.к. UI гарантирует `view=True`) всё равно может читать.
- **Рекомендация**: Добавить `view`-флаг в storage read scope / helper'ы.

### GAP-MED-2: `session_access_from_request` не проверяет роль
- **Где**: `backend/app/utils/authz.py`.
- **Проблема**: Функция возвращает 404 только при отсутствии membership/project scope. Роль/permission не учитываются, что делает её непригодной как единственный authz-барьер для sensitive read.
- **Рекомендация**: Добавить опциональный параметр `required_permission` или использовать её в сочетании с `can_edit_workspace`/`permission` проверками.

### GAP-MED-3: `manage_users`-флаг не используется
- **Где**: `backend/app/routers/org.py`, `backend/app/routers/org_invites.py`, `backend/app/routers/org_members.py`, `backend/app/routers/admin.py`.
- **Проблема**: Управление members/invites/users проверяет ролевые множества (`ORG_MEMBER_MANAGE_ROLES`, `ORG_INVITE_MANAGE_ROLES`, `is_admin`), а не `manage_users`.
- **Рекомендация**: Добавить проверку `manage_users=True` наряду с ролями.

## Low

### GAP-LOW-1: Нет единого helper'а для чтения permission-флагов
- **Где**: `backend/app/utils/authz.py`.
- **Проблема**: Каждый authz-helper сейчас работает с role strings. Чтобы внедрить `permissions_json`, нужен централизованный helper (`get_user_org_permissions`), который не существует.
- **Рекомендация**: Создать `get_user_org_permissions(user_id, org_id)` и `require_org_permission(request, org_id, permission)`.

### GAP-LOW-2: Несоответствие naming: `permissions_json` vs `permissions`
- **Где**: DB column `permissions_json`, API field `permissions`, dict `permissions`.
- **Проблема**: Усложняет аудит; новые разработчики могут искать `permissions_json` и не находить бизнес-логику.
- **Рекомендация**: Зафиксировать naming в `AGENTS.md`/документации: API/frontend используют `permissions`, storage — `permissions_json`, backend authz — `permissions`.

---

## Рекомендуемый порядок закрытия (для следующего fix-контура)
1. **CRIT-1/CRIT-2/CRIT-3**: добавить authz в `session_service` для nodes/edges, bpmn_meta, overlays, export.
2. **CRIT-4**: защитить write endpoint'ы property dictionary.
3. **CRIT-5**: убрать или защитить глобальное создание сессии.
4. **HIGH-2/HIGH-3**: унифицировать и защитить delete / restore / clear BPMN.
5. **HIGH-1/HIGH-4/HIGH-5**: внедрить helper `get_user_org_permissions` и использовать флаги в templates/notes/admin.
6. **MED-1/MED-2/MED-3**: распространить `view`/`manage_users` на read и user-management endpoint'ы.
