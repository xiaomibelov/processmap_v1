# fix/prod-deploy-pipeline — Executor Report

## Goal
Fix the prod deploy pipeline so every deploy:
- rebuilds the gateway with fresh build metadata,
- bakes a fingerprint into the JS bundle,
- proves freshness after deploy,
- keeps the gateway attached to both `app_default` (prod API) and `processmap_edge_net` (stage reverse proxy).

## Commits
- `2593bc52` chore(deploy): remove stale build-info.json from git, generate at build time
- `91ac864c` feat(deploy): add VITE_BUILD_* and VITE_DEPLOY_* args to prod gateway Dockerfile
- `2eb9f33e` feat(deploy): add SHA/ref fingerprint and post-deploy freshness proof to prod pipeline
- `20cb5160` fix(deploy): add default network to prod gateway compose

## Files changed
- `.gitignore` — ignore `frontend/public/build-info.json`
- `frontend/public/build-info.json` — removed from git index
- `Dockerfile.gateway.prod` — added ARG/ENV for build/deploy metadata
- `.github/workflows/deploy-prod.yml` — resolves SHA/ref/time, passes build-args to gateway build, post-deploy freshness proof
- `docker-compose.prod.gateway.yml` — added `default` network alongside `processmap_edge_net`

## Push / PR
- Branch pushed: `fix/prod-deploy-pipeline` → `new-origin`
- PR: [#418](https://github.com/xiaomibelov/processmap_v1/pull/418)
- Base: `main`
- State: OPEN

## Safety
- No merge performed.
- No prod deploy triggered.
- Awaiting explicit user approve before merging.
