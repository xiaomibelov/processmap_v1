# Deployment Notice — Audit

## What already exists
- Backend uses `_ensure_schema()` in `backend/app/storage.py` for table creation/migration (no Alembic).
- Repository + DTO pattern exists under `backend/app/repositories/` and `backend/app/shared/dto/`.
- Admin endpoints use `_platform_admin_context()` or `request.state.auth_user.is_admin` guards.
- Frontend has `Modal` in `src/shared/ui/Modal.jsx`, TanStack Query wrappers, and admin System tab in `AdminSystemPanel.jsx`.
- App-level mounting point is `src/App.jsx` inside `AppShell`.

## Gaps to close
1. No `deployment_notices` table or storage helpers.
2. No public endpoint to fetch an active notice.
3. No admin endpoints to create/cancel notices.
4. No frontend component for modal polling.
5. No admin UI for managing notices.

## Risks
- Poll interval must not overload the server; 30s is safe.
- `scheduled_at` timezone: store as UTC unix timestamp in DB, accept ISO-8601 from frontend.
- Soft-delete via `is_active=false` preserves history.
- Avoid showing a notice the user already dismissed: localStorage key per notice id.
- Don't break existing auth guards or admin layout.
