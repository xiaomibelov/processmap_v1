# BASELINE_ACCEPTANCE_REPORT

## Status

READY WITH NOTES

## Scope

Work was performed only inside:

- `/Users/mac/PycharmProjects/working_product_baseline`

The source project at `/Users/mac/PycharmProjects/foodproc_process_copilot` was not modified.

## Changes made

### Compose

- tightened `docker-compose.yml` so DB, Redis, and exposed port values come from `.env` instead of credential-like `${VAR:-default}` fallbacks
- kept overall service structure unchanged

### Env templates

- normalized `.env.example`
- normalized `deploy/.env.server.example`
- split both templates into required vs optional sections
- replaced weak or ambiguous admin values with explicit placeholders
- added missing variables used by current runtime or enterprise hardening paths:
  - `REDIS_PORT`
  - `CORS_ORIGINS`
  - `PROJECT_STORAGE_DIR`
  - `FPC_DB_MIGRATE_FILES`
  - `FPC_DEFAULT_ORG_*`
  - invite / SMTP / retention / rate-limit variables
  - maintenance toggles used by current backend paths

### Docs

- restored only selected stable docs into `docs/`
- added `docs/README.md` to explain the subset

### Script hygiene

- updated `scripts/dev_up.sh`
- removed automatic git tag creation
- removed hard dependency on an initialized git repository for root discovery
- made the script fail fast when `.env` is missing

### Baseline docs

- updated `README_BASELINE.md`
- updated `MANIFEST_WORKING_PRODUCT.md`
- added this acceptance report

### Post-deploy repo follow-up

- investigated a real server-side Vite import-analysis failure for `../workspace/computeDodPercent`
- confirmed the required frontend workspace module files existed locally but had been excluded from Git by an over-broad root `.gitignore` rule: `workspace/`
- narrowed that ignore rule to top-level runtime storage only
- prepared the minimal frontend workspace runtime source set for the next commit:
  - `frontend/src/features/workspace/computeDodPercent.js`
  - `frontend/src/features/workspace/workspacePermissions.js`
- intentionally did not carry over unrelated sibling files from the local workspace subtree

### Production frontend runtime correction

- confirmed the previous production-style deploy path still ran the frontend through Vite dev runtime
- replaced the runtime frontend container with a static build path:
  - `frontend/Dockerfile` now performs `npm ci + npm run build` in a build stage
  - final runtime image is nginx with `dist/` baked in
  - `gateway` now builds from that image and serves SPA static assets directly
- updated nginx routing so:
  - `/api/` proxies to `api:8000`
  - `/` serves static files with SPA fallback to `/index.html`
- removed compose dependence on the old `frontend` dev service and updated server deploy scripts accordingly
- added a root `.dockerignore` to keep runtime data, local caches, and build junk out of Docker build context

### Multi-environment overlay preparation

- added explicit prod app overlay files:
  - `docker-compose.prod.yml`
  - `.env.prod.example`
  - `deploy/scripts/deploy_prod.sh`
  - `deploy/scripts/smoke_prod.sh`
  - `deploy/scripts/rollback_prod.sh`
- added explicit stage app overlay files:
  - `docker-compose.stage.yml`
  - `.env.stage.example`
  - `deploy/scripts/deploy_stage.sh`
  - `deploy/scripts/smoke_stage.sh`
  - `deploy/scripts/rollback_stage.sh`
- added shared public edge overlay files:
  - `docker-compose.edge.yml`
  - `.env.edge.example`
  - `deploy/edge/nginx/conf.d/processmap.ru.conf`
  - `deploy/edge/nginx/conf.d/stage.processmap.ru.conf`
  - `deploy/scripts/deploy_edge.sh`
  - `deploy/scripts/smoke_edge.sh`
  - `deploy/scripts/rollback_edge.sh`
- documented the same-server topology and shared-edge/webroot model in `deploy/DEPLOY_OVERLAYS.md`
- marked standalone cert renewal as legacy that must be migrated before final prod+stage shared-edge rollout

## Files changed

- `.env.example`
- `docker-compose.yml`
- `deploy/.env.server.example`
- `scripts/dev_up.sh`
- `README_BASELINE.md`
- `MANIFEST_WORKING_PRODUCT.md`
- `BASELINE_ACCEPTANCE_REPORT.md`
- `.dockerignore`
- `frontend/Dockerfile`
- `deploy/nginx/default.conf`
- `deploy/scripts/server_first_deploy.sh`
- `deploy/scripts/server_update.sh`
- `deploy/scripts/server_smoke.sh`
- `docker-compose.prod.yml`
- `docker-compose.stage.yml`
- `docker-compose.edge.yml`
- `.env.prod.example`
- `.env.stage.example`
- `.env.edge.example`
- `deploy/edge/nginx/conf.d/processmap.ru.conf`
- `deploy/edge/nginx/conf.d/stage.processmap.ru.conf`
- `deploy/scripts/deploy_prod.sh`
- `deploy/scripts/smoke_prod.sh`
- `deploy/scripts/rollback_prod.sh`
- `deploy/scripts/deploy_stage.sh`
- `deploy/scripts/smoke_stage.sh`
- `deploy/scripts/rollback_stage.sh`
- `deploy/scripts/deploy_edge.sh`
- `deploy/scripts/smoke_edge.sh`
- `deploy/scripts/rollback_edge.sh`
- `deploy/DEPLOY_OVERLAYS.md`
- `docs/README.md`

## Docs imported from source

- `docs/user_guide.md`
- `docs/enterprise_prod_ops.md`
- `docs/drawio-layer-product-spec.md`
- `docs/drawio-regression-gate.md`
- `docs/contract_project_api.md`
- `docs/contract_project_sessions_api.md`
- `docs/contract_session_api.md`
- `docs/ui_actions_catalog.md`
- `docs/rbac_matrix.md`
- `docs/redis/redis_overview.md`
- `docs/redis/redis_keys.md`

## Docs intentionally excluded

Excluded categories:
- debug evidence
- forensics / handoff packs
- migration snapshots tied to one cleanup pass
- local audit artifacts
- time-bound decomposition notes without clear long-term repo value

## Intentionally kept as-is

- `backend/app/_legacy_main.py`
  - still imported by startup, routers, scripts, and tests
- `backend/app/static/`
  - still serves legacy static assets
- `backend/scripts/sanitize_drawio_persisted_state.py`
  - kept intentionally as maintenance tooling
- `backend/tests/`
  - kept as part of source + QA surface
- `frontend/e2e/`
  - kept as part of source + QA surface

## Residual notes / risks

- `.env.example` and `deploy/.env.server.example` are cleaner, but final values still need a human pass before any public push.
- `docker-compose.yml` is stricter now; local/CI flows must provide `.env`.
- The docs subset is conservative; a later repo owner may still want to cherry-pick one or two more stable docs.
- `README.md` still reflects the original product runbook and was not rewritten in this cleanup pass.
- `npm run build` completed successfully, but Vite reported oversized chunks; that is a performance note, not a baseline blocker.
- The baseline repository does not contain `docker-compose.ssl.yml`; if the live server uses an out-of-repo SSL override, its `/` location must stay aligned with the new static-serving gateway model.

## Validation run

Executed from baseline:

- `docker compose config -q` using a temporary `.env` copied from `.env.example`, then removed
- `cd backend && PYTHONPATH=. python3 -m unittest tests.test_bpmn_meta -q`
- `cd frontend && npm ci && npm run build`, then removed generated `node_modules/` and `dist/`
- `docker build -f frontend/Dockerfile -t processmap-gateway-validate .`
- `docker compose build gateway`
- `docker run --rm processmap-gateway-validate sh -lc 'nginx -t'`
- `APP_ENV_FILE=.env.prod.example docker compose --env-file .env.prod.example -f docker-compose.yml -f docker-compose.prod.yml -p processmap_prod config -q`
- `APP_ENV_FILE=.env.stage.example docker compose --env-file .env.stage.example -f docker-compose.yml -f docker-compose.stage.yml -p processmap_stage config -q`
- `docker compose --env-file .env.edge.example -f docker-compose.edge.yml -p processmap_edge config -q`
- `bash -n deploy/scripts/deploy_prod.sh deploy/scripts/smoke_prod.sh deploy/scripts/rollback_prod.sh`
- `bash -n deploy/scripts/deploy_stage.sh deploy/scripts/smoke_stage.sh deploy/scripts/rollback_stage.sh`
- `bash -n deploy/scripts/deploy_edge.sh deploy/scripts/smoke_edge.sh deploy/scripts/rollback_edge.sh`

Additional verification performed:

- secret pattern scan with `rg -n "(API_KEY|SECRET|TOKEN|PASSWORD|BEGIN RSA|BEGIN OPENSSH|PRIVATE KEY)" .`
- artifact scan for `.env`, sqlite/db/log/key/cert files and excluded runtime/build directories
- check that `frontend/e2e/*.local.mjs` did not return
- removed leftover Python `__pycache__/` directories from baseline after verification
- inspected `frontend/dist/index.html` and confirmed the static build no longer references `@vite/client`, `:5177`, HMR, or websocket runtime strings

## Current recommendation

- Git init inside baseline: yes, after one human review of env wording and the selected docs subset.
- Public push immediately after git init: not yet; review placeholders, domains, and any organization-specific settings first.
