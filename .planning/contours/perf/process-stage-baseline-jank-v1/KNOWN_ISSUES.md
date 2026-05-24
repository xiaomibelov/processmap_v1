# Known Issues (out of scope for this contour)

## 409 Conflict on PUT /api/sessions/{id}/bpmn

**Observed**: During reviewer runtime testing, a `409 Conflict` was logged on `PUT /api/sessions/4c515d1c6e/bpmn` after element drag and tab switch.

**Behavior**:
- First PUT returned 409 Conflict
- Second PUT returned 200 OK
- This indicates an optimistic-locking / concurrent-save conflict in the backend save pipeline

**Pre-existing**: This contour modified no save, sync, or backend-related logic. The changes were limited to:
- React component memoization
- Polling interval reductions
- Viewbox event emission fix

**Root cause hypothesis**: The backend save endpoint uses `diagram_state_version` for optimistic locking. If a background poll or auto-save updates the version between the client reading it and writing it, the PUT fails with 409. The client retry succeeds because it re-reads the latest version.

**Resolution**: Out of scope for `perf/process-stage-baseline-jank-v1`. Should be addressed in a dedicated backend-save-reliability contour if it becomes a user-facing issue.
