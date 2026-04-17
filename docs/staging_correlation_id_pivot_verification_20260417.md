# Staging Correlation Pivot Verification 2026-04-17

## Goal

- proven: this cycle verifies the exact staging ergonomics gap for `correlation_id` retrieval/UI pivot.
- proven: the target was not new telemetry coverage, schema change, or UI redesign.
- proven: minimal usable outcome would require:
  - retrieval API filtering by `correlation_id`;
  - `/admin/telemetry` keeping usable `correlation_id` query state;
  - event detail allowing same-`correlation_id` incident pivot;
  - raw timeline remaining raw/ordered;
  - sparse/no-correlation rows staying safe.

## Staging Setup

- proven: staging environment used was `https://stage.processmap.ru`.
- proven: authenticated user was `d.belov@automacon.ru` / `user_id=389893aa9e1e4823aa9b0f4498817655`.
- proven: execution org for the known incidents was `1658ce09bceb` (`Тестовое пространство`).
- proven: exact known incidents reused:
  - AutoPass:
    - `event_id=evt_f504c4a28b66`
    - `request_id=req_stage_autopass_persisted_1776444861`
    - `correlation_id=run_stage_autopass_persisted_1776444861`
    - `session_id=5a012ca9ff`
  - Path report:
    - `event_id=evt_b519bb8dd39f`
    - `request_id=req_1b87ad45d196`
    - `correlation_id=rpt_79faa1831bd6`
    - `session_id=2d90273738`
  - Sparse / no-correlation:
    - `event_id=evt_41edbfd60d74`
    - `request_id=tevt_mo337d49_8f21d0`
    - `correlation_id=""`
    - `session_id=2d90273738`

## Deploy State

- proven: latest public `Deploy to Stage` run visible via GitHub Actions was:
  - run `24576569360`
  - `completed/success`
  - branch `main`
  - `head_sha=67df7aaea819b0af531ed2019378d25a87a7a887`
- proven: current local `correlation_id` pivot slice is still only in dirty worktree and was not committed/pushed/deployed in this cycle.
- proven: current stage frontend bundle does not contain the new pivot UI strings:
  - `telemetry-filter-correlation-id`
  - `telemetry-pivot-correlation-id`
  - `Тот же correlation_id`
  - `correlation_id отсутствует; pivot недоступен.`
- conclusion:
  - proven: stage does not contain the exact new pivot slice from local worktree.

## Scenario Matrix

### 1. AutoPass by `correlation_id`

- expected retrieval behavior:
  - filter by `correlation_id=run_stage_autopass_persisted_1776444861`;
  - return the raw same-correlation timeline.
- expected UI behavior:
  - open known AutoPass event detail;
  - pivot to same `correlation_id` from detail;
  - URL/query state should reflect `correlation_id`.
- expected URL/query state:
  - `/admin/telemetry?...&correlation_id=run_stage_autopass_persisted_1776444861`

### 2. Path report by `correlation_id`

- expected retrieval behavior:
  - filter by `correlation_id=rpt_79faa1831bd6`;
  - return the raw same-correlation timeline.
- expected UI behavior:
  - open path report event detail;
  - pivot to same `correlation_id` from detail;
  - URL/query state should reflect `correlation_id`.
- expected URL/query state:
  - `/admin/telemetry?...&correlation_id=rpt_79faa1831bd6`

### 3. Sparse / no-correlation row

- expected retrieval behavior:
  - detail row should show empty/absent `correlation_id`.
- expected UI behavior:
  - no crash;
  - no broken pivot action.
- expected URL/query state:
  - no forced `correlation_id` pivot should appear.

## Execution

- proven: login used the real staging UI/API credential flow with the provided account.
- proven: UI verification used the real admin telemetry page under `https://stage.processmap.ru/admin/telemetry`.
- proven: scenario entry path was:
  - load known incident by `request_id` to get the exact row;
  - open `event_id` detail in UI;
  - attempt/use `correlation_id` via URL/query state and verify resulting retrieval/UI behavior.
- proven: this cycle did not create a new telemetry incident; it reused existing high-value stage rows.
- proven: retrieval verification was fully reproducible.
- proven: UI verification was fully reproducible.

## Retrieval / UI Verification

### AutoPass

- proven: detail endpoint works:
  - `/api/admin/error-events/evt_f504c4a28b66`
- proven: request-level retrieval works:
  - `/api/admin/error-events?request_id=req_stage_autopass_persisted_1776444861&org_id=1658ce09bceb&limit=100&order=asc`
  - returned exactly 1 row: `evt_f504c4a28b66`
- proven: `correlation_id` retrieval does not work on stage:
  - `/api/admin/error-events?correlation_id=run_stage_autopass_persisted_1776444861&org_id=1658ce09bceb&limit=100&order=asc`
  - returned 9 org-wide rows instead of the AutoPass incident timeline
  - response `filters` omitted `correlation_id`
- proven: UI detail shows `correlation_id=run_stage_autopass_persisted_1776444861`.
- proven: UI has no `correlation_id` filter input.
- proven: UI detail has no same-`correlation_id` pivot action.
- proven: UI retrieval request stayed request-based:
  - `GET /api/admin/error-events?limit=100&order=asc&request_id=req_stage_autopass_persisted_1776444861&org_id=1658ce09bceb`

### Path report

- proven: detail endpoint works:
  - `/api/admin/error-events/evt_b519bb8dd39f`
- proven: request-level retrieval works:
  - `/api/admin/error-events?request_id=req_1b87ad45d196&org_id=1658ce09bceb&limit=100&order=asc`
  - returned exactly 1 row: `evt_b519bb8dd39f`
- proven: `correlation_id` retrieval does not work on stage:
  - `/api/admin/error-events?correlation_id=rpt_79faa1831bd6&org_id=1658ce09bceb&limit=100&order=asc`
  - returned 9 org-wide rows instead of the path-report incident timeline
  - response `filters` omitted `correlation_id`
- proven: direct UI load of
  - `/admin/telemetry?correlation_id=rpt_79faa1831bd6&org_id=1658ce09bceb&order=asc&limit=100`
  - did not pass `correlation_id` through to retrieval;
  - actual browser retrieval request was only:
    - `GET /api/admin/error-events?limit=100&order=asc&org_id=1658ce09bceb`
- proven: UI page kept the raw URL text, but did not expose a `correlation_id` chip/input and did not narrow the timeline.
- proven: resulting timeline remained raw chronological org-wide rows, not same-correlation rows.

### Sparse / no-correlation row

- proven: detail endpoint works:
  - `/api/admin/error-events/evt_41edbfd60d74`
- proven: row has empty `correlation_id`.
- proven: UI detail renders safely and shows `correlation_id=—`.
- proven: UI has no broken pivot action for the sparse row.
- proven: this is safe behavior, but only because the pivot UI is missing entirely on stage.

## Before / After Semantics

- proven before:
  - `correlation_id` was visible in event detail but was not a usable retrieval/UI pivot.
- proven observed on stage now:
  - stage still behaves the same way;
  - `correlation_id` remains visible in detail only;
  - retrieval API still ignores `correlation_id`;
  - UI still does not expose `correlation_id` input or same-correlation pivot action.
- conclusion:
  - proven: there is no stage-level after-state for this slice yet.

## Verdict

- verdict: missing
- why:
  - proven: stage does not include the new `correlation_id` pivot slice;
  - proven: both retrieval API and admin UI still show the old pre-slice behavior.

## Proof Artifact

- proven: authoritative retrieval proof directory:
  - `/tmp/processmap_corrpivot_stage_1776448506`
- proven: key retrieval dumps:
  - `/tmp/processmap_corrpivot_stage_1776448506/autopass_detail.json`
  - `/tmp/processmap_corrpivot_stage_1776448506/autopass_request.json`
  - `/tmp/processmap_corrpivot_stage_1776448506/autopass_correlation.json`
  - `/tmp/processmap_corrpivot_stage_1776448506/path_detail.json`
  - `/tmp/processmap_corrpivot_stage_1776448506/path_request.json`
  - `/tmp/processmap_corrpivot_stage_1776448506/path_correlation.json`
  - `/tmp/processmap_corrpivot_stage_1776448506/frontend_sparse_detail.json`
  - `/tmp/processmap_corrpivot_stage_1776448506/frontend_recent.json`
  - `/tmp/processmap_corrpivot_stage_1776448506/99_summary.json`
- proven: UI screenshots:
  - `stage-corrpivot-url-ignored.png`
  - `stage-corrpivot-autopass-detail.png`
  - `stage-corrpivot-path-detail.png`
  - `stage-corrpivot-sparse-detail.png`
- proven: Playwright page snapshots in `.playwright-mcp/` back the UI state and request flow.

## Remaining Gaps

- proven: the `correlation_id` retrieval/UI gap is not closed on stage.
- proven: the remaining operational gap is deploy-state, not new telemetry coverage.
- hypothesis: after the slice is actually committed/pushed/merged/deployed, the same three scenarios should be rerun unchanged as the authoritative acceptance gate.

## Best Next Step

- proven: best next step is not another fix slice and not a redesign.
- proven: best next step is:
  - commit/push the local `correlation_id` pivot slice;
  - open/merge PR;
  - deploy stage from `main`;
  - rerun exactly these three stage scenarios and compare against this proof pack.
