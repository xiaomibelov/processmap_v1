# fix/save-pipeline-self-conflict-v1

## Goal

Prevent a single browser tab from running concurrent `xml` and `rawXml` writes
to `PUT /api/sessions/{id}/bpmn`, and prevent retries from reusing a CAS base
that the shared tracker has already advanced.

## Scope

1. Serialize all SaveCoordinator pipelines per session while preserving
   per-pipeline debounce behavior.
2. Refresh `base_diagram_state_version` from each pipeline's base-version
   resolver immediately before a retry.
3. Include `server_current_version` in lock-busy responses for diagnostics and
   later reconciliation; do not auto-adopt it as a CAS base.
4. Preserve the existing hard conflict gate for genuine HTTP 409 responses.

## TDD Acceptance

- Concurrent `xml` and `rawXml` executions for one session never overlap.
- Pipelines for different sessions may still run concurrently.
- A retry uses a tracker version advanced while the previous attempt was in
  flight; an unchanged tracker leaves the original base untouched.
- HTTP 423 includes the current diagram-state version and remains retryable.
- Existing conflict-gate behavior and save tests remain green.

## Explicit Non-goals

- No actor-label based self-conflict bypass.
- No automatic adoption of a 409 server version.
- No merge, deploy, or PR creation.
