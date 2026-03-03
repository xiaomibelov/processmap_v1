# Enterprise Prod Ops (Step 5)

## Scope
This document describes production hardening controls available after Step 5:
- invite delivery via SMTP email
- invite TTL enforcement and cleanup
- audit retention cleanup
- lightweight in-memory rate limits
- config sanity checks for email mode
- enterprise e2e bootstrap and CI profile

## Environment Variables

### Invite Email Delivery
- `INVITE_EMAIL_ENABLED` (`0|1`, default `0`)
- `INVITE_TTL_HOURS` (default `72`)
- `APP_BASE_URL` (required when `INVITE_EMAIL_ENABLED=1`)
- `SMTP_HOST` (required when `INVITE_EMAIL_ENABLED=1`)
- `SMTP_PORT` (default `587`, required in email mode)
- `SMTP_USER` (optional)
- `SMTP_PASS` (optional, secret)
- `SMTP_FROM` (required when `INVITE_EMAIL_ENABLED=1`)
- `SMTP_TLS` (`true|false`, default `true`)

### Retention
- `AUDIT_RETENTION_DAYS` (default `90`)
- `INVITE_CLEANUP_KEEP_DAYS` (default `30`)

### Rate Limits (per process, in-memory)
- `RL_LOGIN_PER_MIN` (default `30`)
- `RL_INVITES_PER_MIN` (default `20`)
- `RL_ACCEPT_PER_MIN` (default `30`)

## Endpoint Behavior

### Invite Create
`POST /api/orgs/{org_id}/invites`
- Email mode (`INVITE_EMAIL_ENABLED=1`):
  - returns invite record without token/link
  - sends email with link `${APP_BASE_URL}/accept-invite?token=<raw_token>`
  - if SMTP/config fails: returns strict enterprise error (`503` for config unavailable, `502` for send failure)
  - failed send does not keep orphan invite row
- Dev mode (`INVITE_EMAIL_ENABLED=0`):
  - returns token/link for manual testing/admin workflows

### Invite Accept
- `POST /api/orgs/{org_id}/invites/accept`
- `POST /api/invites/accept` (token-only flow for emailed links)
- Expired invite -> `410 Gone`
- Email mismatch / already accepted -> `409`
- Not found / revoked -> `404`

### Cleanup
- `POST /api/orgs/{org_id}/invites/cleanup?keep_days=N`
- `POST /api/orgs/{org_id}/audit/cleanup?retention_days=N`
- Both are org-scoped and role-gated (`org_owner|org_admin`)

## Security Notes
- Raw invite token is never persisted in DB (hash only)
- Raw invite token and `SMTP_PASS` must not be logged
- Audit meta for invite create/accept omits raw token

## Deployment Checklist
1. Configure SMTP and set `INVITE_EMAIL_ENABLED=1`.
2. Set `APP_BASE_URL` to externally reachable HTTPS URL.
3. Set rate limits for expected load profile.
4. Verify `/accept-invite?token=...` flow in staging.
5. Verify retention cleanup endpoints with admin account.
6. Verify enterprise e2e bootstrap creates disposable project/session and report seed:
   - helper: `frontend/e2e/helpers/enterpriseBootstrap.mjs`
   - script auto-exports `E2E_ORG_ID`, `E2E_PROJECT_ID`, `E2E_SESSION_ID`
7. Confirm enterprise e2e profile:
   - `E2E_ENTERPRISE=1`
   - `E2E_ORG_SWITCH=1`
   - `E2E_REPORTS_DELETE=1`
   - run `scripts/e2e_enterprise.sh` (or `frontend npm run test:e2e:enterprise`)
8. Confirm CI command:
   - `scripts/ci_enterprise_e2e.sh`
   - expected result: `4 passed, 0 skipped`

## Operational Gaps (post Step 5)
- MFA and stronger auth hardening
- SCIM/IdP lifecycle provisioning
- advanced audit export/archival pipeline
- distributed rate limiting (Redis or gateway-level)
