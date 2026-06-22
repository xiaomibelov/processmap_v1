# Plan: fix/canvas-navigation-stability

## Goal
Deliver a bounded fix contour that resolves four live UX defects in the ProcessMap canvas/session/navigation surface:
1. **F1** — Session status button deadlock (one click works, subsequent clicks ignored).
2. **F2** — Canvas full reload / flash on every status change.
3. **F3** — Subprocess breadcrumb overlays the toolbar / action buttons.
4. **F4** — Subprocess drill-in/out performs a full page reload instead of an SPA transition.

Out of scope: backend domain logic changes beyond the minimal router/service already touched by subprocess navigation, AI/RAG overlays, draw.io layer, admin dashboards, i18n, broad App.jsx decomposition.

## Source / runtime truth
- Work repo: `/root/processmap_v1`
- Base branch: `new-origin/main` (`cf5ce97b`)
- New branch: `fix/canvas-navigation-stability`
- Runtime verification target: `http://clearvestnic.ru:5180` (to be checked by Agent 3 reviewer after implementation)

## Key findings from pre-flight
- `frontend/src/features/workspace/sessionStatus.js` has aliases and status resolution, but no frontend transition matrix and no `getAllowedNextStatuses` helper.
- `frontend/src/components/TopBar.jsx` renders every status option regardless of backend transition rules and does not disable the control while a patch is in flight.
- `frontend/src/App.jsx` `changeCurrentSessionStatus` patches, then calls `onSessionSync` + `refreshSessions`; there is no optimistic update and no rollback on failure.
- `frontend/src/components/process/BpmnStage.jsx` reloads only on `sessionId`/`reloadKey` change; a plain status change should not trigger it, but the lack of optimistic UI makes the user perceive a stall, and `refreshSessions` can race into `openSession` if route state is inconsistent.
- `frontend/src/features/process/bpmn/stage/styles/subprocessNavigation.css` positions `.subprocessBreadcrumbsOnCanvas` absolutely at `top: 12px; left: 12px; z-index: 50`, directly over `.processHeader` (`z-index: 30`), occluding Save / version / revision actions on the left side of the header.
- Subprocess navigation already uses client-side history (`pushSessionSelectionToUrl` + `openSession`), but viewport/zoom are not persisted across drill-in/out, and focus intent is passed through `window.__SUBPROCESS_FOCUS_ELEMENT_ID__` (global side-channel).

## Proposed approach
### F1 + F2 — Session status change without deadlock or reload
- Mirror the backend `SESSION_STATUS_TRANSITIONS` into `sessionStatus.js` as `getAllowedNextStatuses(currentStatus)`.
- In `TopBar.jsx` and `WorkspaceExplorer.jsx`, filter status options to allowed transitions only; hide/disable the control when no transitions are available.
- Add an in-flight guard (`isChangingStatusRef` or `useState`) so the button/select is disabled and the menu closes immediately while the patch is pending.
- In `App.jsx` `changeCurrentSessionStatus`:
  1. Snapshot previous `draft.interview.status` / `draft.status`.
  2. Optimistically update `draft` via `setDraftPersisted` (or `setDraft` if local) before the API call.
  3. On 409, roll back to the snapshot and show a Russian message: `"Переход в выбранный статус недоступен для текущего состояния сессии.`"
  4. On other failures, roll back and call `markFail`.
  5. On success, call `onSessionSync` as today, then `refreshSessions` (kept for explorer consistency) but ensure `refreshSessions` does not re-open the current session.
- Ensure `changeCurrentSessionStatus` never bumps `reloadKey`, `sessionId`, or `draft.bpmn_xml`, so `BpmnStage` effects do not fire.

### F3 — Breadcrumb collision-free layout
- Move the breadcrumb render site from an absolute overlay inside `workspaceMain` to a normal-flow row below `ProcessStageHeader`.
- CSS changes:
  - Remove absolute positioning from `.subprocessBreadcrumbsOnCanvas`; make it a relative flex item under the header.
  - Ensure `z-index` is lower than any action button / toolbar (`< 30` or part of the normal stacking context).
  - Keep `pointer-events: auto` only on crumb text/buttons; the container must not create an invisible hit rectangle over tools.
  - Add responsive wrapping and `max-width` so long crumb chains do not push Save/Undo/Redo off-screen.
  - **Responsive guards:**
    - At `width < 768px`: breadcrumb wraps to a second line; Save/Undo/Redo remain on the first line and stay reachable.
    - At `width < 320px`: each crumb truncates with ellipsis (`text-overflow: ellipsis`); the back arrow and current step remain visible; action buttons stay accessible (use `min-width: 0` and `shrink-0` on controls).
- The breadcrumb must still appear/disappear based on `subprocessBreadcrumbs.length >= 2`.

### F4 — Subprocess SPA transition with viewport persistence
- Audit existing viewport helpers in `frontend/src/features/process/bpmn/stage/viewport/viewportRecovery.js` (`ensureCanvasVisibleAndFit`, `safeFit`, `probeCanvas`, `getCanvasSnapshot`, `suppressViewboxEvents`) and reuse them; do not duplicate the logic.
- Before `navigateToSubprocess` in `App.jsx`, capture the current canvas viewport via the existing `getCanvasSnapshot` helper, keyed by parent `sessionId`.
- Store the snapshot in a local `Map`/`Ref` (navigation history frame), not on `window`.
- Pass the target `focusElementId` explicitly through React props/state to `BpmnStage` instead of `window.__SUBPROCESS_FOCUS_ELEMENT_ID__`.
- On `returnToParent`, restore the saved parent viewport via `viewportRecovery.js` helpers after the parent session re-imports; add a small `restoreViewport` adapter only if the existing helpers lack a direct restore path.
- Keep `pushSessionSelectionToUrl` for URL/history updates; no `window.location.reload`.

## Files likely to change
- `frontend/src/features/workspace/sessionStatus.js` (+tests)
- `frontend/src/components/TopBar.jsx`
- `frontend/src/features/explorer/WorkspaceExplorer.jsx`
- `frontend/src/App.jsx`
- `frontend/src/components/AppShell.jsx`
- `frontend/src/features/process/bpmn/stage/styles/subprocessNavigation.css`
- `frontend/src/components/process/BpmnStage.jsx` (viewport snapshot + focus prop)
- `frontend/src/features/process/bpmn/stage/orchestration/bpmnRenderRuntimeLifecycle.js` (focus prop)
- `frontend/src/features/process/bpmn/stage/orchestration/bindSubprocessNavigationEvents.js` (if focus prop wiring needed)
- New test files as needed

## Validation plan
1. `npm run build` passes (0 errors).
2. Frontend unit tests:
   - `sessionStatus.test.mjs` — transition matrix.
   - `App.session-status-topbar.test.mjs` — optimistic update + rollback.
   - `TopBar.header-meta.test.mjs` — filtered dropdown.
3. E2E Playwright scenario for subprocess drill-in/out:
   - Single click selects, drilldown arrow navigates.
   - Breadcrumb visible and clickable.
   - Back returns to parent; viewport is restored.
   - URL updated without `window.location.reload`.
4. Manual/runtime checks:
   - 3+ consecutive status changes work without reload/flash.
   - Breadcrumb does not overlap Save/Undo/Redo/Zoom/Fit/Status at 1920×1080, 1366×768, and 768px widths.

## Artifacts
After implementation and before PR:
- `.planning/contours/fix/canvas-navigation-stability/PLAN.md`
- `.planning/contours/fix/canvas-navigation-stability/API.md`
- `.planning/contours/fix/canvas-navigation-stability/UI.md`
- `.planning/contours/fix/canvas-navigation-stability/TESTS.md`
- `.planning/contours/fix/canvas-navigation-stability/PR.md`
- `.planning/contours/fix/canvas-navigation-stability/STATE.json`
- Mirror to Obsidian via `tools/pm-agent-mirror-report.sh`.

## Risks and mitigations
| Risk | Mitigation |
|------|------------|
| Optimistic update drifts from concurrent server edit | Roll back on any API failure; `onSessionSync` re-aligns on success |
| `refreshSessions` re-opens current session due to route race | Guard `shouldAttemptRequestedSessionRestore` so active current session is not re-opened |
| Breadcrumb in header row consumes too much horizontal space | `max-width`, `text-overflow: ellipsis`, wrap to second line |
| Viewport restore after parent return targets off-canvas area | Compare XML hash; skip restore if parent XML changed since snapshot |
| Scope creep into App.jsx decomposition | Keep all changes inside the listed files; do not refactor unrelated App.jsx logic |

## Next step
Create branch `fix/canvas-navigation-stability` from `new-origin/main`, implement the changes above, validate, write artifacts, mirror, push, and open a Russian PR without merging.
