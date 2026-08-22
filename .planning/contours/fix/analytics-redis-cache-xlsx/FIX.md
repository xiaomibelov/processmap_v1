# FIX: analytics-redis-cache-xlsx

## Problems
1. White screen / empty table after switching analytics tabs several times.
2. Analytics data is recomputed on every tab open — no cache.
3. Only CSV export is available; XLSX is required.

## Plan
1. **Diagnose white screen** via smoke test on `clearvestnic.ru:5177`.
2. **Fix white screen**: add loading/error states, AbortController, guard empty rows.
3. **Add Redis cache**: 5-min TTL for analytics endpoints; invalidate on session save/delete.
4. **Add XLSX export**: backend `.xlsx` endpoints + frontend download buttons.
5. **Verify**: build, unit tests, deploy, smoke test (10 open/tab cycles).

## Acceptance
- No white screen after 10 tab switches.
- Cache hit response < 10 ms; invalidated after saveSession.
- XLSX file downloads and opens with Russian headers.
- `npm run build` PASS.
