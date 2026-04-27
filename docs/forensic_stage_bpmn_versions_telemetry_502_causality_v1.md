# Forensic: Stage BPMN Versions Telemetry 502 Causality v1

Contour: `forensic/stage-bpmn-versions-telemetry-502-causality-v1`

Epic: Stage Stability / BPMN Version History / Telemetry

Date: 2026-04-27

## 1. Runtime / Source Truth

| Item | Value |
| --- | --- |
| Repo/worktree | `/Users/mac/PycharmProjects/processmap_stage_bpmn_versions_telemetry_502_forensic_v1` |
| Remote | `origin git@github.com:xiaomibelov/processmap_v1.git` |
| Branch | `forensic/stage-bpmn-versions-telemetry-502-causality-v1` |
| HEAD | `1f9481aa59d9ad0dec25b5fbe8ab61753390f518` |
| origin/main | `1f9481aa59d9ad0dec25b5fbe8ab61753390f518` |
| merge-base | `1f9481aa59d9ad0dec25b5fbe8ab61753390f518` |
| Initial status | clean, `## forensic/stage-bpmn-versions-telemetry-502-causality-v1...origin/main` |
| Active app version in source | `v1.0.22` from `frontend/src/config/appVersion.js` |
| Stage URL | `https://stage.processmap.ru/app?project=b12ff022e8&session=17533cfbfd` |
| Stage frontend serving | HTTP 200 from `nginx/1.27.5`, remote IP `45.87.104.206` |
| Stage frontend assets observed | `assets/index-Bix3NmwO.js`, `assets/index-DuVU6hbZ.css` |
| Stage last-modified header | `Mon, 27 Apr 2026 10:57:42 GMT` |
| Stage host/log access | Unavailable in this environment; browser/source/direct-HTTP forensic performed. |
| Authenticated browser/session access | Unavailable in this environment; direct API proof is unauthenticated control only. |
| Product code changes | None. Audit markdown only. |

## 2. GSD Proof

| Tool | Result |
| --- | --- |
| `gsd` | not found in PATH |
| `gsd-sdk` | `/Users/mac/.nvm/versions/node/v22.19.0/bin/gsd-sdk` |
| `gsd-sdk --version` | `gsd-sdk v0.1.0` |
| `gsd-sdk query init.phase-op forensic/stage-bpmn-versions-telemetry-502-causality-v1` | returned JSON with `planning_exists:false`, `roadmap_exists:false`, `phase_found:false`, `agents_installed:false` |

GSD tooling limitation: standalone `gsd` is unavailable in this clean branch. This forensic proceeds with `gsd-sdk` init proof plus bounded discuss/plan discipline.

GSD discuss result:

- User problem: stage shows 502 on BPMN version history and telemetry error ingestion.
- Causality question: determine whether telemetry is primary, secondary cascade, parallel infra failure, backend exception, timeout, stale deploy, session data issue, or frontend request noise.
- Non-goals: no product code change, no backend/API/schema change, no stage restart, no deploy, no user data mutation.
- Minimal safe scope: source/runtime forensic, direct safe GET controls, causal map, root-cause verdict with confidence labels, and recommended next contours.

GSD bounded plan result:

1. Establish clean source truth from fresh `origin/main`.
2. Capture stage serving truth and unauth direct endpoint controls.
3. Attempt browser network repro without mutating data.
4. Map backend BPMN versions route and storage path.
5. Map backend telemetry route and storage path.
6. Map frontend request initiators for `limit=50`, `limit=1`, and telemetry.
7. Classify primary/secondary possibilities only where supported by source/runtime proof.
8. Create audit doc only; no product code.

## 3. Exact Network Repro

Authenticated repro was not possible because this environment does not have the user's browser auth/session context.

Browser attempt:

| Order | Request | Initiator | Status | Timing | Primary/secondary hypothesis |
| --- | --- | --- | --- | --- | --- |
| 1 | `GET https://stage.processmap.ru/app?project=b12ff022e8&session=17533cfbfd` | Playwright navigation | 200 then login redirect | not material | Stage frontend serves. |
| 2 | `POST https://stage.processmap.ru/api/auth/refresh` | frontend auth bootstrap | 401 | not material | Browser unauthenticated; process session did not load. |

Playwright final URL: `https://stage.processmap.ru/?next=%2Fapp%3Fproject%3Db12ff022e8%26session%3D17533cfbfd`.

Observed browser console in this environment:

- `Failed to load resource: the server responded with a status of 401 () @ https://stage.processmap.ru/api/auth/refresh:0`

Reported user-side incident, not reproduced here:

| Reported request | Reported status | Repro status here | Notes |
| --- | --- | --- | --- |
| `/api/sessions/17533cfbfd/bpmn/versions?limit=50` | 502 | not reached in browser; 401 without auth via curl | Requires authenticated process load. |
| `/api/sessions/17533cfbfd/bpmn/versions?limit=1` | 502 | not reached in browser; 401 without auth via curl | Requires authenticated process load. |
| `/api/telemetry/error-events` | 502, repeated | not triggered in browser; 401 on unauth GET via curl | POST behavior requires frontend telemetry payload/auth context. |

Because the incident order was not captured with authenticated DevTools/HAR in this environment, the first 502 cannot be proven from browser runtime here.

## 4. Primary Vs Secondary Classification

| Class | Verdict | Evidence |
| --- | --- | --- |
| `PRIMARY_ERROR` | Not proven. Candidate primary is authenticated `/bpmn/versions` 502. | User report includes `/bpmn/versions?limit=50` and `limit=1` 502. Source shows these requests are real process-stage bootstrap/poll flows. Authenticated HAR/logs are required to prove first failure order. |
| `SECONDARY_TELEMETRY_ERROR` | Source-proven as a possible cascade; incident-probable if `/bpmn/versions` failed first. | `frontend/src/lib/apiCore.js:350-361` emits `reportApiFailureEvent` for any non-OK non-telemetry API request. `frontend/src/features/telemetry/telemetryClient.js:459-499` sends `api_failure` telemetry. |
| `PARALLEL_INFRA_ERROR` | Not ruled out for incident time; not reproduced at probe time. | Direct unauth probes return backend JSON 401, not nginx 502, so gateway/backend auth path was alive during this audit. Incident-time logs are required. |
| `RETRY_CASCADE` | Partial source proof: duplicate request surfaces exist; no infinite telemetry loop found. | `limit=1` remote poll and `limit=50` version-head/list load are separate frontend initiators. Telemetry self-noise guard suppresses telemetry endpoint failures from recursively creating telemetry events. |

Answer to key causality questions:

- What was first: unknown from this environment. Need authenticated HAR or gateway access log timestamps.
- Was there a frontend exception between them: not proven. A non-OK API response is enough to emit telemetry; a thrown frontend exception is not required.
- Does frontend send telemetry after failed fetch: yes, source-proven for non-OK non-telemetry API responses.
- Why did telemetry also return 502: unknown for the incident. Possible causes are same upstream/backend outage, telemetry handler/storage exception, or stage gateway issue. Source does not show telemetry request recursion as the reason.

## 5. Direct API Proof

No auth tokens/cookies were available or exposed. Direct controls were unauthenticated safe GETs.

| Endpoint | Auth context | Status | Body class | Notes |
| --- | --- | --- | --- | --- |
| `/api/sessions/17533cfbfd/bpmn/versions?limit=50` | none | 401 | JSON `missing_bearer` | Proves current gateway/backend auth layer responds; does not reproduce authenticated 502. |
| `/api/sessions/17533cfbfd/bpmn/versions?limit=5` | none | 401 | JSON `missing_bearer` | Same control. |
| `/api/sessions/17533cfbfd/bpmn/versions?limit=1` | none | 401 | JSON `missing_bearer` | Same control. |
| `/api/telemetry/error-events` | none, GET | 401 | JSON `missing_bearer` | Confirms route is behind auth/global auth path for this method; does not prove POST ingestion health. |

Direct proof interpretation:

- 502 without auth was not reproduced.
- Current broad gateway/backend unavailability was not observed.
- If authenticated requests still return 502, the likely class is authenticated route/session/data/storage/backend exception or incident-time upstream health, not a static missing route.

## 6. Gateway / Backend Log Correlation

Stage host/log access unavailable; browser/source-only forensic performed.

Required next log correlation:

| Needed evidence | Search terms | Purpose |
| --- | --- | --- |
| nginx/gateway access log | `17533cfbfd`, `bpmn/versions`, `telemetry/error-events`, `502` | Establish exact first 502 and response time. |
| nginx/gateway error log | `upstream`, `connect() failed`, `prematurely closed`, `timeout`, `connection refused` | Distinguish gateway/upstream outage from backend exception/timeout. |
| backend API logs | `Traceback`, `Exception`, `OperationalError`, `ProgrammingError`, `bpmn_versions`, `error_events` | Identify route exception or DB/storage failure. |
| container health | API/gateway container IDs around incident time | Detect stage deploy/health mismatch. |

No restart/deploy/container mutation was performed.

## 7. Backend BPMN Versions Source Map

| Function/file | Responsibility | 502-relevant risk |
| --- | --- | --- |
| `backend/app/_legacy_main.py:6259-6325` `session_bpmn_versions_list` | Route handler for `GET /api/sessions/{session_id}/bpmn/versions`. Loads scoped session, lists versions, builds author fields, computes current session payload hash, finds latest user-facing version. | Unhandled exception in session load, author lookup, payload hashing, storage query, or response serialization could become backend 500 or gateway 502 depending serving stack. |
| `backend/app/_legacy_main.py:6934-6960` `_legacy_load_session_scoped` | Loads session by org candidates and checks project scope. | Auth/org/project scope edge cases can return no session; source shows no explicit 502 path here, but storage/auth exceptions can still fail. |
| `backend/app/storage.py:2699-2762` `list_bpmn_versions` | Queries `bpmn_versions`; default `include_xml=False` excludes heavy XML payload. Clamps limit to 1..1000. | Query itself is metadata-only for current frontend calls. A DB lock/schema/connect issue could fail. `limit=50` should not load XML unless `include_xml=1`. |
| `backend/app/storage.py:409-416` `session_version_payload_hash` | Serializes selected session payload and hashes it. Payload includes BPMN XML and `bpmn_meta` without companion meta. | Heavy/corrupt session payload can affect both `limit=1` and `limit=50`, because handler always computes this hash. |
| `backend/app/_legacy_main.py:6030-6040` `_latest_user_facing_bpmn_version` | Calls `storage.list_bpmn_versions(... limit=1000, include_xml=False)` and scans source actions. | Every list request performs this extra metadata query independent of requested `limit`. Heavy version count is bounded at 1000 metadata rows, not XML by default. |

Important source finding:

- The observed `limit=50` and `limit=1` calls use the same backend handler and both trigger `session_version_payload_hash` plus `_latest_user_facing_bpmn_version(... limit=1000, include_xml=False)`.
- Therefore `BACKEND_TIMEOUT_HEAVY_BPMN_VERSIONS` caused only by `limit=50` metadata list is less likely than a shared handler/session/storage failure, unless logs show response-time timeout.

## 8. Backend Telemetry Source Map

| Function/file | Responsibility | Cascade risk |
| --- | --- | --- |
| `backend/app/routers/error_events.py:13-29` `ingest_error_event` | `POST /api/telemetry/error-events`; builds stored event and appends it via storage. | Handler has no local try/catch. Storage/schema/validation exceptions can surface as server errors. |
| `backend/app/error_events/schema.py:49-100` `ErrorEventIn` | Validates telemetry payload; `extra="forbid"`, required message/source/event_type/severity. | Invalid payload should normally be 422, not 502, unless serving/gateway transforms failures unexpectedly. |
| `backend/app/storage.py:5747-5825` `append_error_event` | Inserts telemetry event into `error_events`. Calls `_ensure_schema()` and writes JSON context. | DB/schema/write failure can break telemetry ingestion independently. |
| `backend/app/routers/__init__.py:18-34` | Registers `error_events_router`. | Route exists in source; direct unauth GET reached auth layer, so this is not obviously a missing-route problem. |

## 9. Frontend Request Initiator Map

| Request | Frontend initiator | Trigger | Retry? | Error handling |
| --- | --- | --- | --- | --- |
| `/api/sessions/{sid}/bpmn/versions?limit=1` | `frontend/src/components/ProcessStage.jsx:1376-1386` `pollRemoteSessionSnapshot` | On process mount, interval, window focus, and visibility change via `ProcessStage.jsx:1461-1483`. | In-flight guard prevents overlapping poll; interval repeats later. | If response is not ok, returns `head_fetch_failed`. API core emits telemetry for non-OK unless suppressed. |
| `/api/sessions/{sid}/bpmn/versions?limit=50` | `frontend/src/components/ProcessStage.jsx:4214-4227` `refreshLatestBpmnRevisionHead` / `openVersionsModal`; also `ProcessStage.jsx:4973-4982` head refresh on sid/draft changes. | Process session load/draft changes and versions modal. | No explicit retry loop in this function; effects can re-run on dependencies. | Sets version load/head status failed; API core emits telemetry for non-OK. |
| `/api/sessions/{sid}/bpmn/versions?limit=50` | `frontend/src/components/ProcessStage.jsx:4081-4180` `refreshSnapshotVersions` | Shared loader for version head/list. | No request dedupe visible for this loader. | On failure clears versions list/truth state and records load error. |
| `/api/telemetry/error-events` | `frontend/src/lib/apiCore.js:350-361` to `frontend/src/features/telemetry/telemetryClient.js:459-499` | Any non-OK API response except the telemetry endpoint itself. | Telemetry has throttling by fingerprint. | `sendTelemetryEvent` returns failure info but does not throw; telemetry endpoint failures are self-suppressed. |

Telemetry loop guard:

- `apiCore.js:350` skips API failure telemetry when the failed endpoint is `/api/telemetry/error-events`.
- `telemetryClient.js:319-323` suppresses telemetry self-noise by depth and endpoint.
- `telemetryClient.js:470-472` returns `telemetry_self_noise` for telemetry endpoint failures.

This means `/api/telemetry/error-events` 502 should not recursively create an infinite telemetry loop by itself.

## 10. Data / Session-Specific Check

DB/session-specific proof not performed; no DB access was available and no user data was mutated.

Needed read-only checks:

| Check | Purpose | Risk if abnormal |
| --- | --- | --- |
| Session row `17533cfbfd` exists and org/project matches `b12ff022e8` | Verify scoped loader path. | Missing or wrong org/project could expose auth/scope edge behavior. |
| Count of `bpmn_versions` rows for session/org | Verify history size. | Very large count can affect the extra latest-user-facing scan, although source caps at 1000 metadata rows. |
| Max/avg `bpmn_xml` size in `bpmn_versions` | Verify payload risk. | Should not affect list calls unless `include_xml=1`, but can affect detail/diff requests. |
| Size/shape of current `sessions.bpmn_xml` and `bpmn_meta_json` | Verify `session_version_payload_hash` workload. | Huge/corrupt payload can affect both `limit=1` and `limit=50`. |
| DB errors/locks around incident time | Verify storage failure. | Could explain both BPMN versions and telemetry 502 if shared DB was unhealthy. |

## 11. Root Cause Verdict

| Verdict | Confidence | Evidence | User impact | Next contour |
| --- | --- | --- | --- | --- |
| `I. UNKNOWN_NEEDS_LOG_ACCESS` | High | Authenticated 502 was not reproducible here; no stage backend/gateway logs or DB access. | Exact primary cause cannot be honestly assigned from source-only proof. | `ops/stage-gateway-api-502-healthcheck-v1` or log-access forensic continuation. |
| `F. TELEMETRY_SECONDARY_CASCADE` | Medium, conditional | Source proves failed non-telemetry API responses emit telemetry. If `/bpmn/versions` was first, telemetry is secondary. | One primary API failure can produce additional noisy telemetry 502s. | `fix/telemetry-error-events-failure-loop-guard-v1` only if logs/HAR confirm noisy repeats. |
| `H. FRONTEND_DUPLICATE_REQUEST_NOISE` | High for amplification, low as root cause | Source has separate `limit=1` polling and `limit=50` version-head/list flows. | Users see multiple failing requests for one underlying broken endpoint. | `fix/bpmn-version-polling-request-dedupe-v1`. |
| `A. BACKEND_EXCEPTION_BPMN_VERSIONS` | Possible | Handler has several unguarded operations after auth/session load: author build, session payload hash, latest user-facing query. | Version history/head load fails and may block UI state that depends on latest BPMN version. | `fix/bpmn-versions-endpoint-502-v1` after log proof. |
| `B. BACKEND_TIMEOUT_HEAVY_BPMN_VERSIONS` | Possible but not specifically `limit=50`-proven | List calls are metadata-only by default, but the handler always hashes session payload and performs an extra `limit=1000` metadata scan. | Slow session/hash/storage path can cause gateway timeout. | `perf/bpmn-versions-list-metadata-only-v1` or `fix/bpmn-versions-head-lightweight-v1`. |
| `C. GATEWAY_UPSTREAM_UNAVAILABLE` | Possible at incident time, not reproduced | Direct current probes return 401 JSON through nginx/backend, not 502. | Both BPMN versions and telemetry can fail together if API upstream is unhealthy. | `ops/stage-gateway-api-502-healthcheck-v1`. |
| `D. STAGE_DEPLOY_HEALTH_ISSUE` | Possible | Stage frontend was freshly served, but backend/container identity unavailable. | Frontend/backend mismatch or unhealthy API container could cause 502. | `ops/stage-deploy-serving-identity-v1`. |
| `E. SESSION_DATA_SPECIFIC_FAILURE` | Possible | Both `limit=1` and `limit=50` share session-specific payload hashing and scoped loading. DB not inspected. | Only this session or similar large/corrupt sessions fail. | `forensic/session-17533cfbfd-version-data-integrity-v1`. |
| `G. TELEMETRY_ENDPOINT_BROKEN_INDEPENDENTLY` | Possible but unproven | Telemetry handler writes DB via `append_error_event`; direct unauth GET cannot prove authenticated POST health. | Error reporting itself is unavailable, obscuring the primary incident. | `fix/telemetry-error-events-ingest-502-v1` if logs show route-specific exception. |

Current best causality statement:

- Do not treat `/api/telemetry/error-events` as primary yet.
- Source proof supports this likely chain if user-side order confirms it: `/bpmn/versions` 502 -> API core emits `api_failure` telemetry -> telemetry POST also returns 502 because the telemetry route/backend/storage/gateway is unhealthy.
- Exact backend/gateway/session cause remains unproven without authenticated HAR timestamps and stage logs.

## 12. Recommended Fix / Follow-Up Contours

1. `ops/stage-gateway-api-502-healthcheck-v1`
   - Scope: correlate nginx access/error logs, API container logs, health checks, upstream reset/timeout messages.
   - Non-goals: no product code change.
   - Likely files/tools: stage compose/log commands, deployment metadata.
   - Validation: exact first 502 layer identified with timestamp and request ID.

2. `fix/bpmn-versions-endpoint-502-v1`
   - Scope: add defensive error handling/observability after log-proven exception in BPMN versions handler.
   - Non-goals: no versioning model change.
   - Likely files: `backend/app/_legacy_main.py`, `backend/app/storage.py`, targeted backend tests.
   - Validation: affected session returns 200 or controlled 4xx/5xx JSON, not gateway 502.

3. `perf/bpmn-versions-list-metadata-only-v1`
   - Scope: make version-head/list endpoint lighter if logs show timeout or heavy payload hashing.
   - Non-goals: no XML detail/history semantics change.
   - Likely files: BPMN versions route/storage and frontend head consumers.
   - Validation: `limit=1` and `limit=50` complete under target latency on large sessions.

4. `fix/telemetry-error-events-failure-loop-guard-v1`
   - Scope: reduce noisy repeated telemetry sends after the telemetry endpoint itself is failing.
   - Non-goals: no telemetry schema redesign.
   - Likely files: `frontend/src/features/telemetry/telemetryClient.js`, tests.
   - Validation: one primary API failure emits bounded telemetry attempts; telemetry failure does not cascade.

5. `fix/bpmn-version-polling-request-dedupe-v1`
   - Scope: dedupe or coordinate `limit=1` remote poll and `limit=50` head/list fetches during bootstrap.
   - Non-goals: no save/version business logic change.
   - Likely files: `frontend/src/components/ProcessStage.jsx`, targeted frontend tests.
   - Validation: process load does not fire duplicate failing version requests.

6. `forensic/session-17533cfbfd-version-data-integrity-v1`
   - Scope: read-only DB inspection of session, `bpmn_versions`, payload sizes, org/project relations, and DB errors.
   - Non-goals: no data repair without separate approval.
   - Likely files/tools: DB read scripts or admin shell.
   - Validation: session-specific risk proven or ruled out.

## 13. Validation

Audit-only validation plan:

- `git diff --check`
- `git status -sb`
- `git diff -- docs/forensic_stage_bpmn_versions_telemetry_502_causality_v1.md`

Full test suite not required because no product code changed.

## 14. Final Forensic Summary

Closed:

- Clean source/runtime truth established.
- Stage frontend serving truth established.
- Direct unauth endpoint controls established.
- Browser unauth repro limitation documented.
- Backend BPMN versions path mapped.
- Backend telemetry path mapped.
- Frontend `limit=1`, `limit=50`, and telemetry initiators mapped.
- Telemetry secondary-cascade mechanism proven in source.

Not closed:

- Exact first 502 and root backend/gateway cause require authenticated HAR and stage gateway/backend logs.

Regression check:

| Check | Result |
| --- | --- |
| Product code unchanged | yes |
| Backend untouched | yes |
| User data untouched | yes |
| Stage deploy/restart avoided | yes |
| Telemetry not treated as primary without order proof | yes |
