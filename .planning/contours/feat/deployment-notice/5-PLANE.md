# Deployment Notice — 5-Plane Checklist

## 1. Data
- Table `deployment_notices` with columns: id, message, scheduled_at, display_duration_minutes, is_active, created_by, created_at.
- Storage helpers for CRUD + active-query.
- DTO Pydantic v2 models for In/Out/List.
- Repository wrapper matching error_event/notification repos.

## 2. Logic
- Active notice rule: `is_active = true` AND `now > scheduled_at - display_duration_minutes` AND `now < scheduled_at`.
- Admin-only POST/DELETE guards.
- Countdown computed on frontend from `scheduled_at`.
- Auto-hide when `scheduled_at` passed or `display_duration_minutes` elapsed after `scheduled_at`.

## 3. UI/UX
- Modal: compact, radius 8px, flat, dark overlay backdrop.
- Shows message + live countdown + "Понятно" button.
- Dismissal stored in localStorage.
- Admin System tab subsection with form and list.

## 4. Integration
- Mount `DeploymentNoticeModal` in `App.jsx` at app level.
- Add API routes in `apiRoutes.js` and helpers in `adminApi.js`.
- Register backend router in `backend/app/routers/__init__.py`.

## 5. Verification
- Create notice via admin UI on stage.
- Confirm modal appears for all users within display window.
- Confirm modal disappears after `scheduled_at`.
- Run existing admin/backend tests to ensure no regression.
