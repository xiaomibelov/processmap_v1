# Working Product Baseline

This directory is a conservative baseline candidate for a future Git repository.

Included:
- `backend/` application source, backend maintenance scripts, backend tests
- `frontend/` application source, Playwright config, e2e tests, frontend build config
- `deploy/` nginx config, deploy/update/smoke scripts, server env template
- `docs/` selected stable product/ops/spec documents only
- root container/run files: `Dockerfile`, `docker-compose.yml`, `README.md`, `.env.example`
- selected root operational scripts in `scripts/`

Intentionally excluded:
- real `.env`
- runtime workspace data, DB files, logs, caches, local build outputs
- most of source `docs/` plus one-off patch/forensics scripts
- local IDE/system clutter

Quick structure:
- `backend/app/` FastAPI runtime
- `backend/scripts/` backend maintenance/migration utilities
- `backend/tests/` Python test suite
- `frontend/src/` React/Vite client
- `frontend/e2e/` Playwright scenarios kept as part of source QA surface
- `deploy/` container deploy and smoke scripts
- `docs/` selected stable support/spec/runbook docs
- `scripts/` selected dev/e2e/recovery helpers

Legacy / maintenance notes:
- `backend/app/_legacy_main.py` is kept because current startup, routers, and tests still import it directly.
- `backend/app/static/` is kept because legacy static assets are still served from this path.
- `backend/scripts/sanitize_drawio_persisted_state.py` is kept intentionally as maintenance tooling for persisted draw.io cleanup; it is not treated as core runtime.

Operational notes:
- `docker-compose.yml` was tightened to require env values from `.env` instead of relying on misleading built-in credential defaults.
- `.env.example` and `deploy/.env.server.example` are templates only; fill them explicitly before running anything.
- `scripts/dev_up.sh` no longer creates git tags and now fails fast if `.env` is missing.
- Production frontend deploy is now static:
  - `gateway` image builds `frontend/dist` during Docker build
  - nginx serves the built SPA directly and proxies only `/api/` to `api`
  - production no longer depends on Vite dev server / HMR / `:5177` browser runtime requests
  - the old compose-level `frontend` runtime service is no longer part of the production path
- Deployment overlays now live in repo:
  - common baseline: `docker-compose.yml`, `frontend/Dockerfile`, `deploy/nginx/default.conf`
  - prod overlay: `docker-compose.prod.yml`, `.env.prod.example`, `deploy/scripts/deploy_prod.sh`
  - stage overlay: `docker-compose.stage.yml`, `.env.stage.example`, `deploy/scripts/deploy_stage.sh`
  - shared edge overlay: `docker-compose.edge.yml`, `.env.edge.example`, `deploy/edge/nginx/conf.d/*.conf`
- See `deploy/DEPLOY_OVERLAYS.md` for same-server topology, shared edge, and renewal migration notes.

Before first Git push, read `MANIFEST_WORKING_PRODUCT.md`.
