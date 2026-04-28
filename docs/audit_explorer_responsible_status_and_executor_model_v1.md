# Audit: Explorer Responsible, Status, And Executor Model v1

Contour: `audit/explorer-responsible-status-and-executor-model-v1`
Type: audit-only, source-backed
Date: 2026-04-28
Base commit: `958c2c001793ae7f4f912c838f13347e1775bbea`

## Runtime / Source Truth

| Item | Value |
|---|---|
| Repo/worktree | `/Users/mac/PycharmProjects/processmap_explorer_responsible_status_audit_v1` |
| Remote | `origin git@github.com:xiaomibelov/processmap_v1.git` |
| Branch | `audit/explorer-responsible-status-and-executor-model-v1` |
| HEAD | `958c2c001793ae7f4f912c838f13347e1775bbea` |
| origin/main | `958c2c001793ae7f4f912c838f13347e1775bbea` |
| merge-base | `958c2c001793ae7f4f912c838f13347e1775bbea` |
| git status before audit doc | clean |
| App version | `v1.0.51` in `frontend/src/config/appVersion.js` |
| Local runtime | not started; audit is source-only |
| Stage runtime | not used; no deploy requested |

Surfaces inspected:

- Workspace Explorer root and folder pages: `frontend/src/features/explorer/WorkspaceExplorer.jsx`
- Explorer API wrapper: `frontend/src/features/explorer/explorerApi.js`
- Explorer backend router: `backend/app/routers/explorer.py`
- Durable schema and storage: `backend/app/storage.py`, `backend/app/models.py`
- Session workflow status: `backend/app/session_status.py`, `frontend/src/features/workspace/workspacePermissions.js`
- Org user/member directory: `backend/app/services/org_workspace.py`, `backend/app/routers/org_members.py`, `frontend/src/lib/apiModules/orgApi.js`

## GSD Proof

- `gsd` standalone: not installed.
- `gsd-sdk`: `/Users/mac/.nvm/versions/node/v22.19.0/bin/gsd-sdk`, version `v0.1.0`.
- `gsd-sdk query init.phase-op audit/explorer-responsible-status-and-executor-model-v1` completed.
- Limitation: no `.planning` workspace and GSD agents are not installed in this fresh clone; continued with GSD discipline and source-backed audit.

## Current Explorer / User / Status Source Map

| Entity | Current durable fields | Current UI fields | Current API fields | Gap |
|---|---|---|---|---|
| Раздел / top-level folder | `workspace_folders.id/org_id/workspace_id/parent_id/name/sort_order/created_by/created_at/updated_at/archived_at` (`backend/app/storage.py`) | Type label `Раздел` derived when root-level folder has no parent; status cell renders `—`; context cell shows project count | `GET /api/explorer` emits folder id/name/parent/counts/rollups/activity timestamps only (`backend/app/routers/explorer.py`) | No durable `responsible_user_id`; no `context_status`; top-level section-ness is derived from tree position, not a stored entity type |
| Папка / nested folder | Same `workspace_folders` row as section | Type label `Папка`; status `—`; context cell shows project count | Same folder payload from `GET /api/explorer` and `GET /api/folders/{folder_id}` | No durable responsible/status; `created_by` exists but is creator metadata, not business assignee |
| Проект | `projects.id/title/passport_json/owner_user_id/org_id/workspace_id/folder_id/created_by/updated_by/created_at/updated_at/version` | Explorer row shows `Owner: {project.owner.name}` in `Контекст`; project status badge from `project.status` unless `active`; sessions count; DoD | `GET /api/explorer` maps `owner_user_id` to `owner`, `passport.status` to `status`; `POST /api/folders/{folder_id}/projects` accepts `owner_user_id`; legacy `PATCH /api/projects/{project_id}` merges `passport` | No durable `executor_user_id`; `owner_user_id` is creator/access-scope field and should not be redefined as executor |
| Сессия | `sessions.interview_json` contains workflow `status/stage`; `sessions.owner_user_id/created_by/updated_by`; diagram writer fields separate | Project page shows status selector (`Черновик`, `В работе`, `На проверке`, `Готово`, `Архив`), stage, Owner | `GET /api/projects/{project_id}/explorer` emits sessions with owner/status/stage from `list_project_sessions_for_explorer`; `PATCH /api/sessions/{session_id}` validates workflow status | Workflow status already exists; do not mix AS IS/TO BE with session workflow status |
| Org user/member | `users.id/email/full_name/job_title`; `org_memberships` roles; project memberships also exist | Org settings/admin use members with profile fields | `GET /api/orgs/{org_id}/members` via `apiListOrgMembers` returns `items` with email/full_name/job_title, but only org owner/admin/auditor can read today | Picker source exists, but permission policy for assigning responsible/executor must be decided |

## Field Concept Source Map

| Field concept | Existing source? | Meaning today | Can reuse? | Risk |
|---|---:|---|---|---|
| `owner_user_id` | Yes: `projects`, `sessions`, templates | Owner/access-scope creator-like field. Set from request user at create; preserved on save; used by legacy owner filters and Explorer owner display | No for business executor; maybe backfill candidate only after explicit product decision | Reusing it would silently redefine access/audit semantics and make existing "Owner" technical debt permanent |
| `created_by` | Yes: projects/sessions/folders | Creation actor metadata, backfilled from owner in old migrations | No for responsible/executor | Creator is historical, not accountable current person |
| `updated_by` | Yes: projects/sessions | Last updater metadata | No | Last updater is activity metadata, not responsibility |
| `responsible_user_id` | No for `workspace_folders` | Missing | Required for folder/section responsible | Needs schema, API, cache invalidation, UI picker, permission checks |
| `executor_user_id` | No for `projects` | Missing | Required for project executor | Needs schema/API; do not store as arbitrary `passport.executor` if it must be durable/filterable |
| `passport.status` | Yes for projects only | Flexible project passport field; Explorer treats `active` as empty and badges non-active values | Not for AS IS/TO BE unless product accepts project context status in passport | Name `status` conflicts with workflow/project lifecycle; not present on folders |
| `interview.status` | Yes for sessions | Canonical session workflow status (`draft/in_progress/review/ready/archived`) | No for AS IS/TO BE | Would mix process context with workflow state |

## Owner vs Responsible vs Executor Verdict

Findings:

- `ProjectStorage.create` sets `owner_user_id`, `created_by`, and `updated_by` from request user. `ProjectStorage.save` preserves existing owner and only falls back to current user when missing.
- `Storage.create` for sessions sets `owner_user_id`, `created_by`, `updated_by` from request user. `Storage.save` preserves existing owner and uses it for permission checks.
- `ProjectStorage.list/load` and `Storage.load/save` still use owner filters/guards when not admin or when scoped legacy APIs pass user scope.
- Explorer currently renders project owner as `Owner: ...` and session owner as `Owner`.
- Folder `created_by` is set on create, but folder rename/move/delete do not reinterpret it as assignee.
- No source-backed `responsible`, `assignee`, or `executor` field exists for Explorer entities.

Verdicts:

- `OWNER_IS_TECHNICAL_NOT_EXECUTOR`: yes.
- `PROJECT_OWNER_CAN_BE_REUSED_AS_EXECUTOR`: no, not safely.
- `PROJECT_EXECUTOR_NEEDS_NEW_FIELD`: yes.
- `FOLDER_RESPONSIBLE_FIELD_MISSING`: yes.
- `CREATED_BY_NOT_RESPONSIBLE`: yes.

## Folder / Section Responsible Verdict

Findings:

- Section vs folder is currently a frontend/backend tree-position concept: root-level folder is displayed as `Раздел`; nested folder as `Папка`.
- Durable `workspace_folders` has no business status and no responsible user.
- `created_by` exists and is write-time metadata only.
- Org members directory exists, but `GET /api/orgs/{org_id}/members` is currently limited to org owner/admin/auditor. Editors can create/edit Explorer content but may not be allowed to read full member directory.
- Existing workspace edit permissions are `org_owner`, `org_admin`, `project_manager`, `editor`; delete/manage is stricter.

Verdicts:

- `FOLDER_RESPONSIBLE_SCHEMA_REQUIRED`: yes, add to `workspace_folders`.
- `SECTION_RESPONSIBLE_PRODUCT_DECISION`: required. Technically sections and folders share table, so the same field can support both; product must decide whether section responsible is required or optional.
- `RESPONSIBLE_INHERITANCE_PRODUCT_DECISION`: required. Source has no inheritance model. Recommended v1: no inheritance, render `—`/`Не назначен` for empty values.
- `ORG_MEMBER_DIRECTORY_REUSABLE`: yes with permission adjustment or a new scoped picker endpoint.
- `RESPONSIBLE_ASSIGNMENT_PERMISSIONS_REQUIRED`: yes. Recommended initial rule: same as workspace edit (`org_owner/org_admin/project_manager/editor`) can assign; only org member ids accepted.

## Project Executor Verdict

Findings:

- Project has `owner_user_id`, not executor. The value is request user at project creation and is preserved.
- Explorer project creation accepts optional `owner_user_id`, stores it in `passport["owner_user_id"]`, but durable project row owner remains the creating user in `create_project_in_folder`; the source of truth displayed in Explorer is row `owner_user_id`, not passport owner.
- Legacy project `PATCH /api/projects/{project_id}` can merge arbitrary passport fields; that is flexible but not ideal for durable executor because Explorer list queries and sorting need typed columns.
- No source supports multiple executors today.

Verdicts:

- `PROJECT_EXECUTOR_FIELD_MISSING`: yes.
- `PROJECT_OWNER_SEMANTICS_AMBIGUOUS`: yes; owner is both legacy access field and visible UI field.
- `PROJECT_EXECUTOR_SINGLE_USER_V1`: recommended.
- `PROJECT_EXECUTOR_MULTI_USER_OUT_OF_SCOPE`: yes.
- `PROJECT_EXECUTOR_API_REQUIRED`: yes; create/update Explorer and legacy project endpoints must accept and validate `executor_user_id`.

## AS IS / TO BE Context Status Verdict

Findings:

- Session workflow status is explicitly modeled in `backend/app/session_status.py` as `draft`, `in_progress`, `review`, `ready`, `archived`, with frontend labels `Черновик`, `В работе`, `На проверке`, `Готово`, `Архив`.
- Folder/section status does not exist; Explorer renders `—` for folders.
- Project status currently comes from `passport.status` and defaults to `active`; Explorer hides `active` as `—`.
- `passport.status` is flexible project metadata, not a typed process-context field.

Verdicts:

- `SESSION_WORKFLOW_STATUS_EXISTS_DO_NOT_REUSE_BLINDLY`: yes.
- `FOLDER_CONTEXT_STATUS_MISSING`: yes.
- `SECTION_CONTEXT_STATUS_SCHEMA_REQUIRED`: yes if sections need AS IS/TO BE.
- `PROJECT_STATUS_AMBIGUOUS`: yes.
- `ASIS_TOBE_SHOULD_BE_CONTEXT_STATUS`: yes. Use a name like `context_status`, not generic `status`.
- `STATUS_MODEL_PRODUCT_DECISION_REQUIRED`: yes for whether project also receives context status.

Recommended values:

| Value | Display |
|---|---|
| `none` | `—` |
| `as_is` | `AS IS` |
| `to_be` | `TO BE` |

## Explorer Column Model Recommendation

Current root/folder Explorer columns:

- `Название`
- `Тип`
- folder/project count
- `Контекст` (currently projects show `Owner: ...`; folders show project count)
- `DoD`
- optional signal columns
- `Статус`
- `Обновлён`
- `Последнее изменение`
- actions

Current project sessions columns:

- `Название`
- `Статус`
- `Стадия`
- `Owner`
- `DoD`
- optional discussions/signal columns
- `Обновлена`
- actions

Recommended future type-aware columns:

| Entity | Status column | Responsible / executor column |
|---|---|---|
| Раздел | `context_status` as `—/AS IS/TO BE` | Product decision: show responsible if enabled; else `—` |
| Папка | `context_status` as `—/AS IS/TO BE` | `responsible_user` display name; empty `Не назначен` or `—` |
| Проект | no project status in v1 unless product decides; optional `context_status` later | `executor_user` display name; empty `Не назначен` |
| Сессия | existing workflow status only | keep current session owner unless a separate session assignment feature is planned |

Verdicts:

- `EXPLORER_COLUMN_MODEL_NEEDS_TYPE_AWARE_RENDERING`: yes.
- `OWNER_COLUMN_SHOULD_BE_DEMOTED`: yes. Technical owner should not be the primary business field.
- `RESPONSIBLE_EXECUTOR_COMBINED_COLUMN_FEASIBLE`: yes. Recommended label: `Ответственный / Исполнитель` or shorter `Ответственный`.
- `TYPE_AWARE_STATUS_REQUIRED`: yes. Folder/section context status must not share semantics with session workflow status.

## Backend / Schema / API Feasibility

Recommended durable model to evaluate:

Folder / Section in `workspace_folders`:

```sql
responsible_user_id TEXT NULL
context_status TEXT NOT NULL DEFAULT 'none'
responsible_assigned_at INTEGER NULL
responsible_assigned_by TEXT NULL
```

Project in `projects`:

```sql
executor_user_id TEXT NULL
```

Optional only if product approves project AS IS/TO BE:

```sql
context_status TEXT NOT NULL DEFAULT 'none'
```

Why typed columns over JSON/passport:

- Explorer list queries already project row fields from SQL and cache the result.
- Sorting/filtering/display enrichment is easier and safer with typed columns.
- Folder rows have no JSON blob today; adding a JSON bag just for this would create a second pattern.
- `passport.status` already means "whatever project passport says", and would collide with context/workflow semantics.

API changes required:

- Extend `GET /api/explorer` folder and project item payloads with:
  - `responsible_user_id`, `responsible_user` for folders/sections.
  - `context_status` for folders/sections.
  - `executor_user_id`, `executor_user` for projects.
- Extend `GET /api/folders/{folder_id}` and `PATCH /api/folders/{folder_id}` for responsible/status.
- Extend `POST /api/workspaces/{workspace_id}/folders` if create-time assignment is needed.
- Extend `POST /api/folders/{folder_id}/projects`, `GET /api/projects/{project_id}/explorer`, legacy `GET/PATCH /api/projects/{project_id}` for executor.
- Add or adjust user picker endpoint:
  - Reuse org members if read permission is expanded safely; or
  - Add `GET /api/orgs/{org_id}/member-picker` / Explorer-scoped picker returning safe profile fields for assignable org members.
- Invalidate Explorer children/session caches when responsible/status/executor changes.

Feasibility verdicts:

- `BACKEND_SCHEMA_REQUIRED`: yes.
- `EXPLORER_API_ENRICHMENT_REQUIRED`: yes.
- `SQLITE_POSTGRES_MIGRATION_REQUIRED`: yes. Use `_ensure_schema` column-exists guards compatible with both runtime backends.
- `BACKFILL_DECISION_REQUIRED`: yes. Recommended default: folder responsible null, folder context_status `none`, project executor null. Do not auto-copy owner to executor unless product explicitly accepts that as migration policy.

## Product Decisions Required

1. Is responsible required for both `Раздел` and `Папка`, or only `Папка`?
2. Should responsible inherit down hierarchy: section -> folder, folder -> child folder, folder -> project?
3. Is project executor one user or multiple users? Recommended v1: one user.
4. Can `owner_user_id` be used as one-time executor backfill, or must executor start empty? Recommended: start empty unless product wants migration.
5. Does project need `AS IS / TO BE`, or only folders/sections?
6. Empty display: `—` or `Не назначен`? Recommended: `—` in dense tables, `Не назначен` in picker/details.
7. Who can assign responsible/executor? Recommended: same roles that can edit workspace/project.
8. Should assignment changes write audit log events? Recommended: yes for responsible/executor/status changes.
9. Should org editors be allowed to read a safe member picker, even though full org members API is currently limited?

## Recommended Implementation PR Stack

1. `backend/explorer-responsible-context-status-fields-v1`
   - Add `workspace_folders.responsible_user_id`.
   - Add `workspace_folders.context_status`.
   - Add `projects.executor_user_id`.
   - Add optional `projects.context_status` only if product says project AS IS/TO BE is in scope.
   - Expose fields in Explorer APIs and validate org member ids.
   - Add backend tests for schema, payloads, permissions, cache invalidation.

2. `uiux/explorer-responsible-executor-picker-v1`
   - Add user picker from org members / safe picker endpoint.
   - Assign responsible for folder/section.
   - Assign executor for project.
   - Display type-aware `Ответственный / Исполнитель` Explorer column.

3. `uiux/explorer-context-status-controls-v1`
   - Add selector for folder/section: `—`, `AS IS`, `TO BE`.
   - Render compact badges in Explorer.
   - Keep session workflow statuses unchanged.

4. `uiux/explorer-owner-column-cleanup-v1`
   - Stop showing technical `Owner` as primary business field.
   - Keep owner only in details/debug if still useful.

5. Optional later: `feature/explorer-responsible-inheritance-v1`
   - Only after product decides inheritance semantics and empty-value behavior.

## Exact Files Likely To Change In Future Implementation

Backend:

- `backend/app/storage.py`
- `backend/app/models.py`
- `backend/app/routers/explorer.py`
- `backend/app/services/org_workspace.py`
- `backend/app/routers/org_members.py` or a new picker router
- `backend/app/_legacy_main.py` for legacy project create/update/read if project executor is exposed outside Explorer
- `backend/tests/test_*explorer*.py`
- `backend/tests/test_enterprise_org_scope_api.py`

Frontend:

- `frontend/src/features/explorer/WorkspaceExplorer.jsx`
- `frontend/src/features/explorer/explorerApi.js`
- `frontend/src/features/explorer/explorerSortModel.js`
- `frontend/src/features/explorer/explorerSearchModel.js`
- `frontend/src/features/explorer/*.test.mjs`
- `frontend/src/lib/apiModules/orgApi.js` or new picker API wrapper

## Migration / Test Plan For Future Implementation

Migration:

- Add nullable/default columns with `_column_exists` guards.
- Backfill `workspace_folders.context_status = 'none'`.
- Backfill `projects.executor_user_id = NULL` / empty string.
- Do not backfill executor from owner unless product explicitly approves.
- Add validation helper for context status: `none/as_is/to_be`.
- Add validation helper that assigned user is member of the same org.

Backend tests:

- Existing folders/projects still list after migration.
- Folder responsible can be null.
- Folder context_status defaults to `none`.
- Invalid context_status rejected.
- Responsible/executor must be org member.
- Unauthorized assignment rejected.
- Explorer list includes enriched user display fields.
- Cross-org user ids are not leaked.
- Cache invalidates after folder/project assignment/status updates.

Frontend tests:

- Type-aware status rendering: folder/section context vs session workflow.
- Empty responsible/executor renders `—` or `Не назначен` per product decision.
- Owner is not shown as executor.
- Sorting/search use responsible/executor/context status, not technical owner.
- Existing session status selector still works.

## Runtime Validation Plan For Future Implementation

1. Create section and nested folder.
2. Assign responsible to folder from org member picker.
3. Set folder context status to `AS IS`, then `TO BE`, then `—`.
4. Create project and assign executor.
5. Confirm Explorer root/folder rows show correct type-aware values.
6. Confirm project page still shows sessions with workflow statuses.
7. Confirm user without edit permission cannot assign responsible/executor.
8. Confirm cross-org users cannot be selected or persisted.
9. Confirm refresh/reopen keeps values durable.
10. Confirm technical owner is not presented as executor.

## Final Audit Verdict

The current `owner_user_id` is technical creator/access-scope truth, not a reliable business executor. Explorer needs durable, typed fields for business responsibility:

- `workspace_folders.responsible_user_id` for folder/section responsible.
- `workspace_folders.context_status` for `AS IS / TO BE / —`.
- `projects.executor_user_id` for project executor.
- Optional `projects.context_status` only after product decision.

Do not implement frontend-only fake responsible/status/executor fields. The next implementation contour should start with backend schema/API truth, then UI controls and owner-column cleanup.
