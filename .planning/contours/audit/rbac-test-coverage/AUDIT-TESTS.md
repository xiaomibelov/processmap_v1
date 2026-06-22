# AUDIT-TESTS.md — RBAC test coverage audit

## Source truth
- **worktree:** `/opt/processmap-test/.worktrees/audit-rbac-test-coverage`
- **branch:** `audit/rbac-test-coverage`
- **HEAD:** `f3a1eaa0f2cd7db93bba771f7461b5e527b26648`
- **audited files:** 10 backend test files under `backend/tests/`

## Legend
- **ПОКРЫТО** — в анализируемых тестах есть прямой assert 403/401/404 для целевого сценария.
- **ЧАСТИЧНО** — есть смежные проверки, но не целевой сценарий.
- **НЕ ПОКРЫТО** — ни одного теста на целевой сценарий.

## Matrix: RBAC gap × test file × status

| # | RBAC gap | Test file(s) | Status | Evidence / scenario covered | Missing scenario to test |
|---|----------|--------------|--------|-----------------------------|--------------------------|
| 1 | **Session delete separated from edit** — 403 for editor without delete permission | `test_session_read_rbac.py`<br>`test_workspace_access_controls.py` | **ЧАСТИЧНО** | `test_org_admin_cannot_delete_someone_elses_session` (403)<br>`test_editor_cannot_delete_someone_elses_session` (403)<br>`test_owner_can_delete_own_session`<br>`test_editor_can_change_status_but_cannot_delete_session` | Current tests check role-name editor. They do **not** cover an `editor` with granular `delete=True` (should succeed) vs `editor` with `delete=False` (should fail). |
| 2 | **Export** — 403 for viewer on `GET /api/sessions/{id}/export` | `test_bpmn_save_rbac_scope.py` | **ЧАСТИЧНО** | `test_editor_can_export_bpmn_for_project_session` (200)<br>`test_editor_can_save_and_viewer_is_denied` for `session_bpmn_save` (403) | No test asserts that `viewer` is denied on `GET /api/sessions/{id}/export` or `/export.zip`. |
| 3 | **Discussions** — 403 for viewer on `POST /api/sessions/{id}/note-threads` | `test_notes_mvp1_api.py` | **ПОКРЫТО** | `test_auth_and_permission_denial`: `viewer` gets 403 on `create_session_note_thread`; `viewer` reads 0 threads. | Could additionally cover `viewer` trying to edit/delete a thread/comment (currently only peer-editor ownership edit is tested). |
| 4 | **Templates org-scope** — 403 for editor creating org template | `test_templates_rbac.py` | **ЧАСТИЧНО** | `test_member_cannot_create_org_template` (`viewer` 403)<br>`test_admin_can_create_org_template_and_member_can_list`<br>`test_manager_can_create_and_delete_org_template` | No test for `editor` creating org template. Also no test for granular `create=True` / `create=False` inside `editor`. |
| 5 | **Invites** — delegated `manage_users` permission | `test_workspace_access_controls.py` | **ЧАСТИЧНО** | `test_invite_rejects_owner_role_and_keeps_requested_editor_role`<br>`test_workspace_create_requires_org_admin_or_platform_admin` | Invites are created only by `admin`. There is no test that a non-admin with `manage_users=True` can invite, or that an admin with `manage_users=False` cannot. |
| 6 | **Project members** — granular member management | `test_project_membership_scope.py`<br>`test_workspace_access_controls.py` | **ЧАСТИЧНО** | Project-scope assignment tests exist (`test_with_assignments_user_is_scoped_to_assigned_projects`, `test_org_admin_override_sees_all_even_if_assignments_exist`). | No test checks granular `manage_users` flag for adding/removing project members or org members. |
| 7 | **AI / auto-pass** — 403 for viewer | *(none of the 10 files)* | **НЕ ПОКРЫТО** | None of the audited files contain `auto_pass`, `ai_questions`, or `answer` endpoint RBAC asserts. | Add test that `viewer` receives 403 on `POST /api/sessions/{id}/ai/questions`, `POST /api/sessions/{id}/answer`, or auto-pass endpoints. |
| 8 | **Property Dictionary** — 403 for editor | `test_org_property_dictionary_api.py` | **НЕ ПОКРЫТО** | Tests assert any org member (including `viewer`) can create/read dictionary entries. No 403 asserts. | If endpoint should be admin-only or require `edit`/`manage`, add test that `editor`/`viewer` is denied write. |
| 9 | **BPMN save** — granular `create`/`edit`/`delete` inside `ORG_WRITE_ROLES` | `test_bpmn_save_rbac_scope.py` | **ЧАСТИЧНО** | `test_platform_admin_and_org_admin_can_read_and_save`<br>`test_editor_can_save_and_viewer_is_denied`<br>`test_org_admin_cannot_write_foreign_org_session` | Tests use role names. They do **not** cover an `org_admin` with `edit=False` (should fail) or an `editor` with `edit=True` (should succeed). |
| 10 | **Admin panel** — platform-admin vs org-admin separation | `test_admin_user_management_api.py` | **ЧАСТИЧНО** | Tests platform admin creating/editing users and org memberships; `admin_orgs` aggregate counts. | No test that an `org_admin` (non-platform) cannot call admin user APIs or cannot manage users outside their org. |

## Summary by status

| Status | Count |
|--------|-------|
| ПОКРЫТО | 1 |
| ЧАСТИЧНО | 7 |
| НЕ ПОКРЫТО | 2 |

## Detailed evidence per test file

### `test_templates_rbac.py`
- Asserts on 403:
  - `test_member_cannot_create_org_template` — `viewer` gets 403 on `create_template_endpoint` with `scope=org`.
  - `test_member_cannot_delete_foreign_org_template` — `viewer` gets 403 on `delete_template_endpoint` for admin-created org template.
- No asserts on `editor` role for org templates, no granular permission asserts.

### `test_session_read_rbac.py`
- Asserts on 403:
  - `test_org_admin_cannot_delete_someone_elses_session`
  - `test_editor_cannot_delete_someone_elses_session`
  - `test_get_session_returns_403_for_access_denied`
- Focus is on read/project-scope; delete is tested only by role name, not by granular delete flag.

### `test_bpmn_save_rbac_scope.py`
- Asserts on 403:
  - `test_editor_can_save_and_viewer_is_denied` — `viewer` denied `session_bpmn_save`.
  - `test_denied_writer_does_not_poison_lock_for_next_allowed_save` — `viewer` denied, then admin succeeds.
- Export tested only for `editor` success (`test_editor_can_export_bpmn_for_project_session`).
- No granular permission asserts inside `org_admin`/`editor`.

### `test_notes_mvp1_api.py`
- Asserts on 401/403:
  - `test_auth_and_permission_denial` — anonymous 401; `viewer` 403 on create thread; `viewer` reads 0 threads.
  - `test_note_comment_reply_and_edit_contract` — peer editor cannot edit another user's comment (403).
- Best covered gap among the 10.

### `test_admin_user_management_api.py`
- No explicit 403 asserts; focuses on platform-admin CRUD and membership persistence.
- Does not test org-admin restrictions.

### `test_session_status_transitions.py`
- Tests `validate_session_status_transition` helper with `can_edit`/`can_archive` booleans.
- No endpoint-level RBAC; no connection to granular permissions.

### `test_org_property_dictionary_api.py`
- No 403 asserts; tests that any org member can create/read dictionary entries and that data is isolated by org.

### `test_workspace_access_controls.py`
- Asserts on 403:
  - `test_editor_can_change_status_but_cannot_delete_session`
  - `test_viewer_cannot_change_status`
  - `test_workspace_rename_requires_admin`
  - `test_workspace_create_requires_org_admin_or_platform_admin`
- Invites tested only for role validation, not for delegated permission.

### `test_project_membership_scope.py`
- Asserts on 404:
  - `test_cross_org_returns_404_for_non_member`
- Focus on project visibility scope, not member-management permissions.

### `test_auth_users_db_profile_storage.py`
- No RBAC asserts; focuses on user/profile storage backfill.

## Recommended test additions (if a fix contour is approved)
1. **Session delete granular:** `editor` with `delete=True` can delete non-owned session; `editor` with `delete=False` gets 403.
2. **Export viewer denial:** `viewer` gets 403 on `/api/sessions/{id}/export` and `/export.zip`.
3. **Templates editor org creation:** `editor` gets 403 on creating org template; `editor` with `create=True` succeeds.
4. **Invites delegated:** user with `manage_users=True` (but not org_admin) can create invite; org_admin with `manage_users=False` cannot.
5. **AI/viewer:** `viewer` gets 403 on AI question/answer/auto-pass endpoints.
6. **Property Dictionary write guard:** `editor`/`viewer` gets 403 on dictionary mutation endpoints if policy requires admin/manage.
7. **BPMN granular:** `org_admin` with `edit=False` cannot save; `editor` with `edit=True` can save.
8. **Admin panel separation:** `org_admin` (non-platform) gets 403 on platform admin user APIs.

## Conclusion
Only **1 of 10** gaps is fully covered by the existing test suite in the analyzed files. Most critical gaps (granular delete/export/AI/property-dictionary/admin separation) are either partially covered or not covered at all. A follow-up fix contour should add the missing tests before/together with the corresponding authz patches.
