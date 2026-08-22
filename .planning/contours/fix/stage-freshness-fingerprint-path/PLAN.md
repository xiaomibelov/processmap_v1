# PLAN: stage-freshness-fingerprint-path

## Problem

Stage deployment failed at `verify-chain` with:

```
source fingerprint file does not exist: frontend/.stage-deploy-fingerprint.json
```

Root causes:
- The fingerprint file was created inside the git-controlled `frontend/` directory.
- It was untracked, so any `git checkout -f -- frontend`, `git clean`, or the `trap cleanup_freshness_source EXIT` could delete it before `verify-chain`.
- The `trap cleanup EXIT` removed the file on any script exit, making post-mortem diagnosis harder.

After moving the file to `/tmp/`, a second failure appeared:

```
[stage-freshness] ERROR: built bundle missing expected value: processmap-stage-deploy-sha:...
```

The gateway image build (`frontend/Dockerfile.prod`) did not receive the fingerprint because it was no longer in the build context.

## Solution

1. Move the fingerprint file outside the repository to `/tmp/processmap-stage-deploy-fingerprint-<ref>-<sha>.json` for `verify-chain` stability.
2. Remove `trap cleanup_freshness_source EXIT` from the workflow before `verify-chain`; clean up only after success.
3. Pass the deploy fingerprint into the gateway build via environment variables:
   - `VITE_DEPLOY_FINGERPRINT`
   - `VITE_DEPLOY_REQUESTED_REF`
   - `VITE_DEPLOY_RESOLVED_SHA`
4. Update `frontend/vite.config.js` to prefer these env vars and fall back to the JSON file.
5. Update `frontend/Dockerfile.prod` and `docker-compose.yml` to accept and forward the new args/env vars.

## Files changed

- `deploy/scripts/stage_freshness_proof.sh`
- `.github/workflows/deploy-stage.yml`
- `.github/workflows/deploy-stage-ref.yml`
- `frontend/vite.config.js`
- `frontend/Dockerfile.prod`
- `docker-compose.yml`

## Verification

1. Manual `prepare-source` → `verify-chain` run passes with `/tmp/` fingerprint file.
2. Local frontend build with `VITE_DEPLOY_FINGERPRINT=...` produces bundles containing the fingerprint and the stage-deploy banner.

```bash
cd frontend
VITE_DEPLOY_FINGERPRINT="processmap-stage-deploy-sha:test" \
VITE_DEPLOY_REQUESTED_REF="main" \
VITE_DEPLOY_RESOLVED_SHA="test" \
  npm run build
grep -l "processmap-stage-deploy-sha:test" dist/assets/index-*.js
```

## Status

- Branch pushed: `fix/stage-freshness-fingerprint-path` → `new-origin` (HEAD `13289588`)
- Previous PR #396 was merged into `main` with the first commit (`eec051ce` — move fingerprint to `/tmp/`).
- A follow-up commit (`13289588` — pass deploy fingerprint to gateway build via env vars) remains on the branch and requires a new PR.
- New PR creation is currently blocked: `gh` CLI is not authenticated and no `GITHUB_TOKEN`/`GH_TOKEN` is available in the environment.
- Awaiting review/merge approval once the PR is created.
