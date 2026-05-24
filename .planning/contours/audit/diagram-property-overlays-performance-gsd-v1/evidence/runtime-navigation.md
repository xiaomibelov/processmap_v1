# Runtime Navigation Evidence

## Session Used
- Project: `Описание процессов Долгопрудный` (b1c8a56b6e)
- Session: `wewe` (4c515d1c6e)
- Frontend: http://clearvestnic.ru:5180
- API: http://clearvestnic.ru:8088

## Scenario A — Baseline Diagram Open

| Metric | Value |
|--------|-------|
| Total DOM nodes | 8,025 |
| `.djs-overlay` count | 17 |
| `.djs-overlay-container` count | 1 |
| `.fpcPropertyOverlay` count | 0 (overlays disabled) |
| `.djs-container` count | 1 |
| `.bpmnCanvas` count | 2 (viewer + editor, editor hidden) |
| Console errors | 1× 401 Unauthorized on `/api/auth/me` (recovered) |
| Diagram remount | No — canvas persists in DOM |

## Scenario B — Analysis ↔ Diagram Tab Switching

| Cycle | Total DOM | djs-overlay | fpcPropertyOverlay | Notes |
|-------|-----------|-------------|-------------------|-------|
| Initial (Diagram) | 8,025 | 17 | 0 | Baseline |
| After → Analysis | 7,999 | 17 | 0 | Canvas hidden, not unmounted |
| After → Diagram | 8,025 | 17 | 0 | Canvas shown, same nodes |

**Finding**: Diagram/BPMN tab does **NOT** remount on tab switch. The `bpmnCanvas` and `djs-container` remain in the DOM; visibility is toggled via CSS (`display: none` / `display: block`).

## Scenario C — Overlay Visibility

| State | Total DOM | djs-overlay | fpcPropertyOverlay |
|-------|-----------|-------------|-------------------|
| Overlays OFF | 8,025 | 17 | 0 |
| Overlays ON (always) | 10,795 | 197 | 180 |
| Delta | +2,770 (+34.5%) | +180 | +180 |

**Finding**: Enabling property overlays adds **180 `.fpcPropertyOverlay` DOM nodes** and increases total DOM node count by **34.5%**. Each overlay contains a full table with styled rows (inline CSS variables, color model, key/value cells).

Tab switch with overlays ON:
| Cycle | Total DOM | djs-overlay | fpcPropertyOverlay |
|-------|-----------|-------------|-------------------|
| Initial | 10,795 | 197 | 180 |
| → Analysis | 10,795 | 197 | 180 |
| → Diagram | 10,795 | 197 | 180 |

**Finding**: No overlay duplication on tab switch. Cleanup logic (`clearPropertiesOverlayDecor`) works correctly.

## Scenario D — Pan/Zoom Performance

| Action | Total DOM | djs-overlay | fpcPropertyOverlay | Result |
|--------|-----------|-------------|-------------------|--------|
| Zoom in 3× (1.0 → 1.6) | 10,798 | 197 | 180 | Stable — overlays reused via `geometrySignature` check |
| Pan canvas | 10,798 | 197 | 180 | Stable — no DOM growth |

**Finding**: Pan/zoom does **NOT** create duplicate overlays. `decorManager.js` implements `geometrySignature` comparison and reuses existing containers/tables when zoom bucket hasn't changed enough.

## Scenario E — Large Diagram

This session (`wewe`) has approximately 15–20 BPMN elements. The overlay inflation is already significant (+180 nodes). A larger diagram would scale linearly with element count because `applyPropertiesOverlayDecor` iterates `allDiagramElements` when `alwaysEnabled` is true.
