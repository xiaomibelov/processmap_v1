# PR Description — Workspace Subprocess Tree View

**Branch:** `feature/workspace-subprocess-tree-view`  
**Target:** `main`  
**Type:** feature  
**Related audit:** `fix/subprocess-child-unique-constraint` (ensures child sessions are unique)

---

## Summary

Add an expandable tree view for subprocess child sessions in the Workspace project pane. Child sessions are still created on canvas drill-down but are hidden from the flat list by default and shown under their parent session on demand.

---

## Changes

### Backend
- Extended `SessionItem` schema with `parent_session_id` and `has_children`.
- Added `root_only` and `include_children_meta` query params to `GET /api/projects/{project_id}/explorer`.
- Added new endpoint `GET /api/sessions/{session_id}/children`.
- Added `list_session_children` storage method with read-scope authz.
- Added DB index `idx_sessions_project_parent`.
- Added feature flag `workspace_session_tree_view`.

### Frontend
- Added `apiGetSessionChildren` and updated `apiGetProjectPage` to support `rootOnly`/`includeChildrenMeta`.
- Added tree state (`expandedSessionIds`, `sessionChildrenCache`, `loadingSessionChildren`) to `ProjectPane`.
- Updated `SessionRow` to render chevron, indent, and expand/collapse behavior.
- Built visible-rows builder that inserts loaded children under expanded roots.
- Gated new UI behind `useFeatureFlag("workspace_session_tree_view")`.

### Canvas
- No changes. Drill-down and breadcrumbs continue to work as before.

---

## Testing

- Backend unit tests in `tests/test_workspace_subprocess_tree_view.py`.
- Frontend component tests for expand/collapse, lazy load, feature flag.
- Manual QA checklist in `TESTS.md`.

---

## Deployment Notes

- Feature is disabled by default via `workspace_session_tree_view` flag.
- Admin can enable per-org via `/api/admin/feature-flags`.
- No data migration required; existing `parent_session_id` column is used.

---

## Screenshots / Loom

*To be added after implementation.*

---

## Checklist

- [ ] Backend tests pass
- [ ] Frontend tests pass
- [ ] Feature flag added
- [ ] Stage deploy smoke-tested
- [ ] UI reviewed for accessibility (aria-expanded, keyboard)
