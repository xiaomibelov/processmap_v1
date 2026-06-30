# Org inactive — Solution

## Backend

### Schema (`backend/app/storage.py`)
In `_ensure_schema()`, after `orgs` table creation:
```sql
ALTER TABLE orgs ADD COLUMN IF NOT EXISTS is_active INTEGER NOT NULL DEFAULT 1
```
(Use `_column_exists()` helper if `ADD COLUMN IF NOT EXISTS` is not portable enough.)

### Storage helpers
- `get_org_record(org_id)` — already exists; update to return `is_active`.
- `set_org_active(org_id, is_active)` — new.
- `is_org_active(org_id)` — new; returns bool.
- `list_org_records()` / `list_user_org_memberships()` — include `is_active`; filtering happens in service layer.

### Admin router (`backend/app/routers/admin.py`)
Add:
```python
class OrgStatusPatchIn(BaseModel):
    is_active: bool

@router.patch("/api/admin/orgs/{org_id}/status")
def admin_patch_org_status(org_id: str, body: OrgStatusPatchIn, request: Request):
    uid, oid, err = _platform_admin_context(request)
    if err: return err
    org = org_repo.set_active(org_id, body.is_active)
    return org
```
Also update `GET /api/admin/orgs` to include `is_active` in `_org_aggregate_item`.

### User org listing (`backend/app/routers/org.py` or org_listing.py)
Update `GET /api/orgs` to filter inactive orgs when `not is_admin`.

### Session guards
In `_legacy_main.py`:
- `create_project_session()` / `create_session()` / `patch_session()`: after resolving `oid`, if not admin and `not is_org_active(oid)`, raise `HTTPException(403, detail="organization_inactive")`.
- Keep read paths (`get_session`, list) untouched.

## Frontend

### API
- `apiRoutes.admin.orgStatus(orgId)` → `/api/admin/orgs/:id/status`
- `apiAdminPatchOrgStatus(orgId, is_active)` in `adminApi.js`.
- Update `apiAdminListOrgs` response to expose `is_active` (already via data).

### Admin UI
- `OrgsTable.jsx`: add badge `<StatusPill tone={is_active ? "accent" : "default"} label={is_active ? "Active" : "Inactive"} />`.
- `AdminOrgsPanel.jsx` / `OrgDetailTabs.jsx`: add toggle switch/button for `is_active`, call mutation, invalidate `adminOrgs` query.
- Style inactive rows with `text-slate-400` / `opacity-70`.

### User UI
- `AuthProvider.jsx`: after fetching `/api/orgs`, if active org becomes inactive and user is not admin, still keep it selected so user can see the banner, but mark it inactive.
- `TopBar.jsx` / `WorkspaceExplorer.jsx`: when active org is inactive:
  - disable "New session" buttons,
  - show banner: "Организация деактивирована. Обратитесь к администратору."
- Org switcher options filter out inactive orgs except current active org.

## Tests

- `backend` smoke via curl: create inactive org → member POST session → 403; PATCH → 403; GET session → 200.
- Frontend smoke via Playwright:
  - admin logs in, deactivates org, sees badge/toggle state persist after reload.
  - member logs in, sees banner, "New session" disabled.
- Stage verification script: `/root/ui_verify/verify_org_inactive.js`.
