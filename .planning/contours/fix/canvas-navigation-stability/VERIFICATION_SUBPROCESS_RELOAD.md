# Subprocess navigation cache — verification

**Stand:** http://clearvestnic.ru:5177  
**Build:** `54f4282f` `fix/canvas-navigation-stability`  
**Date:** 2026-06-23  

## Scenario

1. Login as `admin@local`.
2. Open project `E2E save session 1781857825494_r1dyro`.
3. Open root session `0c90172fbc` (contains collapsed `SubProcess_1`).
4. Right-click `SubProcess_1` → **Перейти в подпроцесс**.
5. Click **← Назад** to return to the parent session.

## Network log (after clicking back)

```json
[
  { "method": "POST",   "url": "/api/sessions/e789a0e846/return" },
  { "method": "DELETE", "url": "/api/sessions/e789a0e846/presence" },
  { "method": "POST",   "url": "/api/sessions/0c90172fbc/presence" },
  { "method": "GET",    "url": "/api/sessions/0c90172fbc/bpmn/versions?limit=1" },
  { "method": "GET",    "url": "/api/sessions/0c90172fbc/auto-pass/precheck" },
  { "method": "GET",    "url": "/api/sessions/0c90172fbc/bpmn/versions?limit=1" },
  { "method": "GET",    "url": "/api/sessions/0c90172fbc/note-threads" },
  { "method": "GET",    "url": "/api/sessions/0c90172fbc/bpmn/versions?limit=1" }
]
```

- `GET /api/sessions/{sid}` count: **0**
- `GET /api/sessions/{sid}/bpmn` (raw XML) count: **0**
- Metadata calls (`/bpmn/versions`, `/presence`, `/auto-pass/precheck`, `/note-threads`) still occur as expected.

## Breadcrumbs

- After drill-in: `E2E save session 1781857825494_r1dyro > Подпроцесс: SubProcess_1`
- After return: `E2E save session 1781857825494_r1dyro`

## Result

PASS — returning from a subprocess no longer fetches the parent BPMN XML; the cached XML is reused and the breadcrumb stack is updated client-side.
