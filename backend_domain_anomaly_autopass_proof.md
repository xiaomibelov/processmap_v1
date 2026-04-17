# Backend Domain Anomaly Slice Proof: AutoPass Final Failure

## Scope

- proven: This slice instruments one backend domain path only: AutoPass final semantic run failure.
- proven: It reuses the existing durable `error_events` append path.
- proven: It reuses existing event type `domain_invariant_violation`.
- proven: It does not add UI, dashboards, export/search, batch ingest, or a new telemetry subsystem.

## Candidate Map

| Candidate | Existence | User impact | Normalized handled outcome | Missing telemetry | Noise risk |
| --- | --- | --- | --- | --- | --- |
| AutoPass run final failure in `backend/app/routers/auto_pass.py` + `auto_pass_engine.py` | proven | User-triggered path generation can fail after computing/persisting a final failed result | proven: `status=failed`, `error_code`, `summary.failed_reasons`, `warnings` | proven before this slice | low if only emitted after final persisted failed result |
| Path report generation in `_legacy_main.py` | proven | Report/doc generation can end in `status=error` | proven: report row `status=error`, `error_message` | hypothesis: semantic telemetry gap remains | medium; provider/LLM failures can be frequent and need separate policy |
| Publish Git mirror in `services/publish_git_mirror.py` | proven | Publishing BPMN artifacts to git can fail or be skipped | proven: `state=failed/skipped_invalid_config/skipped_disabled`, `error_code` | hypothesis: telemetry gap remains | medium; invalid config/skipped disabled should not be noisy |
| Diagram/CAS save conflicts in `_legacy_main.py` | proven | Stale write conflicts affect save/reload UX | proven: request-level 409/423 conflict outcomes exist | unknown: frontend domain telemetry already covers save/reload anomalies | high if every conflict/retry is emitted |

Selected path:

- proven: AutoPass final failed result is the best next slice because it has a clean final semantic point, normalized domain codes, clear session/project/user/org correlation, and low retry/no-op noise risk.

## Exact Instrumentation Point

- proven: Instrumentation runs in `_run_auto_pass_for_job` after `compute_auto_pass_v1(...)` and after `_persist_auto_pass_result(...)` succeeds.
- proven: The event emits only when persisted result has `status=failed`.
- proven: The event is not emitted during precheck, mode validation, lock retry, queue status transitions, or successful `status=done`.
- proven: This is a semantic emission point because it represents the final domain result of an AutoPass run, not a low-level transport/request failure.

## Event Taxonomy

Event:

```json
{
  "source": "backend",
  "event_type": "domain_invariant_violation",
  "severity": "error",
  "message": "AutoPass final semantic failure: <error_code>"
}
```

Reasoning:

- proven: `domain_invariant_violation` already exists in the telemetry contour.
- proven: AutoPass failures such as `NO_COMPLETE_PATH_TO_END` represent process graph/domain invariant failures.
- proven: No new event type was required for this slice.

Context:

```json
{
  "domain": "auto_pass",
  "operation": "auto_pass_run",
  "invariant_name": "no_complete_path_to_end",
  "error_code": "NO_COMPLETE_PATH_TO_END",
  "job_id": "job_auto_pass_1",
  "run_id": "run_auto_pass_1",
  "graph_hash": "graph_hash_123",
  "limits": {
    "mode": "all",
    "max_variants": 10,
    "max_steps": 100,
    "max_visits_per_node": 2
  },
  "summary": {
    "total_variants": 0,
    "total_variants_done": 0,
    "total_variants_failed": 3,
    "failed_reasons": {
      "NO_COMPLETE_PATH_TO_END": 3
    },
    "truncated": false
  },
  "warning_codes": ["NO_COMPLETE_PATH_TO_END"],
  "_server": {
    "capture": "backend_domain_invariant",
    "request_id_source": "provided|absent"
  }
}
```

## Correlation Model

- proven: `request_id` is propagated into AutoPass job payload at request submission time.
- proven: `correlation_id` is `run_id`, falling back to `job_id` only if `run_id` is absent.
- proven: `user_id`, `org_id`, `session_id`, and `project_id` are stored when known from job payload.
- proven: `route` is `/api/sessions/{session_id}/auto-pass`.
- proven: If `request_id` is unavailable, the event stores it absent/empty rather than synthesizing a fake request id.

## Duplication Policy

- proven: `backend_exception` remains only for unhandled request exceptions.
- proven: `backend_async_exception` remains only for unexpected background/worker exceptions.
- proven: AutoPass final domain failure emits `domain_invariant_violation`, not exception telemetry.
- proven: Successful AutoPass `status=done` emits no event.
- proven: Precheck/validation 4xx, lock retry, queue status transitions, and worker expected exception marker `AUTO_PASS_NO_SUCCESSFUL_VARIANTS` do not emit additional exception events.
- proven: Frontend `api_failure` may exist for a failed HTTP call, but this domain event carries the final semantic AutoPass invariant and is intentionally not deduped at retrieval.

## Scenario 1: controlled final semantic anomaly

Execution:

```python
_emit_auto_pass_domain_anomaly(
    {
        "status": "failed",
        "error_code": "NO_COMPLETE_PATH_TO_END",
        "error_message": "forbidden-secret",
        "graph_hash": "graph_hash_123",
        "run_id": "run_auto_pass_1",
        "summary": {"total_variants_done": 0, "failed_reasons": {"NO_COMPLETE_PATH_TO_END": 3}},
    },
    {
        "job_id": "job_auto_pass_1",
        "session_id": "sess_auto_pass",
        "org_id": "org_auto_pass",
        "user_id": "user_auto_pass",
        "project_id": "proj_auto_pass",
    },
)
```

Expected:

- proven: event emitted.
- proven: durable row written.
- proven: `event_type=domain_invariant_violation`.
- proven: `source=backend`.
- proven: `severity=error`.
- proven: `request_id` absent/empty.
- proven: `correlation_id=run_auto_pass_1`.
- proven: `session_id=sess_auto_pass`.
- proven: `project_id=proj_auto_pass`.
- proven: `route=/api/sessions/sess_auto_pass/auto-pass`.
- proven: `context_json.domain=auto_pass`.
- proven: `context_json.operation=auto_pass_run`.
- proven: `context_json.invariant_name=no_complete_path_to_end`.
- proven: `context_json.error_code=NO_COMPLETE_PATH_TO_END`.
- proven: `forbidden-secret` does not appear in stored row JSON.

## Scenario 2: same path with correlation fields present

Execution:

```python
_emit_auto_pass_domain_anomaly(
    {"status": "failed", "error_code": "NO_COMPLETE_PATH_TO_END", "run_id": "run_auto_pass_2"},
    {
        "job_id": "job_auto_pass_2",
        "run_id": "run_auto_pass_2",
        "request_id": "req_auto_pass_origin",
        "user_id": "user_corr",
        "org_id": "org_corr",
        "session_id": "sess_corr",
        "project_id": "proj_corr",
    },
)
```

Expected:

- proven: event emitted.
- proven: durable row written.
- proven: `request_id=req_auto_pass_origin`.
- proven: `correlation_id=run_auto_pass_2`.
- proven: `user_id=user_corr`.
- proven: `org_id=org_corr`.
- proven: `session_id=sess_corr`.
- proven: `project_id=proj_corr`.
- proven: `context_json.job_id=job_auto_pass_2`.
- proven: `context_json.run_id=run_auto_pass_2`.
- proven: `context_json._server.capture=backend_domain_invariant`.

## Scenario 3: healthy handled/no-op outcome

Execution:

```python
_emit_auto_pass_domain_anomaly(
    {"status": "done", "run_id": "run_done", "summary": {"total_variants_done": 1}},
    {"job_id": "job_done", "request_id": "req_done", "session_id": "sess_done"},
)
```

Expected:

- proven: no event emitted.
- proven: no durable `domain_invariant_violation` row written.
- proven: healthy AutoPass completion stays telemetry-noise-free.

## Verification

Command:

```bash
python3 -m pytest backend/tests/test_backend_domain_anomaly_telemetry.py backend/tests/test_background_exception_telemetry.py backend/tests/test_backend_exception_telemetry.py backend/tests/test_error_events_intake.py -q
```

Result:

```text
14 passed, 11 warnings in 4.87s
```

Compile check:

```bash
python3 -m compileall -q backend/app/error_events backend/app/routers/auto_pass.py backend/tests/test_backend_domain_anomaly_telemetry.py
```

Result:

```text
passed with no output
```

## Safety

- proven: Append is fail-safe and catches telemetry append failures.
- proven: No self-HTTP call is used.
- proven: No raw BPMN XML or request payload is stored.
- proven: AutoPass `error_message` is intentionally not copied into telemetry context; stable `error_code`, summary counts, failed reason keys, and warning codes are used instead.
- unknown: This slice does not claim coverage for all backend domain anomalies; it covers AutoPass final failed result only.
