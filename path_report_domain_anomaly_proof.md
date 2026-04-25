# Path Report Domain Anomaly Telemetry Proof

## Scope

- proven: This proof covers the narrow path report semantic failure slice only.
- proven: The implemented emission point is the final persisted report row transition to `status="error"`.
- proven: Provider retries, provider warning states, validation/no-op states, UI, dashboards, export/search, and broad report-provider instrumentation are intentionally out of scope.
- proven: The slice uses the existing durable `error_events` append path through `capture_backend_domain_invariant_violation`; it does not call the backend intake endpoint over self-HTTP.

## Selected Semantic Point

- proven: `_run_path_report_generation_async(...)._finish_error(...)` persists the report version with `status="error"` through `_patch_report_version_row(...)`.
- proven: `_emit_path_report_domain_anomaly(...)` is called only after `_patch_report_version_row(...)` returns the patched row.
- proven: `_emit_path_report_domain_anomaly(...)` returns without writing telemetry unless the row status is exactly `error`.
- proven: The event type is reused as `domain_invariant_violation` with `source="backend"` and `severity="error"`.
- proven: `correlation_id` is the report version id, because the path report version is the durable domain object that survives request/background boundaries.

## Scenario 1: Controlled Final Semantic Path Report Failure

Request/setup sample:

```python
create_path_report_version(
    sid,
    "primary",
    CreatePathReportVersionIn(
        steps_hash="steps_hash_failure",
        request_payload_json={
            "session_id": sid,
            "path_id": "primary",
            "steps": [{"order_index": 1, "title": "Step A"}],
        },
        prompt_template_version="v2",
    ),
)
```

Failure injection:

```python
generate_path_report.side_effect = RuntimeError("provider forbidden-secret")
```

Expected durable row sample:

```json
{
  "event_type": "domain_invariant_violation",
  "source": "backend",
  "severity": "error",
  "session_id": "<created-session-id>",
  "route": "/api/sessions/<created-session-id>/paths/primary/reports",
  "request_id": null,
  "correlation_id": "<report-version-id>",
  "context_json": {
    "domain": "path_report",
    "operation": "path_report_generation",
    "invariant_name": "provider_failed",
    "error_code": "provider_failed",
    "error_class": "RuntimeError",
    "report_id": "<report-version-id>",
    "report_version_id": "<report-version-id>",
    "path_id": "primary",
    "steps_hash": "steps_hash_failure",
    "status": "error"
  }
}
```

Proof:

- proven: `backend/tests/test_path_report_domain_anomaly_telemetry.py::test_controlled_final_path_report_failure_emits_durable_domain_row` verifies the report detail row is persisted as `status="error"`.
- proven: The same test verifies exactly one durable `domain_invariant_violation` row exists.
- proven: The same test verifies `session_id`, `route`, `correlation_id`, `report_id`, `report_version_id`, `path_id`, `steps_hash`, `error_code`, and `error_class`.
- proven: The same test verifies `"provider forbidden-secret"` is not present in the serialized stored event.

## Scenario 2: Same Path With Explicit Correlation Metadata

Request/setup sample:

```python
_emit_path_report_domain_anomaly(
    {
        "id": "rpt_corr",
        "session_id": "sess_corr",
        "path_id": "path_corr",
        "version": 2,
        "steps_hash": "steps_hash_corr",
        "status": "error",
        "model": "deepseek-chat",
        "prompt_template_version": "v2",
        "warnings_json": [{"code": "payload_compacted_retry"}, {"code": "provider_failed"}],
    },
    session_id="sess_corr",
    path_id="path_corr",
    org_id="org_corr",
    user_id="user_corr",
    project_id="proj_corr",
    request_id="req_report_origin",
    route="/api/sessions/sess_corr/paths/path_corr/reports",
    error_code="provider_failed_after_compact_retry",
    error_class="RuntimeError",
)
```

Expected durable row sample:

```json
{
  "event_type": "domain_invariant_violation",
  "source": "backend",
  "severity": "error",
  "user_id": "user_corr",
  "org_id": "org_corr",
  "session_id": "sess_corr",
  "project_id": "proj_corr",
  "request_id": "req_report_origin",
  "correlation_id": "rpt_corr",
  "route": "/api/sessions/sess_corr/paths/path_corr/reports",
  "context_json": {
    "domain": "path_report",
    "operation": "path_report_generation",
    "invariant_name": "provider_failed_after_compact_retry",
    "report_id": "rpt_corr",
    "report_version_id": "rpt_corr",
    "path_id": "path_corr",
    "warning_codes": ["payload_compacted_retry", "provider_failed"],
    "_server": {
      "capture": "backend_domain_invariant"
    }
  }
}
```

Proof:

- proven: `backend/tests/test_path_report_domain_anomaly_telemetry.py::test_path_report_anomaly_with_explicit_correlation_metadata` verifies `request_id`, `correlation_id`, `user_id`, `org_id`, `session_id`, and `project_id`.
- proven: The same test verifies the safe compact report identifiers and warning codes.
- proven: The same test verifies the existing domain capture marker `_server.capture="backend_domain_invariant"`.

## Scenario 3: Healthy Success/No-Op Outcome With No Anomaly Event

Request/setup sample:

```python
_emit_path_report_domain_anomaly(
    {
        "id": "rpt_ok",
        "session_id": "sess_ok",
        "path_id": "path_ok",
        "version": 1,
        "steps_hash": "steps_hash_ok",
        "status": "ok",
    },
    session_id="sess_ok",
    path_id="path_ok",
    request_id="req_ok",
)
```

Expected result:

```json
{
  "emitted": false,
  "durable_rows": []
}
```

Proof:

- proven: `backend/tests/test_path_report_domain_anomaly_telemetry.py::test_healthy_path_report_success_row_does_not_emit_anomaly_noise` verifies the helper returns `None`.
- proven: The same test verifies no `domain_invariant_violation` row is written.

## Regression Guard

- proven: `backend/tests/test_path_report_domain_anomaly_telemetry.py::test_backend_async_exception_path_is_not_changed_by_semantic_anomaly_slice` verifies the existing `backend_async_exception` taxonomy still emits for non-request unhandled exceptions.
- proven: The regression guard verifies redaction of a `request_payload` context and absence of `"worker forbidden-secret"` in the stored row.

## Test Run

Command:

```bash
python3 -m pytest backend/tests/test_path_report_domain_anomaly_telemetry.py backend/tests/test_backend_domain_anomaly_telemetry.py backend/tests/test_background_exception_telemetry.py backend/tests/test_backend_exception_telemetry.py backend/tests/test_error_events_intake.py -q
```

Result:

```text
18 passed, 11 warnings in 5.33s
```

Compile check:

```bash
python3 -m compileall -q backend/app/error_events backend/app/_legacy_main.py backend/tests/test_path_report_domain_anomaly_telemetry.py
```

Result:

```text
passed with no output
```

Existing path report API regression check:

```bash
PYTHONPATH=backend python3 -m pytest backend/tests/test_path_report_api.py -q
```

Result:

```text
14 passed in 2.84s
```

## Safety Notes

- proven: The path report telemetry context contains compact identifiers and safe metadata only: operation, report ids, path id, version, steps hash, status, error code/class, model, prompt template version, and warning codes.
- proven: Raw prompts, raw LLM payloads, report body text, request payload JSON, `payload_raw`, `raw_json`, secrets, and provider exception message text are not copied into the telemetry context.
- proven: `admin.md` was not deleted or staged by this slice.
