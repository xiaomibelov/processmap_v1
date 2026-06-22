# AUDIT-IMPL.md — Реальное применение granular permissions в backend

## Executive summary
- Гранулярные флаги `view/create/edit/export/delete/manage_users`, введённые в `feature/user-access-redesign`, **сохраняются**, но **не читаются** в authz-слое backend.
- Все write-проверки по-прежнему используют ролевые множества (`ORG_WRITE_ROLES`, `_ORG_TEMPLATE_WRITE_ROLES`, `_ORG_FOLDER_WRITE_ROLES`, `can_edit_workspace`, `can_delete_workspace_content`).
- Есть endpoint'ы, которые после аутентификации не проверяют ни роль, ни permission-флаг (например, мутирование nodes/edges, BPMN-meta, export).
- Project scope (ограничение по проектам) работает через `session_access_from_request` / `_legacy_load_session_scoped` / storage read scope, но это не замена permission-флагам.

## Scope аудита
Проанализированы:
- `backend/app/routers/*.py` (все роутеры из `ROUTERS`)
- `backend/app/services/session_service.py`
- `backend/app/utils/authz.py`
- `backend/app/services/org_workspace.py`
- `backend/app/_legacy_main.py` (authz-части)
- `backend/app/storage.py` (`permissions_json`)

Baseline кода: основная рабочая копия `feature/user-access-redesign` @ `bf2a3b8c`.

---

## 1. Ответы на 5 ключевых вопросов

### Q1. Где `permissions_json` / `permissions` читаются вне admin API?
**Нигде.**

| Место | Что делает с `permissions_json` |
|-------|---------------------------------|
| `backend/app/storage.py` | Читает/пишет в `org_memberships`; `_normalize_membership_permissions` формирует dict `permissions`, но дальше он не используется для authz. |
| `backend/app/routers/admin.py` | Принимает `permissions` из UI, нормализует, сохраняет через `upsert_org_membership`. |
| `frontend/src/lib/apiModules/adminApi.js` | Нормализует флаги перед отправкой. |
| Остальной backend | **Не упоминает** `permissions_json` / `permissions` как источник авторизации. |

Проверка:
```bash
grep -Rhn "permissions_json\|\.permissions\|permissions" backend/app --include="*.py" | grep -v storage.py | grep -v routers/admin.py | grep -v "insufficient_permissions"
# пусто
```

### Q2. `ORG_WRITE_ROLES` / `can_edit_workspace` всё ещё защищают write-операции?
**Да, они остаются единственным барьером.**

Примеры:
- `backend/app/utils/authz.py`: `can_edit_workspace` разрешает `org_owner/org_admin/project_manager/editor`.
- `backend/app/services/org_workspace.py`: та же логика, плюс `can_manage_workspace` только для `org_owner/org_admin`.
- `backend/app/routers/templates.py`: create/patch/delete org-шаблонов требуют `_ORG_TEMPLATE_WRITE_ROLES = {"org_owner","org_admin","project_manager"}`; папки — `_ORG_FOLDER_WRITE_ROLES = {"org_owner","org_admin"}`.
- `backend/app/_legacy_main.py`: `session_bpmn_save`, `patch_session` (title), `create_project_session`, `session_bpmn_restore` используют `_can_edit_workspace`; `delete_session_api` использует `_can_delete_workspace_content`.
- `backend/app/routers/notes.py`: create/update thread/comment требует `can_edit_workspace(request, org_id)`.

### Q3. Какие endpoint'ы открыты (только auth/public, без ролевой/permission проверки)?

#### Полностью публичные (без токена)
Из `AUTH_PUBLIC_PATHS` в `_legacy_main.py`:
- `/version`
- `/api/health`, `/api/meta`, `/api/feature-flags`
- `/api/auth/login`, `/api/auth/refresh`, `/api/auth/logout`
- `/api/auth/invite/preview`, `/api/auth/invite/activate`
- `/api/invite/resolve`, `/api/invite/activate`, `/api/invites/accept`

#### Требуют аутентификации, но не проверяют роль/permission
- `POST /api/sessions` — `create_session()` не принимает `request`.
- `GET/POST/PATCH /api/sessions/{id}/bpmn_meta` — `session_service.bpmn_meta_*` / `_legacy_main.session_bpmn_meta_*` не делают authz.
- `GET /api/sessions/{id}/overlays` — `get_overlays_json(session_id)`.
- `GET /api/sessions/{id}/bpmn/versions`, `GET /api/sessions/{id}/bpmn/versions/{vid}` — только `_legacy_load_session_scoped`.
- `POST /api/sessions/{id}/nodes/{node_id}`, `POST /api/sessions/{id}/nodes`, `DELETE /api/sessions/{id}/nodes/{node_id}`, `POST /api/sessions/{id}/edges`, `DELETE /api/sessions/{id}/edges` — в `session_service` только CAS, без проверки `edit`.
- `GET /api/sessions/{id}/export`, `GET /api/sessions/{id}/export.zip` — `_legacy_main.export/export_zip` не проверяют `export`.
- `POST /api/sessions/{id}/ai/questions`, `POST /api/sessions/{id}/notes`, `POST /api/sessions/{id}/notes/extraction-apply`, `POST /api/sessions/{id}/notes/extraction-preview`, `POST /api/sessions/{id}/answer`, `POST /api/sessions/{id}/answers` — загрузка по `session_id`, CAS, но нет ролевой проверки.
- `POST /api/sessions/{id}/recompute` — `recompute_session(session_id)` без `request`.
- `POST /api/telemetry/error-events` — требует токен, но не проверяет membership/роль (path без `org_id`).
- Все endpoint'ы `org_property_dictionary.py` — любой member орг может создавать/изменять/удалять операции, свойства и значения.

### Q4. Какие endpoint'ы используют флаг `is_admin` (platform admin)?
Прямого `request.state.is_admin` почти нет; платформенный admin-флаг читается через `_request_user_meta(request)` / `request_user_meta(request)`.

- `backend/app/routers/admin.py` — почти все `/api/admin/*`:
  - `_admin_context` требует `org_owner/org_admin/project_manager/auditor` для обычных admin-экранов.
  - `_platform_admin_context` требует `is_admin=True` для AI provider settings, prompts, RAG settings, error-events.
  - `_telemetry_read_context` дополнительно ограничивает telemetry ролями.
- `backend/app/routers/templates.py` — `is_admin` bypasses `can_manage` для шаблонов и папок.
- `backend/app/routers/sessions.py` + `session_service.py` — `delete_session` позволяет platform admin удалять любую сессию.
- `backend/app/_legacy_main.py` — `is_admin` bypasses `_can_edit_workspace` / `_can_delete_workspace_content`.
- Storage-level read scope (`_session_read_scope`) возвращает `mode: all` для admin.

### Q5. `session_access_from_request` проверяет роль?
**Нет, только membership + project scope.**

```python
# backend/app/utils/authz.py
sess = st.load(sid, org_id=oid, is_admin=True)
scope = _project_scope_for_request(request, oid)
if project_id and scope.mode != "all" and project_id not in allowed:
    return 404
return sess, scope, None
```

- Проверяет, что пользователь — member орг и что сессия в разрешённом project scope.
- **Не проверяет** `view`-флаг, `org_role`, `is_admin`.

---

## 2. Матрица роутеров

### 2.1 Templates (`backend/app/routers/templates.py`)
| Endpoint | Authz | Role/flag basis | Status |
|----------|-------|-----------------|--------|
| `GET /api/template-folders` | `enterprise_require_org_member` + org_role | `ORG_READ_ROLES` | role-based, no `view` flag |
| `POST /api/template-folders` | `enterprise_require_org_member` + `is_role_allowed(..., _ORG_FOLDER_WRITE_ROLES)` | `org_owner/org_admin` | role-based, no `create` flag |
| `PATCH /api/template-folders/{id}` | `_template_folder_can_manage` | `org_owner/org_admin` / ownership / `is_admin` | role-based, no `edit` flag |
| `DELETE /api/template-folders/{id}` | `_template_folder_can_manage` | `org_owner/org_admin` / ownership / `is_admin` | role-based, no `delete` flag |
| `GET /api/templates` | `enterprise_require_org_member` + org_role | `ORG_READ_ROLES` | role-based, no `view` flag |
| `POST /api/templates` | `enterprise_require_org_member` + `is_role_allowed(..., _ORG_TEMPLATE_WRITE_ROLES)` | `org_owner/org_admin/project_manager` | role-based, no `create` flag |
| `PATCH /api/templates/{id}` | `_template_can_manage` | ownership / `org_owner/org_admin/project_manager` / `is_admin` | role-based, no `edit` flag |
| `DELETE /api/templates/{id}` | `_template_can_manage` | ownership / `org_owner/org_admin/project_manager` / `is_admin` | role-based, no `delete` flag |

### 2.2 Sessions (`backend/app/routers/sessions.py` + `session_service.py` + `_legacy_main.py`)
| Endpoint | Authz | Role/flag basis | Status |
|----------|-------|-----------------|--------|
| `POST /api/sessions` | **none** (no request) | — | **open** |
| `GET /api/projects/{pid}/sessions` | `session_repo.list_sessions` с ctx | storage read scope (role + project) | no `view` flag |
| `POST /api/projects/{pid}/sessions` | `_legacy_main.create_project_session` → `_can_edit_workspace` | `org_owner/org_admin/project_manager/editor` | role-based, no `create` flag |
| `GET /api/sessions` | `session_repo.list_sessions` с ctx | storage read scope | no `view` flag |
| `GET /api/sessions/{id}` | `session_repo.load` с ctx или `SessionAccessDenied` | storage read scope | no `view` flag |
| `POST/DELETE /api/sessions/{id}/presence` | `_legacy_load_session_scoped` | membership + project scope | no role |
| `GET /api/sessions/{id}/tldr` | `_legacy_load_session_scoped` | membership + project scope | no role |
| `GET /api/sessions/{id}/analytics` | `_legacy_load_session_scoped` | membership + project scope | no role |
| `POST /api/sessions/{id}/subprocess/.../navigate` | `session_access_from_request` | membership + project scope | no role |
| `POST /api/sessions/{id}/return` | `session_access_from_request` | membership + project scope | no role |
| `PATCH /api/sessions/{id}` | `_legacy_main.patch_session` → `_can_edit_workspace` / `_can_manage_workspace` | editor/admin | role-based, no `edit` flag |
| `PUT /api/sessions/{id}` | `_legacy_main.put_session` → `_can_edit_workspace` | editor/admin | role-based, no `edit` flag |
| `DELETE /api/sessions/{id}` | `session_service.delete_session`: owner/admin only; `_legacy_main.delete_session_api`: `_can_delete_workspace_content` | admin | **dual behavior**, no `delete` flag |
| `POST /api/sessions/{id}/recompute` | **none** | — | **open** |
| `POST /api/sessions/{id}/ai/questions` | `st.load(session_id)` | storage org scope | **open** |
| `POST /api/sessions/{id}/notes` | `st.load(session_id)` + CAS | storage org scope | **open** |
| `POST /api/sessions/{id}/notes/extraction-apply` | `_legacy_load_session_scoped` | membership + project scope | no role |
| `POST /api/sessions/{id}/notes/extraction-preview` | `_legacy_load_session_scoped` | membership + project scope | no role |
| `POST /api/sessions/{id}/answer`, `/answers` | `st.load(session_id)` + CAS | storage org scope | **open** |
| `POST /api/sessions/{id}/nodes/{node_id}` | `session_service.patch_node` — только CAS | — | **open** |
| `POST /api/sessions/{id}/nodes` | `session_service.add_node` — только CAS | — | **open** |
| `DELETE /api/sessions/{id}/nodes/{node_id}` | `session_service.delete_node` — только CAS | — | **open** |
| `POST /api/sessions/{id}/edges` | `session_service.add_edge` — только CAS | — | **open** |
| `DELETE /api/sessions/{id}/edges` | `session_service.delete_edge` — только CAS | — | **open** |
| `GET /api/sessions/{id}/bpmn_meta` | `session_service.bpmn_meta_get` — нет request | — | **open** |
| `PATCH /api/sessions/{id}/bpmn_meta` | `session_service.bpmn_meta_patch` — только CAS | — | **open** |
| `POST /api/sessions/{id}/bpmn_meta/infer_rtiers` | `session_service.bpmn_meta_infer_rtiers` — только CAS | — | **open** |
| `GET /api/sessions/{id}/bpmn` | `_legacy_main.session_bpmn_export` → `_legacy_load_session_scoped` | membership + project scope | no `export` flag |
| `GET /api/sessions/{id}/overlays` | `get_overlays_json(session_id)` | — | **open** |
| `PUT /api/sessions/{id}/bpmn` | `_legacy_main.session_bpmn_save` → `_can_edit_workspace` | editor/admin | role-based, no `edit` flag |
| `GET /api/sessions/{id}/bpmn/versions` | `_legacy_main.session_bpmn_versions_list` → `_legacy_load_session_scoped` | membership + project scope | no `view` flag |
| `GET /api/sessions/{id}/bpmn/versions/{vid}` | `_legacy_main.session_bpmn_version_detail` → `_legacy_load_session_scoped` | membership + project scope | no `view` flag |
| `POST /api/sessions/{id}/bpmn/restore/{vid}` | `_legacy_main.session_bpmn_restore` → `_can_edit_workspace` | editor/admin | role-based, no `edit` flag |
| `DELETE /api/sessions/{id}/bpmn` | `_legacy_main.session_bpmn_clear` — только CAS | — | **open** |
| `GET /api/sessions/{id}/export` | `_legacy_main.export` → `st.load(session_id)` | storage org scope | **open**, no `export` flag |
| `GET /api/sessions/{id}/export.zip` | `_legacy_main.export_zip` → `st.load(session_id)` | storage org scope | **open**, no `export` flag |
| `/api/orgs/{oid}/sessions/{sid}/reports/*` | `_session_access_from_request` + `_is_role_allowed` (`_ORG_READ_ROLES` / `_ORG_EDITOR_ROLES` / `_ORG_REPORT_DELETE_ROLES`) | role-based | no permission flags |

### 2.3 Notes (`backend/app/routers/notes.py`)
| Endpoint | Authz | Role/flag basis | Status |
|----------|-------|-----------------|--------|
| `GET /api/sessions/{id}/note-aggregate` | `_load_session_for_notes(write=False)` | membership + project scope | no `view` flag |
| `POST /api/sessions/note-aggregates` | `require_org_member_for_enterprise` + `project_access_allowed` | membership + project scope | no `view` flag |
| `GET /api/projects/{id}/note-aggregate` | `_load_project_for_notes` | membership + project scope | no `view` flag |
| `GET /api/folders/{id}/note-aggregate` | `_load_folder_for_notes` | membership + project scope | no `view` flag |
| `GET /api/sessions/{id}/mentionable-users` | `_load_session_for_notes(write=False)` | membership + project scope | no `view` flag |
| `GET /api/note-mentions`, `/api/note-notifications` | `require_org_member_for_enterprise` + `project_access_allowed` | membership + project scope | no `view` flag |
| `POST /api/sessions/{id}/note-threads` | `_load_session_for_notes(write=True)` → `can_edit_workspace` | editor/admin | role-based, no `create/edit` flag |
| `GET /api/sessions/{id}/note-threads` | `_load_session_for_notes(write=False)` | membership + project scope | no `view` flag |
| `POST /api/note-threads/{id}/comments` | `_load_thread_session_for_notes(write=True)` → `can_edit_workspace` | editor/admin | role-based, no `create` flag |
| `PATCH /api/note-comments/{id}` | `_load_thread_session_for_notes(write=True)` + ownership check | editor/admin + author | role-based, no `edit` flag |
| `POST /api/note-mentions/{id}/acknowledge` | `require_org_member_for_enterprise` | membership | no role |
| `POST /api/note-threads/{id}/attention-acknowledgement`, `/read` | `_load_thread_session_for_notes(write=False)` | membership + project scope | no role |
| `PATCH /api/note-threads/{id}` | `_load_thread_session_for_notes(write=True)` → `can_edit_workspace` | editor/admin | role-based, no `edit` flag |

### 2.4 Org property dictionary (`backend/app/routers/org_property_dictionary.py`)
| Endpoint | Authz | Role/flag basis | Status |
|----------|-------|-----------------|--------|
| Все CRUD операций/свойств/значений | `_ensure_org_member` → `require_org_member_for_enterprise` | любой member орг | **open within org**, no `create/edit/delete` flags |

### 2.5 Admin (`backend/app/routers/admin.py`)
| Endpoint group | Authz | Role/flag basis | Status |
|----------------|-------|-----------------|--------|
| `/api/admin/dashboard`, `/api/admin/orgs`, `/api/admin/users`, `/api/admin/projects`, `/api/admin/sessions`, `/api/admin/audit` | `_admin_context` | `_ADMIN_ALLOWED_ROLES = {org_owner,org_admin,project_manager,auditor}` | role-based, no permission flags |
| `/api/admin/ai/*`, `/api/admin/error-events`, `/api/admin/rag/settings` | `_platform_admin_context` или `_telemetry_read_context` | `is_admin=True` / `_TELEMETRY_READ_ROLES` | role-based, no permission flags |
| `POST /api/admin/users`, `PATCH /api/admin/users/{id}` | `_admin_context` + нормализация `permissions` | роль сохраняется, `permissions_json` пишется в БД | **хранит флаги, но не применяет** |

### 2.6 Прочие роутеры (кратко)
| Роутер | Паттерн authz | Status |
|--------|---------------|--------|
| `auth.py` | публичные login/refresh/invite + `require_authenticated_user` для `/api/auth/me` | — |
| `version.py` | публичный | — |
| `error_events.py` | токен, но не membership/роль | open within authenticated user |
| `feature_flags.py` | публичный GET; PATCH/PUT требуют `is_admin` | — |
| `org.py` | делегирует `org_service.py` (role checks) | role-based |
| `org_members.py` | `enterprise_require_org_member` | membership |
| `org_invites.py` | `enterprise_require_org_member` / `enterprise_require_org_role` | role-based |
| `org_listing.py` | `require_authenticated_user` + membership | — |
| `projects.py` | `enterprise_require_project_access` + role checks | role-based |
| `explorer.py` | `require_authenticated_user` + `_legacy_main` helpers (`_can_edit_workspace`, `_can_manage_workspace`) | role-based |
| `product_actions_registry.py`, `process_properties_registry.py`, `product_actions_ai.py`, `rag.py` | `require_authenticated_user` + `_legacy_load_session_scoped` / `session_access_from_request` | membership + project scope |
| `project_analytics.py` | `enterprise_require_project_access` | membership + project scope |
| `auto_pass.py` | `_legacy_load_session_scoped` | membership + project scope |
| `reports.py` | (не вошёл в core-5, анализируется отдельно) | — |
| `system.py`, `clipboard.py` | out of scope | — |

---

## 3. Authz-helper inventory

| Helper | Location | Что проверяет | Использует `permissions_json`? |
|--------|----------|---------------|-------------------------------|
| `practical_role_for_org` | `utils/authz.py` | имя роли → admin/editor/viewer | нет |
| `can_edit_workspace` | `utils/authz.py`, `services/org_workspace.py` | роль ∈ {admin, editor} | нет |
| `can_manage_workspace` | `utils/authz.py`, `services/org_workspace.py` | роль == admin | нет |
| `can_delete_workspace_content` | `utils/authz.py` | роль == admin | нет |
| `is_role_allowed` | `utils/authz.py` | роль в множестве | нет |
| `enterprise_require_project_access` | `utils/authz.py` | membership + project scope | нет |
| `session_access_from_request` | `utils/authz.py` | membership + project scope | нет |
| `enterprise_require_org_member` | `services/org_workspace.py` | membership + роль ∈ `ORG_READ_ROLES` | нет |
| `enterprise_require_org_role` | `services/org_workspace.py` | membership + роль в allowed | нет |
| `project_scope_for_request` | `services/org_workspace.py` | `get_effective_project_scope` | нет |
| `project_access_allowed` | `services/org_workspace.py` | project scope | нет |
| `_legacy_load_session_scoped` | `_legacy_main.py` | membership + project scope | нет |
| `_legacy_load_project_scoped` | `_legacy_main.py` | membership + project scope | нет |
| `_can_edit_workspace` | `_legacy_main.py` | роль ∈ {admin, editor} | нет |
| `_can_delete_workspace_content` | `_legacy_main.py` | роль == admin | нет |
| `_require_diagram_cas_or_409` | `utils/session_helpers.py` | CAS/optimistic locking | нет |

---

## 4. Disconnect с `permissions_json`

| Флаг | Где должен бы проверяться | Где реально проверяется |
|------|---------------------------|-------------------------|
| `view` | чтение сессий, шаблонов, notes, reports, export | storage read scope / `_legacy_load_session_scoped` (role+project), **не флаг** |
| `create` | создание сессий, шаблонов, проектов, notes threads | `_can_edit_workspace` / `_ORG_TEMPLATE_WRITE_ROLES`, **не флаг** |
| `edit` | patch сессий, BPMN save, nodes/edges, notes, bpmn_meta | `_can_edit_workspace` / CAS, **не флаг**; node/edge вообще без проверки |
| `export` | BPMN export, JSON/ZIP export | **не проверяется** |
| `delete` | удаление сессий, шаблонов, comments, report versions | `_can_delete_workspace_content` / ownership, **не флаг** |
| `manage_users` | управление members, invites, admin users | `_ORG_MEMBER_MANAGE_ROLES` / `_ORG_INVITE_MANAGE_ROLES` / `is_admin`, **не флаг** |

---

## 5. Risk notes
- **Dual implementation session delete.** `session_service.delete_session` (используется роутером) запрещает org_admin удалять чужие сессии (только owner/admin), тогда как `_legacy_main.delete_session_api` разрешает admin-роли орг. Это несоответствие.
- **Node/edge mutations open.** Любой аутентифицированный member орг может мутировать диаграмму, если знает `session_id`, даже viewer.
- **BPMN-meta / overlays open.** `bpmn_meta_get` вообще не принимает `request`; `overlays` не проверяет доступ.
- **Export open.** Export endpoints не проверяют `export`-флаг и не требуют роли.
- **Property dictionary open.** Любой member может менять орг-wide справочник.
