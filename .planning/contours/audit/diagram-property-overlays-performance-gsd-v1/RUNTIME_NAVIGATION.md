# Runtime Navigation Plan

## Endpoints

| Service | URL |
|---------|-----|
| Frontend | `http://clearvestnic.ru:5180` |
| API | `http://clearvestnic.ru:8088` |
| API Health | `http://clearvestnic.ru:8088/health` |

## Prerequisites

1. Ensure frontend and API are serving:
   ```bash
   curl -s http://clearvestnic.ru:8088/health
   curl -I http://clearvestnic.ru:5180
   ```
2. Identify or create a session with BPMN diagram and property overlays.
3. If no such session exists, document and attempt to use any available session.

---

## Scenario A — Baseline Diagram Open

### Steps
1. Open `http://clearvestnic.ru:5180` in browser/Playwright.
2. Navigate to a session that has a BPMN diagram.
3. Wait for initial load to complete.
4. Click "Diagram" (BPMN) tab.
5. Wait until canvas is visible and stable.

### Measurements
- [ ] Time from tab click to visible canvas (stopwatch or Performance API);
- [ ] Network requests during tab switch (count by type);
- [ ] Console errors/warnings;
- [ ] Visible loaders/spinners;
- [ ] Toasts/notifications shown;
- [ ] Approximate DOM node count (document.querySelectorAll('*').length);
- [ ] Count of `.djs-overlay` nodes;
- [ ] Count of `.djs-overlay-container` nodes.

### Evidence Files
- `evidence/network-baseline.md`
- `evidence/console-baseline.md`
- `evidence/screenshot-diagram-loaded.png` (if Playwright)

---

## Scenario B — Analysis ↔ Diagram Tab Switching

### Steps
1. Start from Analysis tab.
2. Click Diagram tab → wait for stable.
3. Click Analysis tab → wait for stable.
4. Repeat 2 more times (total 3 cycles).

### Measurements
- [ ] Timing for each tab switch;
- [ ] Repeated requests (same endpoint called multiple times);
- [ ] Duplicate version/limit notifications;
- [ ] Whether diagram fully remounts (check DOM node count change, canvas re-initialization);
- [ ] Whether BPMN modeler re-initializes (check for repeated `bpmn-js` init logs if any);
- [ ] Overlay count after each cycle.

### Evidence Files
- `evidence/network-baseline.md` (append tab switch section)
- `evidence/performance-notes.md`

---

## Scenario C — Overlay Visibility

### Steps
1. On Diagram tab, ensure property overlays are visible (or toggle on if toggle exists).
2. If there is a toggle for overlays/properties — toggle off, wait, toggle on, wait.
3. Select 5–10 different BPMN elements one by one.
4. Hover over 5–10 different elements.
5. If property details panel/popover exists — open and close for 3–5 elements.

### Measurements
- [ ] UI responsiveness during overlay toggle;
- [ ] Console errors during selection/hover;
- [ ] Network requests triggered by selection/hover/overlay toggle;
- [ ] DOM node count before overlay toggle;
- [ ] DOM node count after overlay toggle;
- [ ] `.djs-overlay` count before/after;
- [ ] Whether overlays duplicate for same element (check if multiple overlay nodes attach to same element ID);
- [ ] Any PATCH/PUT/mutation requests triggered without explicit save.

### Evidence Files
- `evidence/network-overlay.md`
- `evidence/dom-overlay-counts.md`
- `evidence/screenshot-overlays-visible.png` (if Playwright)

---

## Scenario D — Pan/Zoom Performance

### Steps
1. Zoom in 3 times.
2. Zoom out 3 times.
3. Pan canvas left/right/up/down.
4. Select an element during zoomed state.
5. Select an element during panned state.

### Measurements
- [ ] Subjective smoothness (smooth / slight jank / heavy jank / frozen);
- [ ] Console errors during pan/zoom;
- [ ] Network requests during pan/zoom;
- [ ] Overlay position updates (do overlays follow canvas smoothly or lag?);
- [ ] DOM node count change during pan/zoom.

### Evidence Files
- `evidence/performance-notes.md` (append pan/zoom section)

---

## Scenario E — Large Diagram / Heavy Session

### Steps
1. Identify or create a session with many BPMN elements (20+ steps/elements) and many analysis steps.
2. Repeat Scenario A on this session.
3. Repeat Scenario B.
4. Repeat Scenario C.
5. Repeat Scenario D.

### Measurements
- [ ] All metrics from A–D compared to small diagram;
- [ ] Whether symptoms scale linearly or exponentially;
- [ ] Memory pressure indicators (if browser devtools available).

### Evidence Files
- `evidence/performance-notes.md` (append large diagram section)

---

## Playwright Automation Notes

If Playwright MCP is available, prefer automated capture:

```javascript
// Example patterns (adapt to actual frontend structure)
// 1. Navigate
await page.goto('http://clearvestnic.ru:5180');

// 2. Wait for session list and click first session
await page.waitForSelector('[data-testid="session-item"]');
await page.click('[data-testid="session-item"]:first-child');

// 3. Click Diagram tab
await page.click('text=Diagram');
await page.waitForSelector('.djs-container');

// 4. Capture network
const requests = [];
page.on('request', req => requests.push({url: req.url(), method: req.method()}));

// 5. Capture console
const consoleLogs = [];
page.on('console', msg => consoleLogs.push({type: msg.type(), text: msg.text()}));

// 6. DOM counts
const overlayCount = await page.evaluate(() => document.querySelectorAll('.djs-overlay').length);
const totalNodes = await page.evaluate(() => document.querySelectorAll('*').length);

// 7. Screenshot
await page.screenshot({path: 'screenshot-diagram-loaded.png'});
```

If selectors differ, adapt after inspecting actual DOM.

---

## Fallback (No Playwright)

If Playwright is unavailable:
1. Document `PLAYWRIGHT_UNAVAILABLE` in `EXEC_REPORT.md`;
2. Use browser devtools manually or curl-based checks;
3. Focus heavily on source-level audit (Task 2 in EXECUTOR_PROMPT.md);
4. Agent 3 may require rework if runtime evidence is insufficient.
