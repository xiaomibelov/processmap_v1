# RUNTIME_NAVIGATION — clearvestnic.ru:5180

## Test Runtime URLs
- **Main app**: `http://clearvestnic.ru:5180`
- **Health check**: `http://clearvestnic.ru:8088/health`
- **Cache-busted URL**: `http://clearvestnic.ru:5180/?cb=<unix_timestamp>`
- **Build info (after Agent 2 implements)**: `http://clearvestnic.ru:5180/build-info.json`

## Known Baseline Session
- **Session**: `wewe` (`4c515d1c6e`)
- **Project**: `Описание процессов Долгопрудный` (`b1c8a56b6e`)
- **Overlays**: OFF (`include_overlay=0`)

## Docker Services
```
processmap_test-gateway-1    → 0.0.0.0:5180->80/tcp
processmap_test-frontend-1   → 5177/tcp (dev server, NOT exposed externally)
processmap_test-api-1        → 0.0.0.0:8088->8000/tcp
processmap_test-postgres-1   → 0.0.0.0:5433->5432/tcp
processmap_test-redis-1      → 0.0.0.0:6380->6379/tcp
```

## Gateway Configuration
- Nginx root: `/usr/share/nginx/html`
- `index.html`: `Cache-Control: no-cache, no-store, must-revalidate`
- `/assets/`: `Cache-Control: public, max-age=31536000, immutable`
- API proxy: `/api/` → `api:8000`

## Delivery Loop Notes
- Gateway image: `processmap_test-gateway:latest`
- Gateway container created: 2026-05-14T21:57:42Z
- Image built: 2026-05-14 21:51:16 +0000 UTC
- **Current delivery method is INFORMAL**: files inside running container have timestamps from May 15 (10:41–19:09) despite container being created May 14. No volume mount for `/usr/share/nginx/html`. Strong evidence of `docker cp` usage.
- Local `frontend/dist` built at 2026-05-15 19:22.
- Current served assets match local dist by hash, but method is fragile.

## Auth
- Playwright auth has failed in previous contours (401 on `/api/auth/me`).
- May require manual token injection via `localStorage.setItem('fpc_auth_access_token', ...)`.
- Dev admin credentials may be needed.

## Previous Runtime Evidence
| Metric | Value |
|--------|-------|
| Idle DOM | 8,025 |
| Idle SVG | 2,392 |
| `.djs-container` | 1 |
| `.bpmnCanvas` | 2 |
| `.djs-overlay` | 17 |
| Cold open canvas | ~3.7s |
| Cold open ready | ~4.0s |
| Tab switch | ~2.2–3.5s (regression) |
