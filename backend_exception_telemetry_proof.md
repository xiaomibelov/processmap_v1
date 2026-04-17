# Backend Exception Telemetry Proof

Date: 2026-04-17

Command:

```bash
python3 -m pytest backend/tests/test_error_events_intake.py backend/tests/test_backend_exception_telemetry.py backend/tests/test_storage_schema_bootstrap.py -q
```

Observed result:

```text
6 passed
```

## Scenario 1: authenticated unhandled backend exception

- Probe route: `GET /api/telemetry-proof/backend-exception`
- Request id input: none
- Response: `500`, body contains generated `request_id`, response has matching `X-Request-Id`
- Durable row: exactly one `error_events` row with `event_type=backend_exception`
- Required fields present: `request_id`, `user_id`, `org_id`, `route`, `method`
- Correlation fields: `request_id` generated as `req_*`, persisted on event and returned to caller
- Context safety: compact method/route/path/status/exception type/stack-frame metadata only
- Forbidden leakage check: controlled exception text included `secret_token_should_not_leak`; response and durable row do not contain it

## Scenario 2: authenticated unhandled backend exception with explicit client request id

- Probe route: `GET /api/telemetry-proof/backend-exception`
- Request id input: `X-Client-Request-Id: req_backend_exception_explicit_1`
- Response: `500`, body and `X-Request-Id` preserve `req_backend_exception_explicit_1`
- Durable row: exactly one `error_events` row with `event_type=backend_exception`
- Required fields present: `request_id=req_backend_exception_explicit_1`, `user_id`, `org_id`, `route`, `method=GET`
- Correlation fields: context `_server.request_id_source=x-client-request-id`
- Context safety: no raw request payload or raw exception message is stored

## Scenario 3: expected handled 404

- Probe route: `GET /api/telemetry-proof/handled-404`
- Request id input: `X-Client-Request-Id: req_expected_handled_404`
- Response: `404`
- Durable row: no `backend_exception` row for `req_expected_handled_404`
- Duplication policy: handled `HTTPException` responses remain normal API/domain signals and do not emit `backend_exception`

## Taxonomy

- Added: `backend_exception`
- Not added: `backend_domain_failure`

## Notes

- Middleware writes directly through `append_error_event`; no self-HTTP call is used.
- The existing intake taxonomy remains unchanged: `api_failure` is the frontend/request signal, semantic domain events remain final domain signals, and `backend_exception` is only for unhandled backend exception paths.
