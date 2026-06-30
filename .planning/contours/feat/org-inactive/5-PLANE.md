# Org inactive — 5-plane contract

## 1. UX / Product

- Admin can mark any org as inactive from the admin orgs panel.
- Inactive org is visually distinct (grey text, "Inactive" badge).
- Members of an inactive org see a read-only banner: "Организация деактивирована. Обратитесь к администратору."
- Members cannot create or edit sessions; existing sessions remain readable.

## 2. Data

- Table `orgs` gets `is_active INTEGER NOT NULL DEFAULT 1`.
- All existing orgs stay active.
- `OrgOut` includes `is_active: bool`.

## 3. API / Backend

- `PATCH /api/admin/orgs/:id/status` — admin only, body `{ is_active: bool }`.
- `GET /api/admin/orgs` — returns all orgs including inactive, with `is_active`.
- `GET /api/orgs` — filters out inactive orgs for non-admin users; admins see all.
- Session create/patch — 403 if org inactive and caller is not admin.
- Session read — unchanged.

## 4. Frontend

- Admin orgs table: inline toggle or expandable toggle for `is_active`; badge shows status.
- User org switcher: only active orgs (or current active org even if inactive to allow switching away).
- Workspace: when active org is inactive, disable "New session" buttons and show banner.

## 5. Verification

- Backend unit/smoke: create session in inactive org → 403; read session → 200.
- Frontend smoke: admin toggles org inactive, UI reflects status.
- Stage end-to-end: admin deactivates org → user cannot create session.
