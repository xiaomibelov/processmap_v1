# Performance Before / After — perf/diagram-property-overlays-viewport-culling-v1

**Test session**: `wewe` (`4c515d1c6e`) in project `Описание процессов Долгопрудный` (`b1c8a56b6e`)  
**Runtime**: `http://clearvestnic.ru:5180`  
**Test method**: Browser DevTools Console (`document.querySelectorAll(...).length`)

---

## Baseline — Overlays OFF

| Metric | Value |
|--------|-------|
| Total DOM nodes | 8,025 |
| `.djs-overlay` | 17 |
| `.fpcPropertyOverlay` | 0 |

## Baseline — Overlays ON (before fix)

Property overlays enabled via `localStorage.setItem('fpc_properties_overlay_always_v1:4c515d1c6e', '1')` and page reload.

| Metric | Value |
|--------|-------|
| Total DOM nodes | 10,795 |
| `.djs-overlay` | 197 |
| `.fpcPropertyOverlay` | 180 |
| Delta vs OFF | +2,770 nodes (+34.5%) |

## After Fix — Overlays ON (default viewport)

Same session, same localStorage setting, after deploying the viewport-culling build.

| Metric | Value |
|--------|-------|
| Total DOM nodes | 9,175 |
| `.djs-overlay` | 87 |
| `.fpcPropertyOverlay` | 70 |
| Delta vs OFF | +1,150 nodes (+14.3%) |
| Reduction vs before fix | -1,620 nodes (-59% of overlay inflation) |

---

## Runtime Behavior Tests

### Zoom Out (more elements visible)

| Action | `.fpcPropertyOverlay` |
|--------|----------------------|
| Initial load | 70 |
| Zoom out 3× | 91 |
| Zoom out 5× more | 144 |

**Observation**: As the viewport expands to show more elements, overlay count increases proportionally. Confirms culling responds to viewport size.

### Zoom In (fewer elements visible)

| Action | `.fpcPropertyOverlay` |
|--------|----------------------|
| After zoom out | 144 |
| Zoom in 8× | 48 |

**Observation**: Zooming in to a focused area drops overlay count to 48. Confirms culling removes offscreen overlays.

### Zoom Stability

| Action | `.fpcPropertyOverlay` |
|--------|----------------------|
| Zoom in 8× | 48 |
| Zoom out 4× | 71 |

**Observation**: After zooming back out, count returns to ~70 (near initial). No monotonic growth. Confirms stale cleanup loop works correctly.

### Tab Switch — XML ↔ Diagram

| Step | `.fpcPropertyOverlay` |
|------|----------------------|
| Diagram (overlays ON) | 70 |
| Switch to XML tab | 0 |
| Switch back to Diagram tab | 70 |

**Observation**: No duplicate overlays after tab switch. Count restores cleanly.

### Tab Switch — Analysis ↔ Diagram

| Step | `.fpcPropertyOverlay` |
|------|----------------------|
| Diagram (overlays ON) | 70 |
| Switch to Analysis tab | 70 (Analysis tab also shows diagram) |
| Switch back to Diagram tab | 70 |

**Observation**: Counts remain stable across Analysis/Diagram tab switches.

---

## Console Errors

- **No new console errors** introduced by this change.
- Pre-existing errors observed (unrelated to this contour):
  - `401 Unauthorized` on `/api/auth/me`
  - `401 Unauthorized` on `/api/sessions/4c515d1c6e/bpmn/versions?limit=1`

## Network Side Effects

- **No `PUT /bpmn`** triggered by pan/zoom or overlay visibility changes.
- **No `PATCH` session** triggered by overlay interactions.
- `GET /bpmn/versions?limit=1` spam is a pre-existing issue (separate contour).

---

## Screenshot Evidence

Runtime screenshot with overlays rendering correctly on visible BPMN elements after the fix:

![runtime-overlays-after-fix](./runtime-overlays-after-fix.png)
