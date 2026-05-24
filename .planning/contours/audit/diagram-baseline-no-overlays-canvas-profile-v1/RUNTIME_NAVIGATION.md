# RUNTIME_NAVIGATION — audit/diagram-baseline-no-overlays-canvas-profile-v1

## Runtime URLs
- **Frontend**: http://clearvestnic.ru:5180
- **API**: http://clearvestnic.ru:8088
- **API Health**: http://clearvestnic.ru:8088/health

## Session
- From previous audits: session `wewe` (`4c515d1c6e`) in project `Описание процессов Долгопрудный` (`b1c8a56b6e`).
- If unavailable, use any session with a BPMN diagram.

## How to open session
1. Open `http://clearvestnic.ru:5180`
2. Log in if required.
3. Navigate to project `Описание процессов Долгопрудный` or another project.
4. Open session `wewe` or available session.

## How to open Diagram tab
1. Inside session, click the "Diagram" or "Схема" tab.
2. Wait for canvas to load (SVG visible, elements rendered).

## How to turn overlays on/off
- Look for "Слои" or "Layers" button/toggle in the diagram toolbar or side panel.
- Previous audit noted toggle label may show "СлоиOFF" when off.
- If toggle does not respond in Playwright, document actual `.fpcPropertyOverlay` count rather than assuming toggle state.

## How to run pan/zoom
- **Pan**: Click-drag on empty canvas area.
- **Zoom**: Use mouse wheel over canvas, or zoom in/out buttons if present.

## How to select elements
- Click on a BPMN shape (task, gateway, event, pool, lane).
- Previous audits used 5–10 sequential clicks on different elements.

## How to hover elements
- Mouse-over BPMN shapes.
- Observe for hover affordances, tooltip-like overlays, or console events.

## How to switch Analysis ↔ Diagram
1. Click "Analysis" or "Анализ" tab.
2. Wait for Analysis view to render.
3. Click "Diagram" or "Схема" tab to return.

## How to switch XML ↔ Diagram
1. Click "XML" tab if available.
2. Wait for XML editor to render.
3. Click "Diagram" or "Схема" tab to return.

## Browser Snippets

Run in browser console to capture counts:

```js
// Total DOM nodes
console.log("Total DOM nodes:", document.querySelectorAll('*').length);

// SVG nodes
console.log("SVG nodes:", document.querySelectorAll('svg *').length);

// djs-overlay count
console.log("djs-overlay:", document.querySelectorAll('.djs-overlay').length);

// fpcPropertyOverlay count
console.log("fpcPropertyOverlay:", document.querySelectorAll('.fpcPropertyOverlay').length);

// BPMN elements with data-element-id
console.log("data-element-id:", document.querySelectorAll('[data-element-id]').length);
```

Alternative selectors if above differ:
```js
document.querySelectorAll('.djs-element').length
document.querySelectorAll('.djs-shape').length
document.querySelectorAll('.djs-connection').length
```

## Network Filters

Monitor these request patterns:
- `PUT` → any `PUT /api/sessions/*/bpmn` or `PUT /bpmn`
- `PATCH` → any `PATCH /api/sessions/*`
- `/bpmn` → any path containing `/bpmn`
- `/sessions` → any path containing `/sessions`
- `/bpmn/versions` → any path containing `/bpmn/versions`
- `limit=1` → query parameter `limit=1`

## Playwright Tips
- Use `browser_navigate` to `http://clearvestnic.ru:5180`
- Use `browser_click` for tab switching and element selection.
- Use `browser_evaluate` to run count snippets.
- Use `browser_network_requests` with filter to monitor API calls.
- If auth is required and not persisted, document and proceed with available capabilities.
