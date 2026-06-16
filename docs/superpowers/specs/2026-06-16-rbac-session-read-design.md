# Design: RBAC for Session Read Access

**Date:** 2026-06-16
**Contour:** `feature/rbac-session-read`
**Scope:** Backend authorization for reading sessions inside an organization.

## Context

Currently `backend/app/services/session_service.py` uses temporary stubs:
- `get_session` calls `session_repo.load(..., is_admin=True)`.
- `list_project_sessions` defaults to `is_admin=True`.

This allows any org member to see/open any session in the org. The real business rules are supposed to consider `org_memberships.role` and `project_memberships`.

## Goal

Replace the stubs with correct RBAC checks for **reading** sessions while keeping **write/delete/rename** restricted to the session owner and global admins.

## Access Model

| Actor | Read access | Write/delete/rename access |
|-------|-------------|----------------------------|
| Global admin (`users.is_admin = true`) | Any session | Any session |
| `org_owner` / `org_admin` / `auditor` in the org | Any session in the org | No extra write access (owner/admin only) |
| `editor` | Sessions in projects where they have `project_memberships` | Their own sessions only |
| `org_viewer` | Sessions in projects where they have `project_memberships`, read-only | No write access |
| Session owner | Own session | Own session |

## Error Handling

- Missing org membership or no access → `403 Forbidden` with a clear message:
  ```json
  {"detail": "Недостаточно прав для открытия этой сессии."}
  ```
- Session not found → `404 Not Found`.

## Architecture

We keep RBAC logic in the service layer and use existing helpers from `backend/app/utils/authz.py` and `backend/app/services/org_workspace.py`:

- `session_access_from_request(request, session_id, org_id=None)` — returns `(session, scope, error)`.
- `project_scope_for_request(request, org_id)` — returns `{"mode": "all" | "scoped", "project_ids": [...]}`.
- `project_access_allowed(request, org_id, project_id)` — boolean.
- `can_edit_workspace(role, is_admin)` — used to decide if the caller can create sessions in a project.

Storage (`backend/app/storage.py`) keeps the existing `owner_user_id` / global-admin check as a safety net. The service layer enforces the richer rules.

## Router Changes

`backend/app/routers/sessions.py`:
- Add `request: Request` parameter to:
  - `get_session(session_id, request)`
  - `delete_session(session_id, request)`
  - `list_project_sessions(..., request)`
  - `create_session(..., request)`
- Pass `request` to service calls.

## Service Changes

`backend/app/services/session_service.py`:

### `get_session(session_id, *, request)`
1. Use `session_access_from_request(request, session_id)`.
2. If error → raise `403` with explicit message.
3. If session is missing → raise `404`.
4. Return session.

### `list_project_sessions(project_id, *, request, ...)`
1. Resolve `org_id` from request/project.
2. Compute `project_scope_for_request(request, org_id)`.
3. If `mode == "all"` → list all sessions for the project/org.
4. If `mode == "scoped"` → list only sessions whose `project_id` is in `project_ids`.
5. Never pass `is_admin=True` by default.

### `delete_session(session_id, *, request)`
1. Use `session_access_from_request(request, session_id)` to load session.
2. Allow only if caller is global admin or `session.owner_user_id == caller_user_id`.
3. Otherwise raise `403`.

### `create_session(..., request)`
1. Check `project_access_allowed(request, org_id, project_id)`.
2. If not allowed → raise `403`.
3. Proceed with creation.

## Repository / Storage

`backend/app/repositories/session_repo.py`:
- Keep signatures; remove forced `is_admin=True` from service calls.

`backend/app/storage.py`:
- `SessionStorage.load` / `delete` / `rename` keep owner/admin checks.
- No schema changes.

## Tests

Add `backend/tests/test_session_read_rbac.py` using TDD:

- Global admin can read any session.
- Org admin can read any session in the org.
- Auditor can read any session in the org.
- Editor with project membership can read sessions in that project.
- Editor without project membership cannot read sessions in other projects (403).
- Org viewer can read sessions in allowed projects (read-only).
- Owner can read own session.
- Org admin cannot delete someone else's session (403).
- Editor cannot delete someone else's session (403).
- `list_project_sessions` does not leak sessions from projects the editor cannot access.

## Rollback Plan

If production issues occur, revert to the previous behavior by restoring `is_admin=True` in:
- `session_service.py::get_session`
- `session_service.py::list_project_sessions`

This can be done via a single revert commit or an emergency patch.

## Out of Scope

- Changing the database schema.
- Refactoring legacy `_legacy_main.py` session routes (they already have their own RBAC).
- Adding frontend permission UI.
