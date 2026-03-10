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

## Files changed

- `.env.example`
- `docker-compose.yml`
- `deploy/.env.server.example`
- `scripts/dev_up.sh`
- `README_BASELINE.md`
- `MANIFEST_WORKING_PRODUCT.md`
- `BASELINE_ACCEPTANCE_REPORT.md`
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

## Validation run

Executed from baseline:

- `docker compose config -q` using a temporary `.env` copied from `.env.example`, then removed
- `cd backend && PYTHONPATH=. python3 -m unittest tests.test_bpmn_meta -q`
- `cd frontend && npm ci && npm run build`, then removed generated `node_modules/` and `dist/`

Additional verification performed:

- secret pattern scan with `rg -n "(API_KEY|SECRET|TOKEN|PASSWORD|BEGIN RSA|BEGIN OPENSSH|PRIVATE KEY)" .`
- artifact scan for `.env`, sqlite/db/log/key/cert files and excluded runtime/build directories
- check that `frontend/e2e/*.local.mjs` did not return
- removed leftover Python `__pycache__/` directories from baseline after verification

## Current recommendation

- Git init inside baseline: yes, after one human review of env wording and the selected docs subset.
- Public push immediately after git init: not yet; review placeholders, domains, and any organization-specific settings first.
