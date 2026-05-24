# REVIEW_BLOCKED — perf/session-analysis-bpmn-tab-switch-load-regression-v1

## Run ID
20260514T203307Z-78439

## Blocker Description
The claimed fix is **not deployed to the runtime under test** (`http://clearvestnic.ru:5180`).

The gateway Docker container (`processmap_test-gateway-1`) is still serving the **old build** from `2026-05-14T10:08:24Z` (image created ~11.5 hours ago). The frontend source changes were made and a local `npm run build` produced updated `dist/` assets at `2026-05-14T21:37:17Z`, but the gateway container was **never rebuilt or restarted** to include those new static files.

## Evidence

### 1. Gateway container age
- Container started: `2026-05-14T10:08:53Z`
- Image created: `2026-05-14T10:08:24Z`
- Current time: `2026-05-14T21:46Z`

### 2. Network request counts during 3 tab-switch cycles (Analysis ↔ BPMN)
Observed on `http://clearvestnic.ru:5180/app?project=b1c8a56b6e&session=4c515d1c6e`:

| Request Type | Count | Expected (per acceptance criteria) |
|--------------|-------|------------------------------------|
| `GET /api/sessions/4c515d1c6e/bpmn/versions?limit=1` | **25+** | ≤ 1 per switch, ≤ 3 total across all 6 switches |
| `PATCH /api/sessions/4c515d1c6e` | 0 | 0 |
| `409 Conflict` | 0 | 0 |
| Console errors | 1 (401 Unauthorized on versions endpoint) | 0 |

The versions endpoint is still being called in a rapid burst (8–9 calls per single tab switch), identical to the pre-fix baseline behavior documented in `PLAN.md`.

### 3. Source/build truth
- Source files `frontend/src/components/ProcessStage.jsx` and `frontend/src/features/process/hooks/useProcessTabs.js` **do** contain the claimed modifications (verified via `git diff`).
- `frontend/dist/assets/index-*.js` **does** contain the minified fix logic (verified via string grep).
- However, the gateway container's `/usr/share/nginx/html` (the path actually served on port 5180) contains the old build from 10:08 UTC.

### 4. Agent 2 execution note
`EXEC_REPORT.md` states: "Gateway nginx config was temporarily modified to proxy to the dev server for HMR-based debugging, then reverted to the original static-file serving config before deploying the production build."

Reverting the nginx config without rebuilding the gateway Docker image leaves the old static build in place.

## Why Fix Cannot Be Validated
Playwright/browser review against port 5180 exercises the **old, unpatched build**. The acceptance criteria (≤ 1 versions call per switch, zero PATCH, no duplicate toasts, fast visual switch) cannot be measured on the actual runtime because the fix is not present there.

## Required Next Step
**Agent 2 must rebuild and restart the gateway container** so that the updated `frontend/dist` is served on port 5180:

```bash
cd /opt/processmap-test
docker compose build gateway
docker compose up -d gateway
```

After deployment, Agent 3 will re-run the full Playwright tab-switch cycle and produce a new review verdict.

## Risk
If the gateway is not rebuilt, the fix will remain undeployed regardless of code correctness.
