# Network Summary

## On Load
| # | Method | URL | Status |
|---|--------|-----|--------|
| 1 | GET | /api/auth/me | 200 |
| 2 | GET | /api/workspaces | 200 |
| 3 | GET | /api/meta | 200 |
| 4 | GET | /api/note-mentions?limit=20 | 200 |
| 5 | GET | /api/note-notifications?limit=20&include_read=1 | 200 |
| 6 | GET | /api/projects | 200 |
| 7 | GET | /api/explorer?workspace_id=ws_org_default_main | 200 |
| 8 | GET | /api/sessions/4c515d1c6e | 200 |
| 9 | POST | /api/sessions/note-aggregates | 200 |
| 10 | GET | /api/sessions/4c515d1c6e/bpmn?raw=1&include_overlay=0 | 200 |
| 11 | GET | /api/sessions/4c515d1c6e/analysis/product-actions/batch-draft | 200 |
| 12 | POST | /api/sessions/4c515d1c6e/presence | 200 |
| 13 | GET | /api/sessions/4c515d1c6e/bpmn/versions?limit=1 | 200 |
| 14 | GET | /api/sessions/4c515d1c6e/auto-pass/precheck | 200 |

## Versions Head-Check (Background Poll)
| # | Method | URL | When |
|---|--------|-----|------|
| 1 | GET | /api/sessions/4c515d1c6e/bpmn/versions?limit=1 | ~30s after load |
| 2 | GET | /api/sessions/4c515d1c6e/bpmn/versions?limit=1 | ~60s after load |
| 3 | GET | /api/sessions/4c515d1c6e/bpmn/versions?limit=1 | ~90s after load |

Frequency: ~1 call every 30–60 seconds (consistent with ~80% reduction from previous fix).

## Mutation Safety (All Scenarios)
| Scenario | PUT /bpmn | PATCH /sessions | POST /bpmn |
|----------|-----------|-----------------|------------|
| Diagram idle | 0 | 0 | 0 |
| Pan/zoom (5 cycles) | 0 | 0 | 0 |
| Selection (10 clicks) | 0 | 0 | 0 |
| Hover (10 elements) | 0 | 0 | 0 |
| Tab switch Analysis↔Diagram | 0 | 0 | 0 |
| Tab switch XML↔Diagram | 0 | 0 | 0 |

## Failed Requests
| # | Method | URL | Status | Notes |
|---|--------|-----|--------|-------|
| 1 | GET | /api/auth/me | 401 | Pre-existing auth init race |
| 2 | POST | /api/sessions/4c515d1c6e/presence | 401 | Pre-existing auth init race |
