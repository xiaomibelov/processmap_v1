# PLAN: stage-freshness-fingerprint-build

## Context

This contour is a follow-up to `fix/stage-freshness-fingerprint-path` (#396).
PR #396 moved the stage deploy fingerprint file from `frontend/.stage-deploy-fingerprint.json` to `/tmp/` to prevent `verify-chain` from failing when the file was erased by git operations or cleanup traps.

## Problem after #396

Stage deployment started failing at `verify-chain` with:

```
[stage-freshness] ERROR: built bundle missing expected value: processmap-stage-deploy-sha:...
```

Root cause: the gateway image is built with docker context `./frontend` (`frontend/Dockerfile.prod`). The fingerprint file in `/tmp/` is outside that context, so Vite could not read it during the build. As a result, the produced JS bundle did not contain the deploy fingerprint, and `verify-chain` could not find it inside the running gateway container.

## Solution

Pass the deploy fingerprint into the gateway build via environment variables:

- `VITE_DEPLOY_FINGERPRINT`
- `VITE_DEPLOY_REQUESTED_REF`
- `VITE_DEPLOY_RESOLVED_SHA`

Changes:
- `frontend/vite.config.js` — prefers env vars, falls back to JSON file.
- `frontend/Dockerfile.prod` — accepts new `ARG`s and exports them as `ENV`.
- `docker-compose.yml` — forwards new env vars into gateway build args.
- `.github/workflows/deploy-stage.yml` and `.github/workflows/deploy-stage-ref.yml` — export the env vars before `docker compose build`.

## Files changed

- `frontend/vite.config.js`
- `frontend/Dockerfile.prod`
- `docker-compose.yml`
- `.github/workflows/deploy-stage.yml`
- `.github/workflows/deploy-stage-ref.yml`

## Verification

Local build:

```bash
cd frontend
VITE_DEPLOY_FINGERPRINT="processmap-stage-deploy-sha:test" \
VITE_DEPLOY_REQUESTED_REF="main" \
VITE_DEPLOY_RESOLVED_SHA="test" \
  npm run build
grep -l "processmap-stage-deploy-sha:test" dist/assets/index-*.js
```

Result: the fingerprint is present in the built JS chunks and in the stage-deploy banner.

## Status

- Branch pushed: `fix/stage-freshness-fingerprint-build`
- PR opened: #397
- Awaiting review/merge approval.
