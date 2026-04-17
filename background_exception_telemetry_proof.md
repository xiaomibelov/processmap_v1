# Background / Worker Exception Telemetry Proof

## Scope

- proven: This slice closes the non-request exception blind spot for real background execution paths found in the repo.
- proven: It reuses the existing `error_events` append path via `append_error_event`.
- proven: It does not add self-HTTP calls, dashboards, alerting, or a worker framework redesign.
- proven: It does not change the frontend/admin retrieval/UI contract.

## Non-Request Execution Map

| Path | Existence | Failure class | Instrumentation decision |
| --- | --- | --- | --- |
| `backend/app/auto_pass_jobs.py::_worker_loop` daemon thread | proven | Redis-queued AutoPass processor exceptions can be caught by worker loop and only converted to job status today | instrumented as `backend_async_exception` for unexpected processor exceptions |
| `backend/app/_legacy_main.py::_create_path_report_version_core` `path-report-*` daemon thread | proven | Unexpected exceptions can terminate the report generation thread after expected LLM/provider errors are handled internally | instrumented by thread target wrapper |
| `backend/app/startup/boot_checks.py::_startup_bootstrap` FastAPI startup hook | proven | Startup failures can occur before/while DB availability is being verified | mapped but not instrumented in this slice because durable append depends on the same DB path and startup failure already aborts startup |
| invite/audit cleanup endpoints | proven request-bound | HTTP request handlers; failures are covered by request lifecycle telemetry | not instrumented as background |
| sync AutoPass Redis fallback | proven request-bound | Synchronous fallback returns handled 422/423/500 responses in request lifecycle | not instrumented as background |

## Event Taxonomy

- proven: New event type is `backend_async_exception`.
- proven: `source=backend`.
- proven: `severity=error`.
- proven: Request-path middleware remains `backend_exception`; async/background path uses `backend_async_exception`.
- proven: No additional event types were added.

Stored event envelope:

```json
{
  "source": "backend",
  "event_type": "backend_async_exception",
  "severity": "error",
  "message": "Unhandled background exception in <task_name>: <ExceptionClass>",
  "request_id": null,
  "correlation_id": null,
  "context_json": {
    "execution_scope": "background|worker",
    "task_name": "<task>",
    "exception_type": "<ExceptionClass>",
    "exception_module": "<module>",
    "stack": [
      { "file": "module.py", "function": "name", "line": 123 }
    ],
    "_server": {
      "capture": "backend_async_exception_capture",
      "request_id_source": "provided|absent"
    }
  }
}
```

## Correlation Model

- proven: For non-request events, `request_id` is nullable and is not synthesized by default.
- proven: `auto_pass_worker` propagates origin request id into queued job payload when launched from HTTP request.
- proven: `auto_pass_worker` uses `run_id` as `correlation_id`, falling back to `job_id` when needed.
- proven: `path_report_generation` uses `report_id` as `correlation_id`.
- proven: `session_id`, `org_id`, and `user_id` are stored when known.
- proven: `execution_scope` and `task_name` are always present in `context_json`.

## Duplication Policy

- proven: Only unexpected/unhandled non-request exceptions emit `backend_async_exception`.
- proven: Request middleware exceptions remain `backend_exception`.
- proven: Expected AutoPass worker outcomes `AUTO_PASS_NO_SUCCESSFUL_VARIANTS` and `LOCK_BUSY` do not emit `backend_async_exception`.
- proven: Path report expected LLM/provider failures remain handled by existing report error state and do not emit async exception events unless an unexpected exception escapes the worker function.
- proven: Domain/semantic events remain separate and are not deduped or replaced by this slice.

## Scenario 1: controlled background/task exception

Execution:

```python
capture_backend_async_exception(
    ValueError("forbidden-secret"),
    task_name="controlled_background_task",
    execution_scope="background",
    context_json={
        "safe": "ok",
        "authorization": "Bearer forbidden-secret",
        "request_body": {"token": "forbidden-secret"},
    },
)
```

Expected:

- proven: event emitted.
- proven: durable row written in `error_events`.
- proven: `event_type=backend_async_exception`.
- proven: `source=backend`.
- proven: `severity=error`.
- proven: `request_id` absent/empty because no request context exists.
- proven: `context_json.execution_scope=background`.
- proven: `context_json.task_name=controlled_background_task`.
- proven: `context_json.exception_type=ValueError`.
- proven: `authorization=[REDACTED]`.
- proven: `request_body._redacted=payload`.
- proven: `forbidden-secret` does not appear in stored row JSON.

## Scenario 2: non-request exception with explicit correlation metadata

Execution:

```python
_capture_worker_processor_exception(
    LookupError("worker exploded"),
    {
        "job_id": "job_auto_pass_1",
        "run_id": "run_auto_pass_1",
        "request_id": "req_origin_1",
        "user_id": "user_worker",
        "org_id": "org_worker",
        "session_id": "sess_worker",
    },
)
```

Expected:

- proven: event emitted.
- proven: durable row written.
- proven: `request_id=req_origin_1`.
- proven: `correlation_id=run_auto_pass_1`.
- proven: `user_id=user_worker`.
- proven: `org_id=org_worker`.
- proven: `session_id=sess_worker`.
- proven: `context_json.execution_scope=worker`.
- proven: `context_json.task_name=auto_pass_worker`.
- proven: `context_json.job_id=job_auto_pass_1`.
- proven: no raw job payload is stored.

Additional path report wrapper proof:

- proven: `_run_path_report_generation_with_capture` captures unexpected thread exceptions.
- proven: `request_id=req_report_origin`, `correlation_id=rpt_1`, `org_id=org_report`, and `session_id=sess_report` are stored when supplied.
- proven: `context_json.task_name=path_report_generation`.
- proven: `forbidden-secret` does not appear in stored row JSON.

## Scenario 3: healthy handled background outcome

Execution:

```python
_capture_worker_processor_exception(
    RuntimeError("AUTO_PASS_NO_SUCCESSFUL_VARIANTS"),
    {"job_id": "job_expected", "run_id": "run_expected"},
)
```

Expected:

- proven: no event emitted.
- proven: no durable `backend_async_exception` row written.
- proven: expected handled AutoPass domain outcome remains job status noise-free.

## Verification

Command:

```bash
python3 -m pytest backend/tests/test_background_exception_telemetry.py backend/tests/test_backend_exception_telemetry.py backend/tests/test_error_events_intake.py -q
```

Result:

```text
10 passed, 11 warnings in 4.51s
```

Compile check:

```bash
python3 -m compileall -q backend/app/error_events backend/app/auto_pass_jobs.py backend/app/routers/auto_pass.py backend/app/_legacy_main.py backend/tests/test_background_exception_telemetry.py
```

Result:

```text
passed with no output
```

## Safety

- proven: Capture helper wraps append in fail-safe `try/except`.
- proven: No self-HTTP call is used.
- proven: Exception message text is not stored in event `message`; only exception class and compact stack frames are stored.
- proven: `context_json` goes through existing `redact_context_json`.
- unknown: This proof does not claim every future worker path is instrumented; it covers the real paths found in this slice.
