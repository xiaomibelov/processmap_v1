# Deployment Notice — Solution

## Backend

### Schema (`backend/app/storage.py`)
Add inside `_ensure_schema()`:
```sql
CREATE TABLE IF NOT EXISTS deployment_notices (
  id TEXT PRIMARY KEY,
  message TEXT NOT NULL DEFAULT '',
  scheduled_at INTEGER NOT NULL DEFAULT 0,
  display_duration_minutes INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_by TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL DEFAULT 0
)
CREATE INDEX IF NOT EXISTS idx_deployment_notices_active ON deployment_notices(is_active, scheduled_at)
```
Use `_now_ts()` for timestamps. `scheduled_at` is stored as UTC seconds.

### Storage helpers
- `create_deployment_notice(message, scheduled_at, display_duration_minutes, created_by)`
- `list_deployment_notices()`
- `get_active_deployment_notice(now)`
- `cancel_deployment_notice(id)`

### DTO (`backend/app/shared/dto/deployment_notice_dto.py`)
- `DeploymentNoticeIn(BaseModel)`: message, scheduled_at (int/str), display_duration_minutes.
- `DeploymentNoticeOut(BaseModel)`: id, message, scheduled_at, display_duration_minutes, is_active, created_by, created_at.

### Repository (`backend/app/repositories/deployment_notice_repo.py`)
Thin wrappers around storage helpers returning DTOs.

### Router (`backend/app/routers/deployment_notices.py`)
- `GET /api/deployment-notice` — public (added to `AUTH_PUBLIC_PATHS`).
- `POST /api/admin/deployment-notices` — admin only.
- `DELETE /api/admin/deployment-notices/{notice_id}` — admin only (soft cancel).

## Frontend

### API
- `apiRoutes.deployment.notice()` → `/api/deployment-notice`
- `apiRoutes.admin.deploymentNotices()` → `/api/admin/deployment-notices`
- Helpers in `src/lib/apiModules/adminApi.js`.

### Component `DeploymentNoticeModal.jsx`
- Polls every 30s via `useQuery` (or `setInterval` + fetch).
- Countdown `useEffect` with 1s interval.
- Hidden if localStorage has `deployment_notice_hidden:<id>`.
- Uses `Modal` from `src/shared/ui/Modal.jsx`.

### Admin UI
- New tab "Deploy" inside `AdminSystemPanel.jsx`.
- Form with textarea, datetime-local, number input.
- List table with Cancel button.
- Uses `useAdminQuery` + `useAdminMutation`.

### Mount
- Import and render `<DeploymentNoticeModal />` near top of `App.jsx` inside `AppShell`.
