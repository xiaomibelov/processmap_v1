# Version Update Ledger Proof

## Contour
- **ID**: `fix/diagram-drag-lag-gsd-review-version-ledger-rework-v1`
- **Run ID**: `20260515T231647Z-58762`

---

## B1 — Version Bump

### `frontend/src/config/appVersion.js`
- `currentVersion`: changed from `"v1.0.126"` to `"v1.0.127"`
- Added new changelog entry at index 0:
  ```js
  {
    version: "v1.0.127",
    changes: [
      "Добавлена Reviewer GSD-дисциплина: review обязан проверять реальный drag и runtime truth.",
      "Исправлена версионность: обновления теперь добавляют новую строку в журнал изменений.",
      "Переработана производительность drag диаграммы: убраны side-effects во время pointermove.",
      "Убран read-only по умолчанию: редактирование диаграммы стало доступно без дополнительного переключателя.",
    ],
  }
  ```

## B2 — Build-info Generator

### `scripts/generate-build-info.mjs`
- Changed fallback `contourId` from `fix/diagram-real-drag-performance-and-engine-decomposition-v1` to `fix/diagram-drag-lag-gsd-review-version-ledger-rework-v1`.

## B3 — Rebuild / Restart

```bash
cd /opt/processmap-test/frontend && npm run build
# built in 27.97s, 0 errors
docker restart processmap_test-gateway-1
```

## B4 — Verification

### build-info.json
```json
{
  "branch": "fix/lockfile-sync-test",
  "sha": "a9a9d9c5f468d9da63415306da6d34dcd605aa0d",
  "shaShort": "a9a9d9c",
  "timestamp": "2026-05-15T23:38:08.819Z",
  "contourId": "fix/diagram-drag-lag-gsd-review-version-ledger-rework-v1",
  "dirty": true,
  "host": "clearvestnic.ru"
}
```

### Footer Version Line
`Версия v1.0.127 · a9a9d9c · 15.05.2026, 23:38 · fix/diagram-drag-lag-gsd-review-version-ledger-rework-v1 · Добавлена Reviewer GSD-дисциплина: review обязан проверять реальный drag и runtime truth.`

### Served JS Asset Hash
- Previous: `assets/index-YoZu_dwp.js`
- Current: `assets/index-BzQtJOUC.js`
- Hash changed, proving fresh build.

### `window.__PROCESSMAP_BUILD_INFO__`
Matches build-info.json exactly.

---

## Status
✅ Version bump, build-info update, rebuild, and verification complete.
