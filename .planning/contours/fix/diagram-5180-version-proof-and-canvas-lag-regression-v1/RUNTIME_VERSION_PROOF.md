# RUNTIME_VERSION_PROOF.md

## Build Marker Implementation

### Files Created
- `scripts/generate-build-info.mjs` — Node script that reads git metadata and writes build info
- `frontend/src/generated/buildInfo.js` — ES module imported by AppShell
- `frontend/public/build-info.json` — Static JSON served by nginx

### Build Info Content
```json
{
  "branch": "fix/lockfile-sync-test",
  "sha": "a9a9d9c5f468d9da63415306da6d34dcd605aa0d",
  "shaShort": "a9a9d9c",
  "timestamp": "2026-05-15T19:50:10.779Z",
  "contourId": "fix/diagram-5180-version-proof-and-canvas-lag-regression-v1",
  "dirty": true,
  "host": "clearvestnic.ru"
}
```

## curl Proof

```bash
$ curl -s http://clearvestnic.ru:5180/build-info.json
```
Returns the JSON above with SHA matching `git rev-parse HEAD`.

## Browser Proof (Playwright fresh context)

- Navigated to `http://clearvestnic.ru:5180/?cb=<timestamp>`
- `window.__PROCESSMAP_BUILD_INFO__.sha` = `a9a9d9c5f468d9da63415306da6d34dcd605aa0d` ✅
- UI badge visible: `a9a9d9c | 2026-05-15T19:50:10.779Z` ✅
- Badge only visible because host = `clearvestnic.ru:5180` ✅

## Served Asset Proof

| Asset | Local dist | Served (5180) | Match |
|-------|------------|---------------|-------|
| `index.html` | md5 `a17e255f70aa6c2cc120de444028c267` | md5 `a17e255f70aa6c2cc120de444028c267` | ✅ |
| `index-C3iZm5bo.js` | present | present | ✅ |
| `index-N6LiXuk7.css` | present | present | ✅ |
| `build-info.json` | present | present | ✅ |

## Container State

- Gateway: `processmap_test-gateway-1` (recreated with bind volume at 2026-05-15T19:48:XX)
- Port: `0.0.0.0:5180->80/tcp`
- Volume: `./frontend/dist:/usr/share/nginx/html:ro`
