# Admin Telemetry Timeline UI MVP Proof

## Scope

- proven: This slice adds a lightweight admin UI route over the existing admin retrieval endpoints.
- proven: No backend telemetry schema or retrieval API redesign is included in this slice.
- proven: The UI uses `GET /api/admin/error-events` for list/timeline retrieval.
- proven: The UI uses `GET /api/admin/error-events/{event_id}` for detail retrieval when `event_id` is selected.
- proven: The timeline view renders raw ordered events and does not dedupe or group them.

## Verification Commands

```bash
cd frontend
node --test src/lib/api.admin-error-events.test.mjs src/features/admin/utils/adminTelemetryQuery.test.mjs src/features/admin/pages/AdminTelemetryEventsPage.test.mjs
```

proven result:

```text
tests 11
pass 11
fail 0
```

```bash
cd frontend
npm run build
```

proven result:

```text
✓ built in 13.90s
```

## Scenario 1: query by request_id showing correlated incident rows

URL / filter state:

```text
/admin/telemetry?request_id=req_incident&event_id=evt_backend_exception
```

List endpoint request:

```text
GET /api/admin/error-events?limit=50&order=asc&request_id=req_incident
```

Detail endpoint request:

```text
GET /api/admin/error-events/evt_backend_exception
```

Rendered timeline:

```text
api_failure          frontend  error  req_incident  sess_timeline  rt_tab  /api/sessions/sess_timeline  API failed for save
backend_exception    backend   error  req_incident  sess_timeline          /api/sessions/sess_timeline  Unhandled backend exception
```

Detail panel:

```json
{
  "id": "evt_backend_exception",
  "event_type": "backend_exception",
  "source": "backend",
  "severity": "error",
  "request_id": "req_incident",
  "session_id": "sess_timeline",
  "user_id": "user_admin",
  "org_id": "org_main",
  "route": "/api/sessions/sess_timeline",
  "fingerprint": "fp_backend_exception",
  "app_version": "test",
  "git_sha": "abc123",
  "context_json": {
    "method": "GET",
    "authorization": "[REDACTED]",
    "request_body": {
      "_redacted": "payload"
    },
    "safe": "ok"
  }
}
```

Proof:

- proven: `AdminTelemetryEventsPage.test.mjs` renders `api_failure` before `backend_exception`.
- proven: The rendered page contains `req_incident`, `sess_timeline`, and `fp_backend_exception`.
- proven: The rendered detail contains `[REDACTED]` and `_redacted`.
- proven: The rendered detail does not contain `forbidden-secret`.
- proven: The UI inspection path does not require curl or DB shell after opening `/admin/telemetry`.

## Scenario 2: query by session_id showing multi-event timeline

URL / filter state:

```text
/admin/telemetry?session_id=sess_timeline&order=asc
```

List endpoint request:

```text
GET /api/admin/error-events?limit=50&order=asc&session_id=sess_timeline
```

Rendered timeline policy:

```text
occurred_at ascending
raw events as returned by retrieval API
no UI dedupe
no UI grouping
```

Representative rendered rows:

```text
api_failure                 frontend  error  req_incident  sess_timeline  rt_tab
backend_exception           backend   error  req_incident  sess_timeline
save_reload_anomaly         frontend  error  req_save_1    sess_timeline  rt_tab
domain_invariant_violation  frontend  warn   req_domain_1  sess_timeline  rt_tab
```

Proof:

- proven: The timeline component renders rows in the payload order.
- proven: The summary card renders `Dedupe: off`.
- proven: The timeline subtitle explicitly states raw events from `/api/admin/error-events` without UI dedupe/grouping.
- proven: `buildTelemetryErrorEventsParams` emits `session_id` as a list endpoint query param and never sends UI-only `event_id` to the list endpoint.

## Scenario 3: empty result / no-match scenario

URL / filter state:

```text
/admin/telemetry?request_id=req_missing
```

List endpoint request:

```text
GET /api/admin/error-events?limit=50&order=asc&request_id=req_missing
```

Rendered UI:

```text
По текущим фильтрам telemetry events не найдены.
```

Proof:

- proven: `AdminTelemetryEventsPage.test.mjs` renders `telemetry-empty-state` for `{ items: [], count: 0 }`.
- proven: Empty state is text-only and does not render event context.
- proven: Backend error state test renders a safe `insufficient_permissions` message and does not render `forbidden-secret`.

## Filter Contract

- proven: Supported URL/list filters are `session_id`, `request_id`, `user_id`, `org_id`, `runtime_id`, `event_type`, `source`, `severity`, `occurred_from`, `occurred_to`, `limit`, and `order`.
- proven: `limit` defaults to `50` and is clamped to `100` client-side to match backend max-limit policy.
- proven: `order` defaults to `asc`.
- proven: Invalid `occurred_from` / `occurred_to` values are not sent to the retrieval endpoint.
- proven: Reset removes telemetry filters and selected `event_id` from the URL state.

## Safety

- proven: The UI renders `context_json` from the existing admin retrieval response contract.
- proven: The UI does not create a new raw payload endpoint.
- proven: The tests assert that rendered detail contains redaction markers and excludes `forbidden-secret`.
- unknown: This proof does not claim exhaustive secret detection for future context keys beyond the backend redaction contract.
