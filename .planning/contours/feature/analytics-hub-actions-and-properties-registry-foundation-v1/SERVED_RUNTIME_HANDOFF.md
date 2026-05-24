# SERVED_RUNTIME_HANDOFF

Contour: `feature/analytics-hub-actions-and-properties-registry-foundation-v1`  
Run ID: `20260518T150609Z-73248`  
Written at: `2026-05-18T15:29:09Z`

## Served runtime identity

```json
{
  "branch": "feature/analytics-hub-actions-and-properties-registry-foundation-v1-agent2",
  "sha": "d805e1c64c1107b9e3fe6854e031694bf741b187",
  "shaShort": "d805e1c",
  "timestamp": "2026-05-18T15:24:38.828Z",
  "contourId": "feature/analytics-hub-actions-and-properties-registry-foundation-v1",
  "dirty": true,
  "host": "clearvestnic.ru",
  "sourceWorktree": "/opt/processmap-analytics-foundation-agent2",
  "preparedBy": "manual-agent3-merge-finalizer-after-token-limit",
  "runId": "20260518T150609Z-73248"
}
```

## Verification

- URL: http://clearvestnic.ru:5180/build-info.json
- contourId: feature/analytics-hub-actions-and-properties-registry-foundation-v1
- runId: 20260518T150609Z-73248
- sourceWorktree: /opt/processmap-analytics-foundation-agent2
- branch: feature/analytics-hub-actions-and-properties-registry-foundation-v1-agent2
- sha: d805e1c64c1107b9e3fe6854e031694bf741b187
- preparedBy: manual-agent3-merge-finalizer-after-token-limit

## Serving action

- Built frontend in `/opt/processmap-analytics-foundation-agent2/frontend`.
- Wrote fresh `dist/build-info.json`.
- Copied dist to `/opt/processmap-test/frontend/dist`.
- Restarted `processmap_test-gateway-1` so Docker bind mount points at the current dist directory.
