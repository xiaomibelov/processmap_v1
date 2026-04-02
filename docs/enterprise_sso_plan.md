# Enterprise SSO Plan (OIDC, deferred)

## Why deferred in Step 4
Step 4 focused on production hardening without changing the auth stack. OIDC integration requires additional callback/session hardening and IdP integration testing.

## Target (Step 5)
- Optional OIDC flow behind `OIDC_ENABLED=1`
- Endpoints:
  - `GET /api/auth/oidc/start`
  - `GET /api/auth/oidc/callback`
- Config:
  - `OIDC_ISSUER`
  - `OIDC_CLIENT_ID`
  - `OIDC_CLIENT_SECRET`
  - `OIDC_REDIRECT_URL`

## Integration Strategy
1. Start endpoint builds nonce+state, stores short-lived auth transaction in server-side store.
2. Callback validates state/nonce, exchanges code for token at IdP.
3. Extract email claim and map to auth-store user.
4. If user missing:
   - either reject
   - or create user when `OIDC_AUTO_PROVISION=1`.
5. Issue existing app JWT access/refresh tokens; keep legacy login endpoint operational.

## Required Security Controls
- Strict state and nonce validation
- PKCE (if supported)
- signature and issuer/audience checks
- replay protection for callback state
- no ID token logging

## Test Gates
- unit tests for state/nonce lifecycle
- integration tests with mocked OIDC provider
- e2e: `/api/auth/oidc/start -> callback -> /api/auth/me` with org context preserved
