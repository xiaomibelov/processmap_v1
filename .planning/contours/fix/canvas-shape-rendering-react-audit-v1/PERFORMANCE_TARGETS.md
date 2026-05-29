# Performance Targets

**Контур**: `fix/canvas-shape-rendering-react-audit-v1`  
**Run ID**: `20260529T000236Z-27528`

---

## Baseline (current, after GPU revert)

| Metric | Value | Source |
|--------|-------|--------|
| Large diagram pan FPS | ~30 | User report + prior audit |
| React re-renders during pan | Unknown | To be audited |
| Overlays during pan | Visible | Current stable state |
| Small diagram pan FPS | 60 | Baseline |

## Target (after CSS + React fix)

| Metric | Target | Measurement method |
|--------|--------|-------------------|
| Large diagram pan FPS | **≥ 38–40** (+8–10 FPS) | `measureFPS()` during 3-second pan, same 428-element diagram |
| React re-renders during pan | **0** | React DevTools «Highlight updates» or profiler |
| Overlays during pan | **Visible, correctly positioned** | Visual check during real mouse drag |
| Small diagram pan FPS | **60** (no regression) | Same method |

## Measurement protocol

1. **Build** frontend (`npm run build`).
2. **Deploy** to `:5177` (ensure served from correct directory, not `/app`).
3. **Large diagram** (428 elements):
   - Open diagram.
   - Start FPS counter (`measureFPS()` or `requestAnimationFrame` loop).
   - Perform 3-second real mouse drag pan.
   - Record average FPS.
4. **React re-render check**:
   - Open React DevTools.
   - Enable «Highlight updates when components render».
   - Pan canvas.
   - Confirm `BpmnStage` and `.djs-container` do NOT flash.
5. **Small diagram**:
   - Repeat FPS measurement.
   - Confirm 60 FPS.
6. **Overlay check**:
   - Confirm overlays visible throughout pan.
   - Confirm overlays correctly positioned after pan stops.

## Acceptance

- PASS only if ALL targets met.
- CHANGES_REQUESTED if FPS < 38 OR overlays disappear OR React re-renders > 0 during pan.
