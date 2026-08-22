# Test Plan — fix/canvas-navigation-stability

## Unit tests

### `frontend/src/features/workspace/sessionStatus.test.mjs`
- `normalizeManualSessionStatus` alias mapping.
- `resolveSessionStatusFromDraft` precedence.
- `getAllowedNextStatuses` mirrors backend transition matrix for all canonical statuses.
- `getAllowedNextStatuses` normalizes aliases (`done` → `ready`, `archive` → `archived`).
- `getAllowedNextStatuses` returns empty set for unknown inputs.

### `frontend/src/components/TopBar.header-meta.test.mjs`
- TopBar imports and filters statuses via `getAllowedNextStatuses`.
- TopBar disables the status control while `isChangingSessionStatus` is true.

### `frontend/src/App.session-status-topbar.test.mjs`
- App resolves topbar status from `draft.interview.status` resolver.
- `changeCurrentSessionStatus` performs optimistic update before API call.
- `changeCurrentSessionStatus` rolls back on failure.
- `changeCurrentSessionStatus` shows the Russian 409 message.

## E2E tests

### `scripts/e2e/check_subprocess_navigation_spa.mjs`
- Logs in, creates a fresh root session with a collapsed `SubProcess`.
- Clicks the drilldown arrow.
- Verifies URL changes to child session with `parent=` param.
- Verifies no full page reload occurred (monitors `framenavigated`).
- Verifies breadcrumb is visible.
- Clicks the back button.
- Verifies URL returns to parent session without `parent=` param.
- Verifies no full page reload occurred on back navigation.

## Manual/runtime checks

- 3+ consecutive status changes without reload or stuck UI.
- Breadcrumb does not overlap Save, Undo, Redo, Zoom, Fit-to-screen, or Status button at 1920×1080, 1366×768, 768px, and 320px widths.
- Viewport and zoom are restored when returning from a subprocess.
