# UI/UX Notes — fix/canvas-navigation-stability

## F1 — Session status button

- Status pill in `TopBar.jsx` now shows `"Сохранение…"` while a status change is in flight.
- Dropdown menu is disabled during the change and closes immediately after selection.
- Only statuses allowed by the backend transition matrix are rendered.
- If the current status has no alternative transitions, the chevron is hidden and the pill is non-interactive.

## F2 — Canvas stability on status change

- Status change no longer waits for the API round-trip before updating the UI.
- Canvas props (`sessionId`, `reloadKey`, `draft.bpmn_xml`) are untouched, so `BpmnStage` does not re-import or remount.
- On a 409 conflict, the UI rolls back and shows a Russian message.

## F3 — Subprocess breadcrumb layout

- Breadcrumb moved from an absolute overlay (`workspaceMain`) to a normal-flow row below `ProcessStageHeader`.
- Container class renamed from `.subprocessBreadcrumbsOnCanvas` to `.subprocessBreadcrumbsBar`.
- `z-index` lowered to `1` so it never stacks above toolbar / action buttons.
- Responsive behavior:
  - `≥ 768px`: single-line row with truncation if needed.
  - `< 768px`: breadcrumb wraps to a second line; Save/Undo/Redo stay on the first line.
  - `< 320px`: each crumb truncates with ellipsis; action buttons remain reachable.

## F4 — Subprocess navigation

- Drill-in/out updates the URL via `history.pushState` without a full page reload.
- Browser Back from a child session restores the parent session and viewport.
- Breadcrumb clearly shows the navigation depth (`Root process > Подпроцесс: Activity_ID`).
