# Telemetry Correlation Pivot Proof 2026-04-17

## Scope

- proven: this proof pack covers only the `correlation_id` retrieval/UI pivot slice.
- proven: this proof pack does not change telemetry schema or grouping semantics.
- proven: evidence comes from targeted automated tests; no DB shell was used.

## Commands

- proven: `python3 -m unittest backend.tests.test_admin_error_events_retrieval`
- proven: `node --test frontend/src/features/admin/utils/adminTelemetryQuery.test.mjs frontend/src/lib/api.admin-error-events.test.mjs frontend/src/features/admin/pages/AdminTelemetryEventsPage.test.mjs`

## Scenario 1: AutoPass timeline by `correlation_id`

- filter/query state:
  - proven: retrieval accepts `correlation_id=corr_incident_1` through `/api/admin/error-events`.
  - proven: UI pivot helper rewrites URL state to `correlation_id=<value>` while preserving `org_id`, `limit`, and `order`, and clearing conflicting incident filters.
- retrieval evidence:
  - proven: `backend.tests.test_admin_error_events_retrieval.AdminErrorEventsRetrievalTest.test_query_by_correlation_id_returns_raw_ordered_cross_type_timeline` returns:
    - `evt_api_failure`
    - `evt_backend_exception`
    - `evt_backend_async`
  - proven: returned order remains raw chronological `[100, 110, 115]`.
  - proven: returned event types stay heterogeneous: `api_failure`, `backend_exception`, `backend_async_exception`.
- UI behavior:
  - proven: `frontend/src/features/admin/utils/adminTelemetryQuery.test.mjs` verifies URL/query helper support for `correlation_id`.
  - proven: `frontend/src/lib/api.admin-error-events.test.mjs` verifies the browser client sends `correlation_id` to `/api/admin/error-events`.
- detail/pivot behavior:
  - proven: `frontend/src/features/admin/pages/AdminTelemetryEventsPage.test.mjs` test `detail pivot emits same correlation_id timeline request` clicks the detail action and emits `corr_incident`.
- payload safety:
  - proven: backend retrieval test still asserts redaction and absence of `forbidden-secret`.

## Scenario 2: Path report timeline by `correlation_id`

- filter/query state:
  - proven: retrieval accepts `correlation_id=rpt_path_report_1`.
- retrieval evidence:
  - proven: `backend.tests.test_admin_error_events_retrieval.AdminErrorEventsRetrievalTest.test_query_by_path_report_correlation_id_returns_related_rows` returns:
    - `evt_domain_invariant`
    - `evt_path_report_async`
  - proven: returned order remains raw chronological `[300, 310]`.
  - proven: timeline is still raw/ordered and not deduped/grouped.
- UI behavior:
  - proven: the same `correlation_id` input and API param path is shared for path report rows; no special-case query path was added.
- detail/pivot behavior:
  - proven: the detail panel exposes a dedicated same-`correlation_id` pivot button rather than a new grouping engine.

## Scenario 3: Sparse row without `correlation_id`

- filter/query state:
  - proven: querying a missing `correlation_id` returns an empty, safe result.
- retrieval evidence:
  - proven: `backend.tests.test_admin_error_events_retrieval.AdminErrorEventsRetrievalTest.test_sparse_rows_without_correlation_id_do_not_match_correlation_filter` returns `items=[]`, `count=0`.
- UI behavior:
  - proven: `frontend/src/features/admin/pages/AdminTelemetryEventsPage.test.mjs` test `sparse detail row keeps correlation pivot safely disabled` renders the detail panel without crash.
- detail/pivot behavior:
  - proven: the same-`correlation_id` pivot button is disabled when `correlation_id` is empty.
  - proven: the detail panel explicitly shows that `correlation_id` is absent and pivot is unavailable.

## Contract Outcome

- proven: `/api/admin/error-events` now supports `correlation_id` filtering.
- proven: `/admin/telemetry` now has URL-backed filter input for `correlation_id`.
- proven: event detail can pivot to related events with the same `correlation_id`.
- proven: list/detail response shape stays backward-compatible; only additive filtering/index support was introduced.
- proven: raw ordered timeline semantics remain unchanged.

## Remaining Unknowns

- unknown: staging/prod UX proof for this exact slice has not been rerun in this cycle.
- unknown: real-world selectivity of the new `correlation_id` index on production-scale telemetry volume has not been benchmarked in this cycle.
