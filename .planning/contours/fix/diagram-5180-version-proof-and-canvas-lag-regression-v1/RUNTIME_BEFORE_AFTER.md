# RUNTIME_BEFORE_AFTER.md

## Before (Prior to This Contour)

| Metric | Value |
|--------|-------|
| Delivery method | `docker cp` (inferred, stale assets) |
| Stale assets in container | 40 files, 7+ duplicate chunks |
| Build marker on 5180 | None |
| Runtime version traceability | None |
| `index.html` asset ref | Could mismatch local dist |

## After (This Contour)

| Metric | Value |
|--------|-------|
| Delivery method | Bind volume `./frontend/dist:/usr/share/nginx/html:ro` |
| Stale assets in container | 0 (host dist shadows image files) |
| Build marker on 5180 | `build-info.json` + UI badge |
| Runtime version traceability | SHA + timestamp + contourId |
| `index.html` asset ref | Always matches local dist |

## Playwright Evidence (Fresh Context)

### Cold Open
- URL: `http://clearvestnic.ru:5180/?cb=<timestamp>`
- `window.__PROCESSMAP_BUILD_INFO__` present: ✅
- `build-info.json` curl: ✅
- No console errors (except pre-auth 401): ✅

### Tab Switch (Diagram ↔ Interview)
- `.djs-container` count: 1 (stable) ✅
- `svg` count: 38 (stable) ✅
- Skeleton flashes: 0 ✅
- No canvas disappearance/reappearance: ✅

### DOM Stability
| Check | Diagram Tab | Interview Tab | Back to Diagram |
|-------|-------------|---------------|-----------------|
| `.djs-container` | 1 | 1 | 1 |
| `svg` | 38 | 38 | 38 |
| `.bpmnCanvas` | 2 | 2 | 2 |
| skeleton | 0 | 0 | 0 |

## Network Safety
- 0 PUT `/bpmn` from view interactions
- 0 PATCH `/sessions` from view interactions
- `versions?limit=1`: pre-existing background polls
