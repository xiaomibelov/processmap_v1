# 409 Conflict Analysis

**Question:** When and why does the BPMN endpoint family return HTTP 409, and what is the observed `GET /api/sessions/{sid}/bpmn` behavior?

---

## Important Clarification

`GET /api/sessions/{session_id}/bpmn` **does not itself return 409** in the current codebase. The handler loads the session and returns the XML (200) or 404/503 for overlays.

Observed 409s on the BPMN URL family come from **write** endpoints that share the same path prefix, most likely `PUT /api/sessions/{sid}/bpmn`.

---

## Relevant Routes

`backend/app/routers/sessions.py`:

| Method | Route | Handler | Delegates to |
|--------|-------|---------|--------------|
| GET | `/api/sessions/{session_id}/bpmn` | `session_bpmn_export` | `_svc.bpmn_export` |
| PUT | `/api/sessions/{session_id}/bpmn` | `session_bpmn_save` | `_svc.bpmn_save` |
| PATCH | `/api/sessions/{session_id}/bpmn_meta` | `session_bpmn_meta_patch` | `_svc.bpmn_meta_patch` |
| POST | `/api/sessions/{session_id}/nodes` | `add_node` | `_svc.add_node` |
| POST | `/api/sessions/{session_id}/nodes/{node_id}` | `patch_node` | `_svc.patch_node` |
| DELETE | `/api/sessions/{session_id}/nodes/{node_id}` | `delete_node` | `_svc.delete_node` |
| POST | `/api/sessions/{session_id}/edges` | `add_edge` | `_svc.add_edge` |
| DELETE | `/api/sessions/{session_id}/edges` | `delete_edge` | `_svc.delete_edge` |
| POST | `/api/sessions/{session_id}/bpmn/restore/{version_id}` | `session_bpmn_restore` | `_svc.bpmn_restore` |

Legacy implementations still execute in `backend/app/_legacy_main.py`.

---

## Optimistic Locking Mechanism

### Guard function

`backend/app/_legacy_main.py:972–1009` (duplicate in `backend/app/utils/session_helpers.py:98–131`):

```python
def _require_diagram_cas_or_409(
    *,
    sess: Session,
    session_id: str,
    request: Request = None,
    client_base_version: Optional[int],
) -> None:
    if request is None or not hasattr(request, "scope"):
        return
    if os.environ.get("FPC_E2E_CAS_BYPASS") == "1":
        return

    current_version = int(getattr(sess, "diagram_state_version", 0) or 0)
    if client_base_version is None:
        raise HTTPException(
            status_code=409,
            detail=_diagram_state_conflict_payload(
                code="DIAGRAM_STATE_BASE_VERSION_REQUIRED",
                ...
            ),
        )
    if int(client_base_version) != current_version:
        raise HTTPException(
            status_code=409,
            detail=_diagram_state_conflict_payload(
                code="DIAGRAM_STATE_CONFLICT",
                client_base_version=int(client_base_version),
                server_current_version=current_version,
                ...
            ),
        )
```

### Version field

- `diagram_state_version` is a monotonic counter incremented by `_mark_diagram_truth_write` (`_legacy_main.py:1012`).
- It is returned in session projections and meta endpoints.

### Base-version resolution

`backend/app/_legacy_main.py:898–927` resolves `base_diagram_state_version` from:

- Body fields: `base_diagram_state_version`, `base_bpmn_xml_version`, `rev`.
- Headers: `X-Base-Diagram-State-Version`, `If-Match`.
- Query params.

If nothing resolves, the guard raises `DIAGRAM_STATE_BASE_VERSION_REQUIRED`.

---

## Scenarios That Produce 409

| Scenario | Mechanism | Evidence |
|----------|-----------|----------|
| **Two tabs editing same session** | Tab A saves → `diagram_state_version` increments. Tab B sends stale base → 409. | `_require_diagram_cas_or_409` compares client base to server current. Frontend classifies this as `same_user_other_tab` (`saveConflictModalModel.js:90`). |
| **Snapshot auto-save + manual save overlap** | Auto-save completes first, bumps version; in-flight manual save still carries old base → 409. | Both paths use `session_bpmn_save` with same CAS. Redis lock prevents overlap during the save, but not the stale-base race after release. |
| **Stale base after cache hydrate** | Client loads session from cache with old `diagram_state_version`, then saves without re-fetching meta. | `_resolve_base_diagram_state_version` returns stale/missing value. |
| **Subprocess XML upstream sync (H3)** | Child save re-embeds XML into parent and calls `st.save(parent)` **without** parent lock or CAS. | `_legacy_main.py:7542–7583`. This is a **silent overwrite risk**, not a 409 source. |

---

## Retry Logic on the Frontend

1. **Generic API layer** (`frontend/src/lib/apiCore.js`, `apiClient.js`) does **not** auto-retry 409. Only 401 triggers token refresh.

2. **BPMN coordinator** (`frontend/src/features/process/bpmn/coordinator/createBpmnCoordinator.js:21`):
   - Detects `DIAGRAM_STATE_CONFLICT` / `BASE_VERSION_REQUIRED` / `CONFLICT`.
   - Arms a `conflictReplayReason` for intent-preserving replay on next flush.

3. **Hybrid persist retry machine** (`frontend/src/features/process/bpmn/stage/controllers/persistRetryMachine.js:15`):
   - Treats 409 and 423 as `lock_busy`.
   - Retries up to 2 times with delays: **300 ms → 800 ms → 1200 ms**.

4. **User-visible UX**:
   - `saveConflictModalModel.js` shows actor-aware modal (`same_user_other_tab` vs `other_user`).
   - Russian message: *“Конфликт версии BPMN. Обновите сессию и повторите сохранение.”*

---

## Metrics / Frequency

- Frontend sends every non-2xx API failure (including 409) to `POST /api/telemetry/error-events` (`telemetryClient.js:459`).
- Backend stores events; admin can list them via `GET /api/admin/error-events` (`backend/app/routers/admin.py:1648`).
- Admin session diagnostics expose `save_retry_history` and `lock_busy_history` fields (`backend/app/routers/admin.py:1225`), but **no code currently writes to them**.
- No dedicated backend counter or structured metric for 409 frequency beyond telemetry events.

**Without access to the telemetry/error-events table, a precise 24h/7d count cannot be provided in this audit.**

---

## Hypotheses Status

| ID | Hypothesis | Status |
|----|------------|--------|
| H1 | Snapshot auto-save conflicts with manual save | **Confirmed** |
| H2 | Subprocess XML upstream sync causes 409 on parent | **Refuted** — it bypasses parent CAS/lock entirely |
| H3 | Two tabs with same session cause concurrent save 409 | **Confirmed** |
| H4 | 409 on GET is a session-state mismatch / lock | **Refuted for GET** — GET has no 409 path; likely logged against PUT/PATCH |

---

## Data-Loss Risk Note

The subprocess parent sync is **best-effort** and bypasses the parent Redis lock and CAS. Concurrent parent edits may be silently overwritten. This is a higher-priority stability issue than the 409 noise itself.
