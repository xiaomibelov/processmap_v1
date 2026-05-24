# Runtime Before / After

## Before (Baseline at 2026-05-15T20:47Z)
- **View mode**: Modeler always active
- **Palette**: visible
- **SVG descendants**: ~2,392
- **Total DOM**: ~8,026
- **Tab switch XML→Diagram**: ~19 s
- **Footer version**: `Версия v1.0.126` only

## After (Verified at 2026-05-15T21:11Z)
- **View mode**: NavigatedViewer active by default
- **Palette**: hidden in view mode, visible only after explicit edit
- **SVG descendants**: ~2,154 in Viewer, ~2,479 in Modeler
- **Total DOM**: ~7,717 in Viewer, ~10,193 when both layers present
- **Tab switch XML→Diagram**: ~23 s (similar; dominated by XML parse + shell render)
- **Footer version**: `Версия v1.0.126 · a9a9d9c · 15.05.2026, 21:10`

## Edit Mode Transition
1. Load Diagram tab → Viewer mode (no palette, lighter DOM)
2. Click "Редактировать BPMN" → `forceEditorMode = true`
3. Effect re-runs → `renderModeler()` initializes Modeler in editor layer
4. Palette appears, editor layer visible, diagram layer hidden
5. Switch to XML tab → `forceEditorMode` reset to `false`
6. Switch back to Diagram tab → Viewer mode restored

## Zoom Performance (Viewer mode, in-browser measurement)
- 5× zoom out + 5× zoom in: **58.2 ms total**
- Per-click average: **5.82 ms**
