# Enterprise CI Profile

## Purpose
Enterprise profile runs end-to-end checks for org-scoped flows with strict enterprise routes enabled.

## One-command run
- CI/local wrapper: `scripts/ci_enterprise_e2e.sh`
- Frontend shortcut (when backend is already running):
  - `cd frontend && npm run test:e2e:enterprise`

## What the profile runs
- Baseline:
  - `frontend/e2e/accept-invite-enterprise.spec.mjs`
  - `frontend/e2e/org-switcher.spec.mjs`
  - `frontend/e2e/org-settings-invites-audit.spec.mjs`
  - `frontend/e2e/reports-delete-enterprise.spec.mjs`
- Hybrid critical smoke (always in `scripts/ci_enterprise_e2e.sh`):
  - `frontend/e2e/hybrid-basic-edit-delete-reload.spec.mjs` with `E2E_HYBRID_LAYER=1` and `E2E_HYBRID_GHOST_CHECK=0` (stability mode)
- Draw.io smoke (optional):
  - `frontend/e2e/hybrid-layer-drawio-codec.spec.mjs` when `E2E_DRAWIO_SMOKE=1`

## Bootstrap behavior
`frontend/e2e/helpers/enterpriseBootstrap.mjs` ensures disposable fixture data exists before Playwright starts:
1. Login with `E2E_USER`/`E2E_PASS` (fallback `admin@local`/`admin`)
2. Resolve active org (`/api/auth/me`)
3. Create project (`/api/orgs/{org}/projects`) and session (`/api/orgs/{org}/projects/{project}/sessions`) if `E2E_SESSION_ID` absent
4. Seed one report version via enterprise build endpoint
5. Export env vars for tests: `E2E_ORG_ID`, `E2E_PROJECT_ID`, `E2E_SESSION_ID`, `E2E_PATH_ID`
6. Best-effort cleanup on exit (delete created project)

## Required environment
- `E2E_API_BASE_URL` (default `http://127.0.0.1:18011`)
- `E2E_APP_BASE_URL` (default `http://127.0.0.1:4177`)
- `E2E_USER`, `E2E_PASS` (or `E2E_ADMIN_EMAIL`, `E2E_ADMIN_PASSWORD`)
- Optional fixed scope:
  - `E2E_ORG_ID`
  - `E2E_SESSION_ID`
  - `E2E_PATH_ID` (default `primary`)

## CI secrets checklist
- backend auth credentials for e2e user
- SMTP secrets only required for invite-email integration tests (not required for current mocked enterprise UI e2e)

## Expected green signal
- Playwright result: `4 passed, 0 skipped`
- Hybrid smoke result: `1 passed` (`hybrid-basic-edit-delete-reload`)
- If `reports-delete-enterprise` or hybrid smoke fails, inspect bootstrap stderr and `/tmp/fpc_e2e_enterprise_frontend.log`
