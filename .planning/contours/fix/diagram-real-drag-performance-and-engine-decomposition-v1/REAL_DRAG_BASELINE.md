# Real Drag Baseline (before fix)

## Test Setup
- Runtime: http://clearvestnic.ru:5180
- Project: b1c8a56b6e (`Описание процессов Долгопрудный`)
- Session: wewe (4c515d1c6e)
- Diagram tab active, overlays off: `.fpcPropertyOverlay = 0`
- View mode: NavigatedViewer
- DOM baseline: 7,710 total nodes, 2,107 SVG nodes

## Canvas Pan Baseline (before fix)
- Playwright real mouse drag on empty canvas
- Start: canvas center-ish (30% from top-left)
- Delta: +300px X, +80px Y
- Duration (including 500ms post-drag wait): ~5,570ms
- Long tasks: 34
- Long task total: ~6,244ms
- RAF count: 29
- DOM delta: 0
- SVG delta: 0
- Viewport transform: changed
- Console errors: 0 (only pre-existing 401 on /api/auth/me)
- Network: 0 PUT /bpmn, 0 PATCH /sessions

## Element Drag Baseline (view mode)
- View mode prevents element drag as expected
- Click + drag on `.djs-shape` does not move element
- Canvas does not pan when dragging on shape
- No selection change observed
- Expected behavior for NavigatedViewer

## Side-Effect Audit
- React state updates: not directly measurable, but DOM stable suggests minimal
- `selection.changed` events: 0 during empty-canvas pan
- `canvas.viewbox.changed` events: fires (viewport transform changes)
- Decor fanout: not triggered during empty-canvas pan (no selection change)
- Property panel updates: 0 during empty-canvas pan
- Session patch/save: 0
- `versions?limit=1` spam: 0

## Hypothesis Confirmation
- H3 (React state updates during pointermove): DOM stable, but `viewbox.changed` handler calls `getCanvasSnapshot`, `logViewAction`, `emitViewboxChanged`, `applyPropertiesOverlayDecorForZoomChange` on every change
- H4 (property panel sync during drag): `syncAiQuestionPanelWithSelection` is called on `selection.changed`, but selection doesn't change during empty-canvas pan
- H5 (decor fanout during drag): not triggered during empty-canvas pan
- H8 (SVG engine limit): 34 long tasks suggest significant SVG coordinate recalculation overhead
