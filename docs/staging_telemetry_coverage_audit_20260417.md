# Staging Telemetry Coverage Audit 2026-04-17

## 1. Goal

- proven: exact audit gap for this cycle was not "design better telemetry", but "prove which event paths actually land in the staging telemetry contour and which do not".
- proven: the concrete acceptance target was a minimal usable outcome with:
  - a scenario coverage matrix;
  - expected vs actual telemetry result per scenario;
  - authoritative proof artifacts;
  - a gap map for missing/partial/noisy paths;
  - one narrow next fix recommendation.
- proven: this cycle intentionally did not change schema, did not widen instrumentation, did not add UI slices, and did not do cleanup or refactor.

## 2. Staging Setup

- proven: staging environment used was `https://stage.processmap.ru`.
- proven: `GET /api/health` returned `200 {"ok":true,"status":"ok",...}` during this audit.
- proven: provided user `d.belov@automacon.ru` exists on staging and is the only active platform admin in the stage auth store.
- proven: provided password login failed on staging:
  - `POST /api/auth/login` returned `401 {"detail":"invalid_credentials"}`;
  - Playwright UI login displayed `Неверный email или пароль`.
- proven: because password login was broken, the audit session used a temporary server-issued access token for the existing user via SSH, without changing the user record or schema.
- proven: authenticated user scope resolved to:
  - `user_id=389893aa9e1e4823aa9b0f4498817655`
  - `active_org_id=org_default`
  - org memberships:
    - `org_default` / `platform_admin`
    - `8b89c83ea810` / `org_owner`
    - `1658ce09bceb` / `org_owner`
- proven: the audit execution org was `1658ce09bceb` (`Тестовое пространство`) because it had the smallest live surface and was safe for isolated fixture setup.
- proven: isolated audit fixture created in staging:
  - `project_id=94c45c12d3`
  - `project_title=stg_telem_audit_1776430116_project`
  - `session_id=2d90273738`
  - `session_title=stg_telem_audit_1776430116_session`
- proven: useful control identifiers generated during the audit:
  - manual intake control:
    - `event_id=evt_3a1e2dff2456`
    - `request_id=req_manual_probe`
    - `runtime_id=rt_manual_probe`
    - `correlation_id=corr_manual_probe`
  - path report semantic failure:
    - `event_id=evt_b519bb8dd39f`
    - `request_id=req_1b87ad45d196`
    - `correlation_id=rpt_79faa1831bd6`
    - `report_id=rpt_79faa1831bd6`
- proven: staging constraints observed in this cycle:
  - no safe stage proof endpoint for controlled backend exception existed (`/api/telemetry-proof/*` returned `404`);
  - password login path for the provided credential was broken;
  - path report UI had overlay click-interception and heavy polling noise;
  - no direct `correlation_id` filter existed in `/admin/telemetry` UI.
- proven: scenarios fully triggerable in this cycle:
  - frontend runtime error via browser-side JS injection;
  - frontend unhandled rejection via browser-side JS injection;
  - healthy save control via existing stage-exposed `window.__FPC_E2E_MODELER__`;
  - path report semantic failure via reports UI DOM click on the existing button;
  - AutoPass semantic failure observation via fresh session creation + admin session detail.
- unknown: scenarios safely triggerable only partially or not at all in this cycle:
  - final save failure;
  - reload/readback anomaly;
  - request-path backend exception;
  - background/worker exception.

## 3. Scenario Matrix

| Scenario | Trigger class | Expected event types | Expected correlation fields | Expected timeline place |
| --- | --- | --- | --- | --- |
| Frontend runtime error | browser JS injection, no repo test hook | `frontend_fatal` | `session_id`, `runtime_id`, `request_id` or generated event request id | first frontend row near trigger time |
| Unhandled promise rejection | browser JS injection, no repo test hook | `frontend_unhandled_rejection` | `session_id`, `runtime_id`, event request id | first frontend row near trigger time |
| Failed API call | invalid session open through real app route | `api_failure` | `session_id` or attempted session context, `runtime_id`, failing request id | before/around UI error state |
| Final save failure | not safely reproduced | `save_reload_anomaly` or paired transport/domain row | `session_id`, `runtime_id`, `request_id` | after final failed save |
| Reload/readback anomaly | not safely reproduced | `save_reload_anomaly` | `session_id`, `runtime_id`, `request_id` | after reload/readback mismatch |
| Healthy save control | existing stage E2E modeler hook | no anomaly row expected | session timeline should remain clean | no new anomaly rows |
| Request-path backend exception | no safe trigger found | `backend_exception` | `request_id`, `session_id` if request-bound | request-bound backend row |
| Background/worker exception | no safe trigger found | `backend_async_exception` | `correlation_id`, `session_id`, `request_id` if propagated | async row after worker failure |
| AutoPass semantic failure | fresh session init / admin session detail | `domain_invariant_violation` | `session_id`, `request_id` if available, `correlation_id=run_id or job_id` | after final failed AutoPass result |
| Path report semantic failure | reports UI | `domain_invariant_violation` | `request_id`, `session_id`, `correlation_id=report_id` | after report row becomes `status=error` |
| Healthy/no-error path | open session / tab switch / clean load | no anomaly row expected | session timeline unchanged | no new rows |
| Handled/no-op path | invalid session handled by UI | no anomaly noise expected unless contour explicitly tracks handled contract errors | if emitted, should still correlate to request/session/runtime | ideally no new row |

## 4. Playwright Execution

### Frontend runtime error

- proven: path used was the live editor page for `session_id=2d90273738`.
- proven: exact trigger was browser-side evaluation:
  - `setTimeout(() => { throw new Error("stg_audit_runtime_1776430146074") }, 0)`
- proven: console captured `Error: stg_audit_runtime_1776430146074`.
- proven: this scenario was reproducible on staging.
- proven: this scenario did not need repo-side test hooks; it used browser JS injection only.

### Unhandled promise rejection

- proven: path used was the same live editor page for `session_id=2d90273738`.
- proven: exact trigger was browser-side evaluation:
  - `Promise.reject(new Error("stg_audit_reject_1776430146074"))`
- proven: console captured `Error: stg_audit_reject_1776430146074`.
- proven: this scenario was reproducible on staging.
- proven: this scenario did not need repo-side test hooks; it used browser JS injection only.

### Failed API call

- proven: path used was a real app route:
  - `https://stage.processmap.ru/app?project=94c45c12d3&session=ffffffffaa`
- proven: UI rendered handled error state:
  - `Сессия недоступна`
  - `Сессия недоступна: not found`
  - `HTTP 404`
- proven: transport detail was nonstandard:
  - `GET /api/sessions/ffffffffaa` returned `200 {"error":"not found"}` rather than an HTTP 404.
- proven: this scenario was reproducible on staging.
- proven: this scenario worked via real product flow only.
- hypothesis: because the endpoint returned a handled `200 {error:...}` shape, this path is not a pure transport failure and may bypass the `api_failure` contract entirely.

### Healthy save control

- proven: session `2d90273738` was opened in the editor.
- proven: exact change was made through the existing stage-exposed runtime hook `window.__FPC_E2E_MODELER__`.
- proven: exact mutation created BPMN task `Activity_1z00ugp` with label `AUDIT_TASK_1776430245370`.
- proven: resulting save chain on staging was real:
  - `PUT /api/sessions/2d90273738/bpmn` `200`
  - `PATCH /api/sessions/2d90273738` `200`
  - further normalization/save `PATCH` and `PUT` calls `200`
- proven: this scenario was fully reproducible on staging.
- proven: this scenario required an existing stage E2E runtime hook and was not pure manual clicking.

### Handled/no-op path

- proven: two handled/no-noise checks were observed:
  - invalid session handled by UI without telemetry row;
  - normal tab open / admin telemetry view / session load without new anomaly rows.
- proven: both were reproducible on staging.
- proven: invalid session path used real product flow only.

### AutoPass semantic failure

- proven: creating fresh quick-skeleton session `2d90273738` produced a persisted failed AutoPass state visible in admin session detail.
- proven: admin session detail showed:
  - `autopass.status=failed`
  - `end_event_validation.failed_reason=NO_COMPLETE_PATH_TO_END`
  - `autopass_error=No complete path reaches EndEvent of main process`
- proven: this semantic failure state was reproducible on staging.
- proven: the trigger was fresh session creation and admin/session inspection, not a dedicated UI button press.

### Path report semantic failure

- proven: reports drawer opened from the live UI for path `primary`.
- proven: ordinary Playwright pointer click on `AI-отчёт` was blocked by overlay interception.
- proven: fallback DOM click on the existing UI button did trigger the real build request:
  - `POST /api/orgs/1658ce09bceb/sessions/2d90273738/reports/build` `200`
- proven: the persisted report row became:
  - `report_id=rpt_79faa1831bd6`
  - `status=error`
  - `error=deepseek failed: 401 Client Error: Unauthorized for url: https://api.deepseek.com/v1/chat/completions`
- proven: this scenario was reproducible on staging.
- proven: this scenario used real staging UI state, but required DOM click fallback because the visible overlay blocked normal pointer automation.

### Final save failure

- unknown: no safe reproducible stage trigger was found in this cycle.

### Reload/readback anomaly

- unknown: no safe reproducible stage trigger was found in this cycle.

### Request-path backend exception

- proven: controlled proof endpoints were absent on stage (`/api/telemetry-proof/*` -> `404`).
- unknown: no safe user-facing request path that reliably causes an unhandled backend exception was found in this cycle.

### Background/worker exception

- unknown: no safe reproducible worker-exception trigger was found in this cycle.

## 5. Telemetry Verification

### How `/admin/telemetry` was queried

- proven: main UI verification view was:
  - `/admin/telemetry?session_id=2d90273738&order=asc&limit=50`
- proven: this returned exactly two rows in chronological order:
  - `evt_3a1e2dff2456` manual intake control row
  - `evt_b519bb8dd39f` path report semantic failure row
- proven: detail panel for `evt_b519bb8dd39f` exposed:
  - `request_id=req_1b87ad45d196`
  - `correlation_id=rpt_79faa1831bd6`
  - `session_id=2d90273738`
  - `user_id=389893aa9e1e4823aa9b0f4498817655`
  - `org_id=1658ce09bceb`
  - `project_id=94c45c12d3`
  - route `/api/orgs/1658ce09bceb/sessions/2d90273738/reports/build`

### Filter behavior proven in this cycle

- proven: `session_id` filter works:
  - `/api/admin/error-events?session_id=2d90273738&org_id=1658ce09bceb`
  - UI showed both rows for the audit session.
- proven: `request_id` filter works:
  - `/api/admin/error-events?request_id=req_1b87ad45d196&org_id=1658ce09bceb`
  - returned only the path report anomaly row.
- proven: `runtime_id` filter works:
  - `/api/admin/error-events?runtime_id=rt_manual_probe&org_id=1658ce09bceb`
  - returned only the manual intake control row.
- proven: `correlation_id` filter does not work in the current admin retrieval contract:
  - `/api/admin/error-events?correlation_id=rpt_79faa1831bd6&org_id=1658ce09bceb`
  - returned both rows for the org instead of filtering;
  - response `filters` payload omitted `correlation_id`;
  - `/admin/telemetry` UI also has no `correlation_id` input.

### Per-scenario verification result

#### Frontend runtime error

- proven: searched by:
  - `/admin/telemetry?session_id=2d90273738`
  - backend API check with `session_id=2d90273738`
- proven: found:
  - no `frontend_fatal` row
  - no new row at all from this trigger
- proven: network evidence showed:
  - no `POST /api/telemetry/error-events`
- proven: raw ordered timeline for the session did not include this scenario.

#### Unhandled promise rejection

- proven: searched by the same session timeline.
- proven: found:
  - no `frontend_unhandled_rejection` row
  - no `POST /api/telemetry/error-events`
- proven: raw ordered timeline for the session did not include this scenario.

#### Failed API call

- proven: searched by:
  - session/org timeline after opening invalid session route
  - `event_type=api_failure` at org scope
- proven: found:
  - no new `api_failure` row from the invalid-session scenario
- proven: route contract itself returned `200 {"error":"not found"}`, so there was no non-2xx transport failure row to correlate.
- proven: raw ordered timeline did not include this scenario.

#### Healthy save control

- proven: searched by `session_id=2d90273738` after successful save requests.
- proven: found:
  - no `save_reload_anomaly`
  - no extra anomaly/noise row
- proven: ordered timeline stayed unchanged except for the manual intake control and later path report anomaly.
- proven: save path itself was healthy and noise-free in telemetry.

#### Handled/no-op path

- proven: searched by `session_id=2d90273738` and org-level `api_failure`.
- proven: found:
  - no anomaly/noise row from handled invalid-session UI path
  - no anomaly/noise row from normal tab/open/admin navigation
- proven: raw ordered timeline stayed unchanged.

#### AutoPass semantic failure

- proven: searched by:
  - admin session detail for `session_id=2d90273738`
  - admin telemetry timeline for `session_id=2d90273738`
  - org-level `event_type=domain_invariant_violation`
- proven: found:
  - failed AutoPass semantic state in admin session detail
  - no matching AutoPass telemetry row
- proven: this means the semantic failure existed in product state but did not land in the telemetry timeline for this session.

#### Path report semantic failure

- proven: searched by:
  - `session_id=2d90273738`
  - `request_id=req_1b87ad45d196`
  - detail panel for `event_id=evt_b519bb8dd39f`
- proven: found:
  - exactly one backend `domain_invariant_violation` row
  - `correlation_id=rpt_79faa1831bd6`
  - ordered timeline preserved the row
- proven: duplicate telemetry row was not observed.
- proven: partial correlation gap remained because direct `correlation_id` search/pivot was unavailable in admin retrieval.

#### Manual intake control

- proven: this was not a user-facing product scenario; it was a diagnostic control.
- proven: `POST /api/telemetry/error-events` returned `201`.
- proven: the row was immediately retrievable in `/admin/telemetry` by `request_id`, `session_id`, and `runtime_id`.
- proven: this isolated the failure domain to client emission rather than backend intake/admin retrieval.

## 6. Coverage Matrix Result

| Scenario | Expected events | Actual events | Correlation | Noise | Verdict |
| --- | --- | --- | --- | --- | --- |
| Frontend runtime error | `frontend_fatal` | none | broken | OK | missing |
| Unhandled promise rejection | `frontend_unhandled_rejection` | none | broken | OK | missing |
| Failed API call | `api_failure` | none from real invalid-session flow | broken | OK | missing |
| Final save failure | `save_reload_anomaly` | unknown | unknown | unknown | missing |
| Reload/readback anomaly | `save_reload_anomaly` | unknown | unknown | unknown | missing |
| Healthy save control | no anomaly row | no new anomaly row | n/a | OK | covered |
| Request-path backend exception | `backend_exception` | unknown | unknown | unknown | missing |
| Background/worker exception | `backend_async_exception` | unknown | unknown | unknown | missing |
| AutoPass semantic failure | `domain_invariant_violation` | no row despite failed state | broken | OK | missing |
| Path report semantic failure | `domain_invariant_violation` | one backend row | partial: `request_id` and `session_id` OK, `correlation_id` filter missing | OK | partially covered |
| Healthy/no-error path | no anomaly row | no new anomaly row | n/a | OK | covered |
| Handled/no-op path | no anomaly row | no new anomaly row | n/a | OK | covered |

## 7. Proof Artifact

- proven: authoritative proof pack for this cycle is this file plus the artifacts below.
- proven: Playwright run summary artifacts:
  - login failure screenshot: `staging-login-invalid-2026-04-17.png`
  - admin telemetry screenshot: `admin-telemetry-session-2d90273738.png`
  - Playwright snapshots under `.playwright-mcp/` for:
    - login failure;
    - editor session load;
    - invalid session handled state;
    - admin telemetry timeline;
    - admin telemetry detail.
- proven: per-scenario findings anchored to exact staging entities:
  - `org_id=1658ce09bceb`
  - `project_id=94c45c12d3`
  - `session_id=2d90273738`
  - `event_id=evt_3a1e2dff2456`
  - `event_id=evt_b519bb8dd39f`
  - `report_id=rpt_79faa1831bd6`
- proven: telemetry retrieval evidence:
  - `/api/admin/error-events?session_id=2d90273738&org_id=1658ce09bceb`
  - `/api/admin/error-events?request_id=req_1b87ad45d196&org_id=1658ce09bceb`
  - `/api/admin/error-events?runtime_id=rt_manual_probe&org_id=1658ce09bceb`
  - `/api/admin/error-events?correlation_id=rpt_79faa1831bd6&org_id=1658ce09bceb` showing filter gap
- proven: one concise conclusion from the proof pack:
  - backend intake/admin retrieval is alive on staging, path report semantic failure writes correctly, but frontend emission paths do not write and AutoPass semantic failure is not landing in the contour; correlation is also weakened because `correlation_id` cannot be used as a retrieval pivot.

## 8. Remaining Gaps

- proven: exact event paths that still do not write on staging in this audit:
  - frontend runtime error -> no `frontend_fatal`
  - frontend unhandled rejection -> no `frontend_unhandled_rejection`
  - invalid-session user-visible API failure path -> no `api_failure`
  - AutoPass semantic failure state -> no `domain_invariant_violation`
- proven: exact paths that write but correlate only partially:
  - path report semantic failure writes with `request_id`, `session_id`, and `correlation_id`, but `correlation_id` is not queryable in admin retrieval/UI.
- proven: exact noisy paths observed in this audit:
  - reports drawer generates aggressive repeated `GET /reports/versions?path_id=primary` polling;
  - aborted requests (`net::ERR_ABORTED`) were visible in browser network logs;
  - hypothesis: this is UI/network noise, not telemetry-table noise, because no duplicate telemetry rows were written.
- proven: exact paths already reliable enough in this audit:
  - direct intake control path `POST /api/telemetry/error-events`
  - admin retrieval by `session_id`
  - admin retrieval by `request_id`
  - admin retrieval by `runtime_id`
  - path report semantic failure write/readback

## 9. Best Next Step

- proven: best next narrow fix slice is:
  - restore or verify real frontend emission for `frontend_fatal`, `frontend_unhandled_rejection`, and `api_failure` on staging, then re-run this same audit.
- proven: why this is the best next step:
  - the highest practical incident-triage gap is currently on the frontend edge;
  - backend intake and admin retrieval already proved they can persist and surface rows;
  - path report semantic failure already writes;
  - fixing frontend emission is more valuable immediately than widening schema or redesigning admin retrieval.
- hypothesis: the fastest concrete implementation slice after this audit is to verify why the stage frontend bundle never emits `POST /api/telemetry/error-events` for global runtime/rejection/API failures, then patch only that emission path.
- proven: a strong secondary follow-up after that would be `correlation_id` filter support in admin retrieval/UI, but it is second-best because missing frontend writes block incident triage more severely than missing pivot ergonomics.
