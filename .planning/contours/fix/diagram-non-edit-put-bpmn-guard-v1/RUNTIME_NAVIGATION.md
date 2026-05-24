# RUNTIME_NAVIGATION — fix/diagram-non-edit-put-bpmn-guard-v1

## Runtime URLs
- **Frontend**: `http://clearvestnic.ru:5180`
- **API**: `http://clearvestnic.ru:8088`
- **API Health**: `http://clearvestnic.ru:8088/health`

## Test Session
- **Preferred session**: `wewe` (`4c515d1c6e`) in project `Описание процессов Долгопрудный` (`b1c8a56b6e`)
- This session was used in previous audit/review contours and has BPMN diagram with overlays.

## How to Open Diagram
1. Open `http://clearvestnic.ru:5180`.
2. Select project `Описание процессов Долгопрудный`.
3. Select session `wewe`.
4. Click "Диаграмма" tab if not already active.

## How to Open XML Tab
1. With session open, click "XML" tab (next to "Диаграмма" / "Анализ").

## How to Open Analysis Tab
1. With session open, click "Анализ" tab.

## How to Show Overlays
1. In Diagram tab, look for overlay toggle (e.g., "Слои" button in toolbar).
2. Click to enable property overlays.
3. Overlays appear as small tables on BPMN elements.

## How to Open Property Sidebar
1. Select a BPMN element (click on it).
2. Look for property panel/sidebar (may appear on right or in modal).
3. If using context menu: right-click element → "Свойства" or similar.

## How to Pan/Zoom
- **Pan**: Click and drag canvas background.
- **Zoom in**: Mouse wheel up or toolbar zoom-in button.
- **Zoom out**: Mouse wheel down or toolbar zoom-out button.

## How to Count Mutation Requests
### Browser DevTools Network Tab
1. Open DevTools → Network.
2. Filter by `Method: PUT` or `Method: PATCH`.
3. Filter by URL contains `/bpmn` or `/sessions`.
4. Clear log before each scenario.
5. Record count after scenario.

### Playwright Interception (preferred for Agent 3)
```js
const mutations = [];
page.on('request', req => {
  const url = req.url();
  const method = req.method();
  if (['PUT', 'PATCH', 'POST'].includes(method) && (url.includes('/bpmn') || url.includes('/sessions'))) {
    mutations.push({ method, url, time: Date.now() });
  }
});
```

## How to Identify PUT/PATCH in Browser Network
- Look for:
  - `PUT http://clearvestnic.ru:8088/api/sessions/{id}/bpmn`
  - `PATCH http://clearvestnic.ru:8088/api/sessions/{id}`
  - Any `POST` to `/bpmn/versions`, `/bpmn/restore`, etc.

## Payload Inspection (safe only)
- For `PUT /bpmn`, inspect request payload keys:
  - `xml` (do NOT print full XML if large; note length/hash only)
  - `source_action` (e.g., `manual_save`, `autosave`, `tab_switch`)
  - `base_diagram_state_version`
- Use `fnv1aHex` or similar to compute hash of XML string if needed.

## How to Verify Explicit Save Path Safely
1. Use a test session that is safe to modify (e.g., `wewe` if it is a test session).
2. Make a minimal explicit edit: double-click a task label, change text, press Enter.
3. Click Save button or press Ctrl+S.
4. Verify `PUT /bpmn` with `source_action: manual_save` appears in Network.
5. If not safe, skip runtime verification and use source-level proof only.

## Network Filters Summary
- `method:PUT` + `/bpmn`
- `method:PATCH` + `/sessions`
- `source_action:manual_save`
- `source_action:publish_manual_save`
- `source_action:restore`
- `source_action:import_bpmn`

## Console Helpers
- Do NOT print full BPMN XML in console.
- Use hash/size only: `console.log("xml len:", xml.length, "hash:", fnv1aHex(xml))`.
