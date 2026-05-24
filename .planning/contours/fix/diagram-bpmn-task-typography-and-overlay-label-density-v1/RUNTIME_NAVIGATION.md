# RUNTIME_NAVIGATION — fix/diagram-bpmn-task-typography-and-overlay-label-density-v1

## Target Runtime
- **URL:** `http://clearvestnic.ru:5180`
- **Health API:** `http://clearvestnic.ru:8088/health`
- **Build Info:** `http://clearvestnic.ru:5180/build-info.json`

## How to Open Fresh Context
1. Navigate to `http://clearvestnic.ru:5180/?cb=<unix_timestamp>`
2. Wait for app shell to load.
3. Verify footer shows **Версия v1.0.134** (after Agent 2 build).

## How to Open Diagram Session
1. From Explorer, open project **wewe** / "Описание процессов Долгопрудный".
2. Open session (or create if none).
3. Switch to **Diagram** tab.
4. Wait for BPMN canvas to fully render.

## Overlay Toggle
- If available in UI: toggle **Слои** ON / OFF.
- For baseline: test with **OFF** (cleanest task typography view).
- For chip density: test with **ON** (if property overlays are present).

## How to Inspect Task Label
1. Open DevTools → Elements.
2. Find a task shape: `.djs-shape[data-element-id^="Activity"]`.
3. Inside it, locate `.djs-label` or `<text>` element.
4. In Computed tab, record:
   - `font-weight`
   - `font-size`
   - `fill`
   - `stroke`
   - `paint-order`
   - `text-shadow`
   - `filter`

## How to Test Interaction Mode
1. Hold left mouse button on empty canvas area.
2. Drag pointer ~30px.
3. Observe `.fpcDiagramInteracting` class on `.djs-container` (DevTools).
4. Record computed styles for task label **while dragging**.
5. Release mouse.
6. Record computed styles **after pointerup**.
7. Verify no flash, no style jump.

## Network Safety Check
- Open DevTools → Network.
- Filter by `Fetch/XHR`.
- During canvas pan, verify:
  - No `PUT` to `/bpmn`
  - No `PATCH` to `/sessions`
- Background polling (presence POST, versions GET) is expected.

## Console Check
- Open DevTools → Console.
- Clear console before testing.
- After diagram load + pan + interaction, verify 0 errors.
