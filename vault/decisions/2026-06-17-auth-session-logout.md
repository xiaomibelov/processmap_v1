# Decision: Fix Constant Session Logout

## Context
Users were constantly kicked out of the app and had to log in again. Server logs showed repeated `refresh_failed: refresh_revoked` from the same public IP, plus occasional `missing_refresh_token`.

## Root causes found
1. **Refresh cookie path mismatch / stale legacy cookie**
   - Active legacy auth endpoints set the `refresh_token` cookie with `Path=/api/auth/`.
   - Newer (dead) `routers/auth.py` and `utils/auth_helpers.py` use `Path=/`.
   - Browsers can end up with two cookies. When the backend deletes the `/api/auth/` cookie on a failed refresh, the `Path=/` cookie (old or duplicate) may remain and keep sending a revoked token → `refresh_revoked` loop.
2. **Non-atomic refresh-token file writes**
   - `backend/app/auth.py` stores refresh-token records in `_auth_refresh_tokens.json`.
   - `_write_list` overwrites the file directly, which can corrupt or lose tokens under concurrent refreshes/multi-tab races.
3. **Misleading build metadata**
   - `frontend/public/build-info.json` was not regenerated on deploy, showing a 3-day-old SHA even though the actual build was current.

## Decision
1. Change legacy `_set_refresh_cookie` / `_clear_refresh_cookie` to use `Path=/`.
2. On every set/clear, also delete the legacy `Path=/api/auth/` cookie to clean up old duplicates.
3. Make `_write_list` atomic: write to `.tmp` then `replace()`.
4. Add `frontend/scripts/generate-build-info.mjs` and call it from `deploy/deploy.sh` so the deployed gateway shows the real SHA/timestamp.

## Rationale
- Root path makes the refresh cookie visible everywhere and avoids duplicate-cookie ambiguity.
- Explicit legacy-cookie cleanup removes stale cookies from existing browsers without forcing users to clear site data.
- Atomic writes remove a race window that could lose rotated tokens.
- Accurate build-info makes it possible to verify what code is actually running in production.

## Verification
- `curl -i /api/auth/login` now returns:
  - `Set-Cookie: refresh_token=...; Path=/; SameSite=lax`
  - `Set-Cookie: refresh_token=""; Max-Age=0; Path=/api/auth/` (legacy cleanup)
- `curl /build-info.json` returns the current deploy SHA and timestamp.
- E2E login + subprocess navigation still passes.
- Relevant backend tests pass:
  - `tests/test_subprocess_navigation.py`
  - `tests/test_bpmn_navigation_helpers.py`
  - `tests/test_auth_jwt_flow.py`
  - `tests/test_auth_users_db_profile_storage.py`

## Deployed
- Commit `282c2ee9` on http://clearvestnic.ru:5177.

## Next steps / follow-up
- Ask affected users to clear site data once more to remove any remaining stale cookies, then log in.
- Monitor backend logs for `refresh_revoked` / `missing_refresh_token` over the next hours.
- Consider moving refresh-token storage from JSON file to Postgres for horizontal scaling.
