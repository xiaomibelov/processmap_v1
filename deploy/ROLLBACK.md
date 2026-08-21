# Rollback Checklist

1. Identify the previous known-good Git tag or commit.
2. If the release changed data shape or migrations, take a Postgres backup before rollback.
3. Checkout the rollback ref:
   - `git fetch --tags --all`
   - `git checkout <previous-tag-or-commit>`
4. Restore the matching `.env` if it changed.
5. Rebuild and restart:
   - `deploy/scripts/server_update.sh <previous-tag-or-commit>`
6. Run `deploy/scripts/server_smoke.sh`.
7. If runtime data is incompatible, restore the Postgres backup and restart the stack again.
8. Re-check:
   - `/api/health`
   - login
   - org/workspace listing
   - invite resolve boundary
   - selected draw.io manual smoke

Known note:
- The draw.io re-enter fix is code-present but browser-proof is still partially blocked by the current e2e session-open harness. Do not use that single item as the sole rollback trigger. Use the broader smoke suite plus targeted manual draw.io re-enter check.
