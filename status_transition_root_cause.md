# Status Transition Root Cause

## Observed failure
- API response on blocked transition: HTTP `409`
- Response detail: `invalid status transition`
- Endpoint: `PATCH /api/sessions/{session_id}`
- Frontend caller: `apiPatchSession(session.id, { status: next })`

## Exact rule location
- Backend transition guard:
  - `backend/app/_legacy_main.py` -> `_validate_session_status_transition(...)`
- Previous transition matrix lived in `_legacy_main.py` and had:
  - `archived: {"archived", "in_progress"}`

## Why `archive -> draft` failed
- `archive` is normalized to `archived`.
- From `archived`, previous matrix rejected `draft`.
- Rejection path throws `HTTPException(status_code=409, detail="invalid status transition")`.

## Why `archive -> other` also failed
- Same matrix rejected `review` and `ready(done)` from `archived`.
- Only `archived -> in_progress` was allowed before fix.

## Is 409 intended or accidental?
- `409` is intended for truly forbidden business transitions.
- In this scenario behavior was inconsistent:
  - forward chain allowed up to archive,
  - UI exposed status switching broadly,
  - but archived exits were mostly blocked.
- Conclusion: transition matrix was overly restrictive for archived exit and caused accidental conflicts for expected reopen flow.

## Frontend/contract/stale-state checks
- Frontend payload is correct (`{ status: <value> }`) via `apiPatchSession`.
- API contract supports status patch at `PATCH /api/sessions/{id}`.
- No optimistic-version conflict path involved in this status call.
- Stale state is not root cause of 409.
- Secondary UI issue found: top header status source used `draft.status` instead of canonical `draft.interview.status`, causing misleading displayed status.
