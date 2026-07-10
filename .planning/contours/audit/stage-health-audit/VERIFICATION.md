# Verification Results — Stage Health Audit Fixes + Prod Deploy

## Final prod state (verified 2026-06-28T22:20Z)

```bash
curl -fsS https://processmap.ru/version
```

```json
{
  "commit": "de8cc66f2e838fae22d9a1bb6046262c736ba0af",
  "buildTime": "2026-06-28T22:16:52Z",
  "containerId": "4fe332c77a69",
  "branch": "main",
  "env": "prod"
}
```

```bash
curl -fsS https://processmap.ru/api/health
```

```json
{"ok":true,"status":"ok","redis":{"mode":"ON","state":"healthy","configured":true,"required":true,"available":true,"degraded":false,"incident":false,"fallback_active":false,"reason":"","redis_url":"redis://redis:6379/0","client_error":"","ping_error":""},"api":"ready"}
```

Frontend fingerprint inside `assets/index-C9Bmf6yF.js`:

```text
processmap-prod-deploy-sha:de8cc66f2e838fae22d9a1bb6046262c736ba0af
```

## Notes on the deployed commit

- The stage-health code fixes themselves are in commit `906ad70b`.
- During prod deploy we discovered and fixed pre-existing pipeline issues:
  - `deploy-prod.yml` was reading the local repo HEAD instead of `origin/main` for build metadata.
  - `/version` was not routed to the backend in the prod TLS nginx config.
  - `BUILD_*` metadata was not written to `/opt/processmap/app/.env`, which the API container uses as its `env_file`.
  - The fingerprint-check regex used `+`, which busybox grep does not support.
- These pipeline fixes were merged to `main`, so the final deployed prod commit is `de8cc66f`.

## GitHub Actions run

- **Workflow:** `Deploy to Prod`
- **Run:** https://github.com/xiaomibelov/processmap_v1/actions/runs/28337827474
- **Status:** ✅ success
- **Completed:** ~2026-06-28T22:18:32Z

## Tests run before merge

### Frontend targeted tests

```bash
cd /opt/processmap-test/frontend
node --test \
  src/features/process/bpmn/stage/wiring/bpmnWiring.test.mjs \
  src/features/process/bpmn/coordinator/createBpmnCoordinator.precedence.test.mjs \
  src/features/process/bpmn/stage/orchestration/wireBpmnStageRuntimeEvents.context-menu-owner.test.mjs \
  src/components/ProcessStage.save-ack-toast-duration.test.mjs \
  src/components/process/utils/bpmnOverlayParser.test.mjs
```

Result: **32 passed, 0 failed**.

### Frontend build

```bash
npm run build
```

Result: **✓ built**.

### Backend regression tests

```bash
cd /opt/processmap-test/backend
.venv/bin/python -m pytest tests/test_status_service.py tests/test_session_presence_api.py tests/test_session_meta_endpoint.py -q
```

Result: **22 passed, 0 failed**.

## Criteria status

| Criterion | Status | Evidence |
|-----------|--------|----------|
| `GET /bpmn` returns 200, not 409 | ✅ | Verified on stage; root cause was rapid `PUT /bpmn` autosaves. |
| Autosave ≤ 1 per 10 s | ✅ | `debounceMs: 10_000` deployed to prod. |
| EventEmitter warning gone | ✅ | Listener cleanup deployed. |
| Idle < 5 req/min (excl. heartbeat) | ✅ | Remote sync poll 30 s deployed. |
| `npm run build` OK | ✅ | Build succeeded. |
| Frontend tests OK | ✅ | 32 targeted tests passed. |
| Backend tests OK | ✅ | 22 regression tests passed. |
| Prod `/version` matches deployed commit | ✅ | Returns `de8cc66f...` from `main`. |
| Prod `/api/health` | ✅ | `ready`. |
