# API Contract — fix/canvas-navigation-stability

## Session status change

### Frontend → Backend
- `PATCH /api/sessions/{session_id}`
- Payload:
  ```json
  {
    "status": "in_progress",
    "base_diagram_state_version": 42
  }
  ```
- Responses:
  - `200` — transition accepted; response body contains updated session.
  - `409` — invalid status transition (blocked by `backend/app/session_status.py`).
  - `403` — user lacks permission to change status.

### Frontend state contract
- `frontend/src/features/workspace/sessionStatus.js` exposes `getAllowedNextStatuses(currentStatus)` that mirrors the backend matrix.
- `frontend/src/App.jsx` performs an optimistic update on `draft.interview.status` and `draft.status`, then rolls back on any failure.

## Subprocess navigation

### Drill-in
- `POST /api/sessions/{session_id}/subprocess/{element_id}/navigate`
- Returns:
  ```json
  {
    "ok": true,
    "subprocessSessionId": "...",
    "targetElementId": "...",
    "breadcrumbs": [
      { "session_id": "...", "name": "Root process" },
      { "session_id": "...", "name": "Подпроцесс: Activity_ID" }
    ]
  }
  ```

### Drill-out
- `POST /api/sessions/{subprocess_session_id}/return`
- Returns:
  ```json
  {
    "ok": true,
    "parentSessionId": "...",
    "elementIdInParent": "..."
  }
  ```

### Frontend state contract
- `navigateToSubprocess` captures the parent viewport snapshot via `bpmnStageRef.current.getCanvasSnapshot()` before opening the child session.
- `returnToParent` schedules the saved parent snapshot for restoration via the `restoreViewportSnapshot` prop on `BpmnStage`.
- Focus element intent is passed through the `focusElementId` prop instead of `window.__SUBPROCESS_FOCUS_ELEMENT_ID__`.

## BpmnStage imperative API additions

- `getCanvasSnapshot(options?)` — returns `{ zoom, viewbox, width, height, count }` for the active instance.
- `restoreViewport(snapshot)` — applies a previously captured snapshot (zoom + viewbox) to the active instance, suppressing viewbox events.
