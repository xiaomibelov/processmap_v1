# Network Baseline Evidence

## Scenario A — Initial Load

| # | Method | Endpoint | Status |
|---|--------|----------|--------|
| 4 | GET | `/api/auth/me` | 200 |
| 5 | GET | `/api/workspaces` | 200 |
| 6 | GET | `/api/meta` | 200 |
| 7 | GET | `/api/note-mentions?limit=20` | 200 |
| 8 | GET | `/api/note-notifications?limit=20&include_read=1` | 200 |
| 10 | GET | `/api/projects` | 200 |
| 11 | GET | `/api/explorer?workspace_id=ws_org_default_main` | 200 |
| 12 | GET | `/api/projects/b1c8a56b6e/sessions?view=summary` | 200 |
| 13 | GET | `/api/projects/b1c8a56b6e/explorer?workspace_id=ws_org_default_main` | 200 |
| 14 | POST | `/api/sessions/note-aggregates` | 200 |
| 15 | GET | `/api/sessions/4c515d1c6e` | 200 |
| 16 | GET | `/api/sessions/4c515d1c6e/bpmn?raw=1&include_overlay=0&_ts=...` | 200 |
| 17 | GET | `/api/sessions/4c515d1c6e/analysis/product-actions/batch-draft` | 200 |
| 18 | POST | `/api/sessions/4c515d1c6e/presence` | 200 |
| 19 | GET | `/api/sessions/4c515d1c6e/bpmn/versions?limit=1` | 200 |
| 20 | GET | `/api/sessions/4c515d1c6e/auto-pass/precheck` | 200 |

## Duplicate Requests — Critical Finding

**Endpoint**: `GET /api/sessions/4c515d1c6e/bpmn/versions?limit=1`

This endpoint was called **26 times** during a ~3-minute observation period with only a few user interactions (tab switches, overlay toggle, zoom/pan). The user **never opened the BPMN history/version UI**.

Duplicate call sequence (selected):
- 19, 21, 24, 25, 26, 27, 28 (initial load)
- 30, 31, 32, 33, 34, 35 (after tab switch)
- 37, 38, 39, 40, 41, 42 (after another tab switch)
- 43, 44, 45, 47, 49, 50, 51, 52, 53, 54, 55 (after reload with overlays)

**Impact**: Each call is a headers-only request, but 26× dedupe miss creates unnecessary server load and blocks the main thread with network I/O.

## Aborted / Cancel-Race Requests

| # | Method | Endpoint | Status |
|---|--------|----------|--------|
| 2 | DELETE | `/api/sessions/4c515d1c6e/presence` | ERR_ABORTED |
| 3 | PUT | `/api/sessions/4c515d1c6e/bpmn` | ERR_ABORTED |
| 4 | DELETE | `/api/sessions/4c515d1c6e/presence` | ERR_ABORTED |
| 5 | DELETE | `/api/sessions/4c515d1c6e/presence` | ERR_ABORTED |
| 6 | PUT | `/api/sessions/4c515d1c6e/bpmn` | ERR_ABORTED |
| 7 | DELETE | `/api/sessions/4c515d1c6e/presence` | ERR_ABORTED |

These aborted requests suggest request cancellation races (likely from `useEffect` cleanup or rapid tab switches).

## Mutation Without Explicit Save

| # | Method | Endpoint | Status | Context |
|---|--------|----------|--------|---------|
| 46 | PUT | `/api/sessions/4c515d1c6e/bpmn` | 200 | Triggered without user pressing Save; possibly autosave or overlay-enable side effect |
