# RUNTIME_NAVIGATION.md

## Runtime URLs

- Frontend: `http://clearvestnic.ru:5180`
- API: `http://clearvestnic.ru:8088`
- API Health: `http://clearvestnic.ru:8088/health`

## Session

From previous audit, session `wewe` is known to have a BPMN diagram. Any session with BPMN can be used.

## How to Open Diagram

1. Navigate to `http://clearvestnic.ru:5180`.
2. Open a project/session that has BPMN.
3. The Diagram tab should be the default active tab for BPMN-enabled sessions.

## How to Open History Modal

1. With Diagram open, look for the version/history button in the diagram toolbar or top bar.
2. The button is typically labeled with the current version number or "Версия пока не создана".
3. Click to open the BPMN history / versions modal.
4. In `ProcessStage.jsx`, this sets `versionsOpen = true` via `setVersionsOpen`.

## How to Close History Modal

1. Click the close button or backdrop of the history modal.
2. In `ProcessStage.jsx`, this sets `versionsOpen = false`.

## How to Count Requests

### Browser DevTools
1. Open DevTools → Network tab.
2. Filter URL by `bpmn/versions`.
3. Look specifically for:
   - `GET /api/sessions/{id}/bpmn/versions?limit=1` (head-check)
   - `GET /api/sessions/{id}/bpmn/versions` (full list for history modal)
4. Clear the Network log before each scenario.
5. Count requests over the observation window (10–30s).

### Playwright / Programmatic
```javascript
const requests = [];
page.on('request', req => {
  const url = req.url();
  if (url.includes('/bpmn/versions')) {
    requests.push({ url, method: req.method(), time: Date.now() });
  }
});
```

## How to Run Tab Cycle

1. Ensure Diagram tab is open.
2. Click "Analysis" tab.
3. Click "Diagram" tab.
4. Click "XML" tab (if available).
5. Click "Diagram" tab again.
6. Count `bpmn/versions?limit=1` requests during the entire cycle.

## How to Check Overlays Still Work

1. With Diagram open, enable property overlays (usually via a toolbar toggle or layer panel).
2. Verify colored property pills/labels appear on BPMN elements.
3. Run in console:
   ```javascript
   document.querySelectorAll('.fpcPropertyOverlay').length
   ```
4. Expected: non-zero count when overlays are ON; 0 when OFF.
5. Pan/zoom and verify count stays stable (no duplication).

## Network Request Filter Reference

Watch for these patterns:
- `/bpmn/versions`
- `limit=1`
- `/sessions/` (general session sync)
- `/bpmn` (BPMN load/save)
- `PUT` (any mutation)
- `PATCH` (any mutation)

## Scenarios Reference

| Scenario | Steps | Expected After Fix |
|----------|-------|-------------------|
| A — Diagram idle | Open Diagram, wait 30s | `versions?limit=1` = 0 or 1 |
| B — Overlays + pan/zoom | Enable overlays, interact | `versions?limit=1` = 0 |
| C — Tab switch | Diagram ↔ Analysis ↔ XML | `versions?limit=1` = 0 |
| D — History modal | Open modal, load, close | Full list loads; closed = no poll |
| E — Save/publish safety | Save or check version badge | Badge state correct; no extra PUT |
