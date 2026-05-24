# Visible Version Proof

## Runtime
- URL: `http://clearvestnic.ru:5180`
- Gateway: `processmap_test-gateway-1`
- Cache-bust param used: `?cb=1778878820`

## Build Info
```json
{
  "branch": "fix/lockfile-sync-test",
  "sha": "a9a9d9c5f468d9da63415306da6d34dcd605aa0d",
  "shaShort": "a9a9d9c",
  "timestamp": "2026-05-15T21:10:36.126Z",
  "contourId": "fix/diagram-visible-version-and-large-canvas-lag-v1",
  "dirty": true,
  "host": "clearvestnic.ru"
}
```

## UI Evidence
Footer text captured at 2026-05-15T21:11Z:
```
Версия v1.0.126 · a9a9d9c · 15.05.2026, 21:10 · Таблица шагов анализа стала строгой: убраны карточные строки, тяжёлые hover-эффекты и агрессивные цветные заливки.
```

- **App version**: `v1.0.126` (from `appVersionInfo.currentVersion`)
- **Short SHA**: `a9a9d9c` (matches `build-info.json` and `git rev-parse --short HEAD`)
- **Timestamp**: `15.05.2026, 21:10` (Russian locale, matches build timestamp)
- **Placement**: Inline with version link in AppShell footer

## Served Assets Match Local Dist
- Served JS: `index-sPUfILOg.js` → matches `frontend/dist/assets/index-sPUfILOg.js`
- Served CSS: `index-N6LiXuk7.css` → matches `frontend/dist/assets/index-N6LiXuk7.css`

## Gate Check
- ✅ Visible without devtools
- ✅ Shows version + SHA + timestamp
- ✅ `/build-info.json` matches
- ✅ Served assets match local dist
