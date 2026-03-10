# MANIFEST_WORKING_PRODUCT

## Purpose

This baseline was assembled by whitelist into a new sibling directory:

- source: `/Users/mac/PycharmProjects/foodproc_process_copilot`
- baseline: `/Users/mac/PycharmProjects/working_product_baseline`

The source project was not cleaned in place, moved, or deleted.

## Included

### Root files

- `Dockerfile`
- `docker-compose.yml`
- `README.md`
- `.gitignore` (baseline-specific)
- `.env.example` (sanitized baseline template)
- `README_BASELINE.md`
- `MANIFEST_WORKING_PRODUCT.md`
- `BASELINE_ACCEPTANCE_REPORT.md`

### Product source

- `backend/app/`
- `backend/requirements.txt`
- `backend/scripts/`
- `backend/tests/` kept intentionally as source + QA surface
- `frontend/src/`
- `frontend/e2e/` kept intentionally as source + QA surface
- `frontend/package.json`
- `frontend/package-lock.json`
- `frontend/playwright.config.mjs`
- `frontend/vite.config.js`
- `frontend/postcss.config.cjs`
- `frontend/tailwind.config.js`
- `frontend/index.html`
- `frontend/Dockerfile`
- `frontend/.dockerignore`
- `frontend/.gitignore`

### Selected documentation

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
- `docs/README.md`

### Deploy / ops

- `deploy/.env.server.example`
- `deploy/nginx/default.conf`
- `deploy/scripts/server_bootstrap.sh`
- `deploy/scripts/server_first_deploy.sh`
- `deploy/scripts/server_update.sh`
- `deploy/scripts/server_smoke.sh`
- `deploy/ROLLBACK.md`
- selected root scripts:
  - `scripts/dev_up.sh`
  - `scripts/docker_compose_safe_stop.sh`
  - `scripts/docker_recover_v1.sh`
  - `scripts/e2e_enterprise.sh`
  - `scripts/ci_enterprise_e2e.sh`
  - `scripts/drawio_regression_gate.sh`

## Excluded intentionally

### Secrets and env

- real root `.env`
- any filled server env file
- any generated key/cert material

### Runtime / local state

- `workspace/`
- `backend/workspace/`
- session stores, sqlite databases, local Postgres data directories
- uploads/media/runtime storage
- `deploy/logs/`

### Build artifacts / caches

- `frontend/node_modules/`
- `frontend/dist/`
- `frontend/test-results/`
- Python `__pycache__/`
- `*.pyc`
- logs, temp files, archives

### Local / non-product clutter

- `.git/`
- `.idea/`
- `.vscode/`
- `.claude/`
- `.tools/`
- `archive/`
- `artifacts/`
- `backups/`
- `zip/`
- extraction/temp directories such as `.fpc_extract_*`

### Excluded by conservative review

- most of source `docs/`
  - reason: excluded documents were debug evidence, migration notes, handoff packs, audit artifacts, or time-bound forensics instead of stable repo documentation
- most root `scripts/`
  - reason: many files are one-off patch/hotfix/forensics helpers rather than stable product tooling
- frontend local diagnostics
  - excluded: `frontend/e2e/*.local.mjs`

## Files and areas that need manual review

- `backend/app/_legacy_main.py`
  - kept because current startup, routers, scripts, and tests still import it directly; removing it now would be risky.
- `backend/app/static/`
  - kept because the backend still serves static assets from this path.
- `backend/scripts/sanitize_drawio_persisted_state.py`
  - kept intentionally as maintenance tooling for persisted draw.io cleanup; not treated as core runtime.
- `scripts/dev_up.sh`
  - adjusted to stop auto-tagging and to work without an initialized Git repository; keep reviewing whether it should remain a thin wrapper only.
- `docker-compose.yml`
  - credential-style fallbacks were removed; `.env` remains mandatory and should still be reviewed before public push.
- `deploy/.env.server.example`
  - normalized into a stricter template; verify final variable names, domains, and operational defaults.
- `frontend/e2e/`
  - intentionally kept as part of source + QA surface.
- `backend/tests/`
  - intentionally kept as part of source + QA surface.
- `docs/`
  - only selected stable documents were imported; excluded docs may still need manual cherry-pick if some long-lived spec was missed.

## Potential secret locations to verify

- `.env` after local/server population
- `deploy/.env.server.example` after editing into a real server `.env`
- `workspace/.session_store/_llm_settings.json`
- any copied database dumps or exports produced outside this baseline
- CI variables used by Playwright or deploy flows

## Runtime data intentionally not copied

- sqlite files such as `workspace/.session_store/processmap.sqlite3`
- local session stores and cached process exports
- local Redis/Postgres container volumes
- browser/e2e output directories
- deploy logs
- any uploaded/generated media

## Sanitized cases

- root `.env.example`
  - normalized into required vs optional sections and removed ambiguous weak defaults
- `deploy/.env.server.example`
  - normalized into required vs optional sections and removed ambiguous weak defaults
- `docker-compose.yml`
  - removed credential-like `${VAR:-default}` fallbacks for DB, Redis, ports, and gateway exposure
- `scripts/dev_up.sh`
  - removed auto-tagging and Git-required root discovery

## Manual checks before first Git push

1. Confirm `docker-compose.yml` env requirements are acceptable for the intended remote visibility and CI flow.
2. Review `deploy/.env.server.example` and `.env.example` for final placeholder wording and any missing variables.
3. Review whether the imported `docs/` subset is complete enough for the future repo.
4. Confirm public URLs, SMTP settings, and admin bootstrap policy for the target environment.
5. Search once more for secrets in the baseline:
   - `rg -n "(API_KEY|SECRET|TOKEN|PASSWORD|BEGIN RSA|BEGIN OPENSSH)" .`
6. Verify executable bits and shell compatibility for scripts in `deploy/scripts/` and `scripts/`.
7. Run at least:
   - `docker compose config -q`
   - `cd frontend && npm install && npm run build`
   - backend test/smoke commands appropriate for the target environment

## Current readiness

- baseline directory is assembled
- obvious runtime junk and local data are absent
- container and deploy files are present
- tests and e2e remain present by explicit decision
- manual review is still recommended for final env wording, imported docs completeness, and future public exposure policy
