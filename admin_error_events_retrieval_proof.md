# Admin Error Events Retrieval Proof

Date: 2026-04-17

Command:

```bash
python3 -m pytest backend/tests/test_admin_error_events_retrieval.py backend/tests/test_error_events_intake.py backend/tests/test_backend_exception_telemetry.py backend/tests/test_storage_schema_bootstrap.py -q
```

Observed result:

```text
12 passed
```

## Scenario 1: query by request_id for one correlated incident

Request sample:

```http
GET /api/admin/error-events?request_id=req_incident_1&order=asc&limit=50
Authorization: Bearer <admin-token>
```

Response sample:

```json
{
  "ok": true,
  "count": 2,
  "page": {"limit": 50, "offset": 0, "total": 2, "order": "asc"},
  "timeline": {"deduped": false, "order": "asc"},
  "items": [
    {
      "id": "evt_api_failure",
      "occurred_at": 100,
      "source": "frontend",
      "event_type": "api_failure",
      "request_id": "req_incident_1",
      "session_id": "sess_timeline",
      "org_id": "org_default"
    },
    {
      "id": "evt_backend_exception",
      "occurred_at": 110,
      "source": "backend",
      "event_type": "backend_exception",
      "request_id": "req_incident_1",
      "session_id": "sess_timeline",
      "org_id": "org_default"
    }
  ]
}
```

Correctness:

- Ordering is chronological by `occurred_at ASC`.
- Correlation is by shared `request_id=req_incident_1`.
- Frontend `api_failure` and backend `backend_exception` are both returned; retrieval does not dedupe.
- Returned `context_json` is redacted again before response; sensitive headers and request body payload are not exposed.

## Scenario 2: query by session_id returning multi-event timeline

Request sample:

```http
GET /api/admin/error-events?session_id=sess_timeline&order=asc&limit=50
Authorization: Bearer <admin-token>
```

Response sample:

```json
{
  "ok": true,
  "count": 4,
  "page": {"limit": 50, "offset": 0, "total": 4, "order": "asc"},
  "items": [
    {"id": "evt_api_failure", "occurred_at": 100, "event_type": "api_failure"},
    {"id": "evt_backend_exception", "occurred_at": 110, "event_type": "backend_exception"},
    {"id": "evt_save_reload", "occurred_at": 200, "event_type": "save_reload_anomaly"},
    {"id": "evt_domain_invariant", "occurred_at": 300, "event_type": "domain_invariant_violation"}
  ]
}
```

Correctness:

- The endpoint returns an ordered incident timeline for the session.
- Correlation fields remain present per item: `request_id`, `session_id`, `user_id`, `org_id`, `runtime_id`, `route`.
- `timeline.deduped=false` documents that interpretation/grouping remains consumer-side.
- No raw payload body is returned; unsafe context keys are redacted or summarized.

## Scenario 3: non-existent filter returns empty safely

Request sample:

```http
GET /api/admin/error-events?request_id=req_missing&order=asc&limit=50
Authorization: Bearer <admin-token>
```

Response sample:

```json
{
  "ok": true,
  "items": [],
  "count": 0,
  "page": {"limit": 50, "offset": 0, "total": 0, "order": "asc"}
}
```

Correctness:

- Empty result is not an error.
- Pagination metadata remains stable and predictable.
- No debug-only or public endpoint is involved.

## Auth Proof

- Platform admin request succeeds.
- Non-telemetry-admin org user receives `403`.
- Endpoint is mounted under `/api/admin/*`, so the existing auth middleware protects it before route handling.
