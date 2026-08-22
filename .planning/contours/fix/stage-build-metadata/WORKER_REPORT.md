# fix/stage-build-metadata — Executor Report

## Goal
Make stage `/version` and frontend `buildInfo` reflect the actual deployed commit instead of stale values from `.env.stage`.

## Root cause
`deploy-stage.yml` exported `VITE_DEPLOY_*` fingerprint env vars but did not export `BUILD_*` / `VITE_BUILD_*` metadata. The API container picked up whatever was in `.env.stage`, and the frontend container fell back to defaults. This made `/version` report an old commit even though the deployed code was current.

## Fix
Updated `.github/workflows/deploy-stage.yml` to compute and export:
- `BUILD_ID`, `BUILD_BRANCH`, `BUILD_TIME`, `BUILD_ENV=stage` for the API image
- `VITE_BUILD_ID`, `VITE_BUILD_BRANCH`, `VITE_BUILD_TIME`, `VITE_BUILD_ENV=stage` for the frontend image

`docker-compose.yml` already forwards these as `args` to the API and frontend builds, so no compose changes were needed.

## Commits
- `dacf6078` fix(deploy): pass accurate BUILD_* and VITE_BUILD_* metadata to stage api/frontend builds

## PR
- [#419](https://github.com/xiaomibelov/processmap_v1/pull/419)
- Branch: `fix/stage-build-metadata` → `main`
- State: OPEN, awaiting approval

## Safety
- No merge performed.
- No stage/prod deploy triggered.
