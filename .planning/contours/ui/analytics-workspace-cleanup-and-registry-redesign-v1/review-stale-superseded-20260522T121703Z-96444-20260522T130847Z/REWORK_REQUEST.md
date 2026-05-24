# REWORK_REQUEST

Contour: `ui/analytics-workspace-cleanup-and-registry-redesign-v1`
Run ID: `20260522T121703Z-96444`
Source: `REVIEW_BLOCKED.md`
Generated: 2026-05-22T13:00:54Z

Agent 4 blocked review for the current run. Agent 3 must resolve the blocker as a rework task, then recreate `READY_FOR_REVIEW` and `EXECUTION_RUN_ID` for this same run.

Read the archived blocker details from `REVIEW_BLOCKED.current.md` when present. If the blocker is not fixable by Agent 3 within the contour scope, write an updated `EXEC_REPORT.md` and `RUNTIME_SERVE_BLOCKED.md` explaining the exact handoff required, then do not claim review readiness.

## Blocker

# REVIEW_BLOCKED

**Contour:** `ui/analytics-workspace-cleanup-and-registry-redesign-v1`  
**Run ID:** `20260522T121703Z-96444`  
**Reviewer:** Agent 4  
**Blocked at:** 2026-05-22T12:50:00Z

## Reason

Runtime `intended != served` per AGENTS.md §3.

- Frontend runtime serves stale JS bundle (`index-CUXm-1rq.js`) instead of fresh build (`index-aBR19OK7.js`).
- Backend runtime returns 404 for new GET `/api/analysis/product-actions/registry` endpoint.
- Docker containers were not rebuilt/restarted after code changes.
- Visual verification cannot be performed on stale code.

## Source issue requiring fix before redeploy

- `formatRowDate` in `ProductActionsRegistryPanel.jsx` does not parse ISO date strings; table shows raw timestamps.

## Unblock condition

1. Fix `formatRowDate` ISO parsing.
2. Rebuild frontend (`npm run build`).
3. Deploy to runtime (`docker compose build api frontend && docker compose up -d`).
4. Confirm `:5180` serves fresh bundle and GET endpoint returns 200.
5. Re-submit for Agent 4 review.
