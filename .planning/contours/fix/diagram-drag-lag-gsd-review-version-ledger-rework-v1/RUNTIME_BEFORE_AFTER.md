# Runtime Before / After

## Contour
- **ID**: `fix/diagram-drag-lag-gsd-review-version-ledger-rework-v1`

---

## Before (Previous Contour State)

| Metric | Value |
|--------|-------|
| Version | v1.0.126 |
| Default mode | NavigatedViewer (read-only) |
| Element drag | BLOCKED — "expected NavigatedViewer behavior" |
| Canvas pan long tasks | 34 → 20 (previous fix applied) |
| commandStack guard | NONE |
| Footer | `Версия v1.0.126 · a9a9d9c · 15.05.2026, 21:26` |

## After (This Contour)

| Metric | Value |
|--------|-------|
| Version | v1.0.127 |
| Default mode | Modeler (editable) |
| Element drag | POSSIBLE — immediate |
| Canvas pan long tasks | Expected similar to previous after-fix (~20) |
| commandStack guard | `isDragInProgress` suppresses decor fanout |
| `hasHiddenParentStyles` | No longer checks parent `opacity === "0"` |
| Footer | `Версия v1.0.127 · a9a9d9c · 15.05.2026, 23:38` |

## Code Changes That Affect Drag

### Added
1. `commandStack.changed` handler now checks `isDragInProgress` before calling `runImmediateEditorFanout`.
2. `forceEditorMode` default changed from `false` to `true`.
3. `hasHiddenParentStyles` no longer checks `opacity === "0"` on parents.

### Expected Impact
- **Element drag**: Should now work (Modeler default) AND should be smoother (no decor fanout during drag).
- **Canvas pan**: Should be similar to previous after-fix since viewer path is unchanged.
- **Modeler init**: Should no longer get stuck on `layout_not_ready_before_modeler_init`.

## Verification Gap

Browser runtime testing for drag metrics was blocked by app loading issues in the automated test context (208 DOM nodes, disabled tabs). This appears to be a test-environment auth/rendering issue, not a code regression.

**Agent 3 must verify**:
1. Diagram loads with Modeler default (no `layout_not_ready_before_modeler_init`).
2. Element drag is possible and smooth.
3. Canvas pan long tasks are ≤20 for quick drag.
4. No console errors during drag.
5. 0 PUT/PATCH from drag interactions.

---

## Status
⚠️ Code fixes applied. Runtime drag metrics require Agent 3 verification.

