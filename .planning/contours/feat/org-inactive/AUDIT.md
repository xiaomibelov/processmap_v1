# Org inactive — Audit

## Current state

- `orgs` table (`backend/app/storage.py` ~1619) has no `is_active` column.
- `GET /api/admin/orgs` (`backend/app/routers/admin.py` ~808) returns all orgs from `request.state.org_memberships` without an inactive filter.
- `GET /api/orgs` endpoint exists but we need to verify if it filters; audit suggests user list is from `apiListOrgs` and may include all memberships.
- Session create/patch endpoints (`_legacy_main.py` ~3825, ~4072) enforce org role but do not check org active state.
- Admin guard `_platform_admin_context` checks `users.is_admin`; admin users bypass org checks.
- Active org is resolved in middleware (`backend/app/startup/middleware.py`) and stored in `request.state.active_org_id`.

## Gaps

1. Schema: add `is_active` to `orgs` (INTEGER DEFAULT 1).
2. Admin API: need `PATCH /api/admin/orgs/:id/status { is_active }` admin-only.
3. User API: `GET /api/orgs` should filter out inactive orgs unless admin.
4. Session create/patch: return 403 if org `is_active=false` for non-admin members.
5. Session read: keep allowed for inactive orgs (read-only).
6. Frontend admin: toggle `is_active` in `AdminOrgsPanel` / `OrgsTable`, visual indicator.
7. Frontend user: disable session creation and show deactivation message when active org is inactive.

## Constraints

- No Alembic: use `storage.py::_ensure_schema()` conditional column addition.
- Must not break read access to existing sessions in inactive orgs.
- Admin can still see/edit everything.
- Test only on `clearvestnic.ru:5177`.
