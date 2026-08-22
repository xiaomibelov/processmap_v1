# REVIEWER PROMPT — Исправление смены статуса сессии (PROJ-7)

**Contour:** `fix/transaction-session-status`

## Scope
Review the frontend fix that adds `base_diagram_state_version` to session status patch requests.

## Checklist
1. Confirm the branch is based on latest `origin/main`.
2. Confirm only `frontend/src/App.jsx` and `frontend/src/App.session-status-patch.test.mjs` are changed.
3. Verify `changeCurrentSessionStatus` reads `draft?.diagram_state_version ?? draft?.diagramStateVersion`.
4. Verify the payload sent to `apiPatchSession` includes `base_diagram_state_version`.
5. Run tests:
   ```bash
   cd frontend
   node --test src/App.session-status-patch.test.mjs src/App.session-status-topbar.test.mjs
   ```
6. Confirm no broad refactor or unrelated changes.
7. Confirm commit message follows project conventions.

## Deliverable
- `REVIEW_REPORT.md` in this contour directory, or `REVIEW_PASS` marker if no issues.
