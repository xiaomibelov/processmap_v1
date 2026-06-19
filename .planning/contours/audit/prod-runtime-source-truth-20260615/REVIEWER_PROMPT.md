# REVIEWER PROMPT — Prod runtime/source truth alignment

**Contour:** `audit/prod-runtime-source-truth-20260615`

## Scope
Review the retroactive alignment of production ProcessMap with git `origin/main`.

## Checklist
1. Confirm `new-origin/main` points to `38d4b3664e4de30733cc454fb6e006cce75d7eb5`.
2. Confirm `http://clearvestnic.ru:5177/version` and `http://clearvestnic.ru:8011/version` return `38d4b366`.
3. Confirm `processmap_v1-api-1` and `processmap_v1-gateway-1` are healthy.
4. Verify no deprecated containers are still running or exposing ports.
5. Verify `.env` changes are only build metadata (`BUILD_ID`, `BUILD_TIME`, `BUILD_BRANCH`).
6. Flag the stale `build-info.json` and decide if a follow-up fix is needed.
7. Confirm the merge commit `38d4b366` correctly combines `24c529c6` (PR #388) and `5337b733` (auth fix).

## Deliverable
- `REVIEW_REPORT.md` in this contour directory, or `REVIEW_PASS` marker if no issues.
