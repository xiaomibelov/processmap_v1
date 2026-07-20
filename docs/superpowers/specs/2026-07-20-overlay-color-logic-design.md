# Design spec: Redesign Draw.io overlay color logic

**Branch:** `feat/overlay-color-logic-redesign`  
**Scheme:** B — preset-driven per-element coloring  
**Date:** 2026-07-20  
**Status:** Draft, awaiting approval

## Problem statement

Current Draw.io overlay colors are hard-coded by tool type in `drawioRuntimePlacement.js` and `drawioPlacementPreview.js`. There is no way for a user to express semantic intent (e.g., "this rectangle is a warning"). The existing `DRAWIO_RUNTIME_STYLE_PRESETS` palette is used only for selected elements in `LayersPopover.jsx`, not as the default source of truth.

## Goal

1. Make `DRAWIO_RUNTIME_STYLE_PRESETS` the single source of truth for default overlay colors.
2. Persist the chosen style per element in `drawio_elements_v1[].style`.
3. Allow the user to change the style of a selected element via `LayersPopover`.
4. Keep render, persist, DnD, undo, and H5 SVG cache behavior intact.

## Non-goals

- Do not introduce automatic color derivation from BPMN property names (that is scheme C; out of scope for this PR).
- Do not change the overlay data schema beyond adding an optional `style` object to rect/container/text rows.
- Do not add new dependencies.

## Current state

| File | Role | Current color behavior |
|---|---|---|
| `frontend/src/features/process/drawio/runtime/drawioRuntimePlacement.js` | Builds SVG markup and element rows on create | Hard-coded fill/stroke per tool (`rect` blue, `container` slate, `text` dark) |
| `frontend/src/features/process/drawio/runtime/drawioPlacementPreview.js` | Placement preview spec | Mirrors hard-coded colors |
| `frontend/src/features/process/drawio/runtime/drawioRuntimeNote.js` | Note row builder | Hard-coded default yellow style; `style` object already stored in row |
| `frontend/src/features/process/drawio/drawioDocXml.js` | Builds `<mxCell>` style string | Hard-coded `fillColor`/`strokeColor` per tool |
| `frontend/src/features/process/drawio/drawioRuntimeStylePresets.js` | Preset palette | Defines `shape` and `text` presets; used only in `LayersPopover` for selected elements |
| `frontend/src/features/process/drawio/DrawioOverlayRenderer.jsx` | Renders SVG | Uses `row.style` for notes; rect/container/text ignore stored style |
| `frontend/src/features/process/stage/components/LayersPopover.jsx` | Overlay panel | Shows presets for selected element but cannot apply them to rect/container/text |

## Proposed design

### 1. Unified surface model

Introduce four surfaces, each mapped to a tool:

| Surface | Tools | Preset fields |
|---|---|---|
| `shape` | `rect` | `fill`, `stroke`, `stroke-width` |
| `container` | `container` | `fill`, `stroke`, `stroke-width`, `stroke-dasharray` |
| `text` | `text` | `fill` |
| `note` | `note` | `bg_color`, `border_color`, `text_color` |

`DRAWIO_RUNTIME_STYLE_PRESETS` will be extended with `container` and `note` surfaces.

### 2. Element row `style` object

All `drawio_elements_v1` rows may carry an optional `style` object. Semantics per surface:

- `shape` / `container`: `{ fill, stroke, "stroke-width" }`
- `text`: `{ fill }`
- `note`: `{ bg_color, border_color, text_color }` (already exists)

If `style` is missing, the default preset for the surface is used. This keeps existing data backward-compatible.

### 3. Default creation color

When a new overlay element is created, the system picks the default preset for its surface:

- `shape` default → `accent` (blue)
- `container` default → `neutral` (slate/gray)
- `text` default → `default` (dark)
- `note` default → existing yellow

The default is encoded into the element row `style` at creation time so the SVG cache key naturally includes it.

### 4. SVG generation

- `drawioRuntimePlacement.js` builds markup using the row's `style` (or default preset) instead of hard-coded colors.
- `drawioDocXml.js` builds `<mxCell style="...">` using the same style object.
- `DrawioOverlayRenderer.jsx` continues to use `row.style` for notes and starts using it for shape/container/text rows.

### 5. LayersPopover integration

For a selected Draw.io element:

- Determine its surface.
- Show the list of presets for that surface.
- Highlight the currently applied preset.
- Clicking a preset calls `onSetDrawioElementStylePreset(elementId, presetId)`, which updates `drawio_elements_v1[].style`.

### 6. H5 SVG cache compatibility

The existing cache key in `drawioOverlayState.js` already serializes `drawio_elements_v1`. Because the chosen style lives inside each row, changing the style changes the cache key automatically. No special invalidation logic is required.

## Preset palette (draft)

```js
DRAWIO_RUNTIME_STYLE_PRESETS = {
  shape: [
    { id: "accent",  label: "Синий",   svg: { fill: "rgba(59,130,246,0.24)", stroke: "#2563eb", "stroke-width": "2" }, doc: { fillColor: "#dbeafe", strokeColor: "#2563eb", strokeWidth: "2" } },
    { id: "success", label: "Зелёный", svg: { fill: "rgba(16,185,129,0.20)", stroke: "#059669", "stroke-width": "2" }, doc: { fillColor: "#d1fae5", strokeColor: "#059669", strokeWidth: "2" } },
    { id: "warning", label: "Янтарь",  svg: { fill: "rgba(245,158,11,0.18)", stroke: "#d97706", "stroke-width": "2" }, doc: { fillColor: "#fef3c7", strokeColor: "#d97706", strokeWidth: "2" } },
    { id: "neutral", label: "Серый",   svg: { fill: "rgba(148,163,184,0.16)", stroke: "#475569", "stroke-width": "2" }, doc: { fillColor: "#e2e8f0", strokeColor: "#475569", strokeWidth: "2" } },
  ],
  container: [
    { id: "neutral", label: "Серый",   svg: { fill: "rgba(15,23,42,0.04)", stroke: "#334155", "stroke-width": "2", "stroke-dasharray": "8 4" }, doc: { fillColor: "#f8fafc", strokeColor: "#334155", strokeWidth: "2", dashed: "1" } },
    { id: "accent",  label: "Синий",   svg: { fill: "rgba(59,130,246,0.08)", stroke: "#2563eb", "stroke-width": "2", "stroke-dasharray": "8 4" }, doc: { fillColor: "#eff6ff", strokeColor: "#2563eb", strokeWidth: "2", dashed: "1" } },
  ],
  text: [
    { id: "default", label: "Тёмный", svg: { fill: "#0f172a" }, doc: { fontColor: "#0f172a" } },
    { id: "accent",  label: "Синий",  svg: { fill: "#2563eb" }, doc: { fontColor: "#2563eb" } },
    { id: "danger",  label: "Красный", svg: { fill: "#dc2626" }, doc: { fontColor: "#dc2626" } },
  ],
  note: [
    { id: "default", label: "Жёлтый", svg: { bg_color: "#fef08a", border_color: "#ca8a04", text_color: "#1f2937" }, doc: { fillColor: "#fef08a", strokeColor: "#ca8a04", fontColor: "#1f2937" } },
    { id: "mint",    label: "Мятный", svg: { bg_color: "#d1fae5", border_color: "#059669", text_color: "#064e3b" }, doc: { fillColor: "#d1fae5", strokeColor: "#059669", fontColor: "#064e3b" } },
    { id: "pink",    label: "Розовый", svg: { bg_color: "#fce7f3", border_color: "#db2777", text_color: "#831843" }, doc: { fillColor: "#fce7f3", strokeColor: "#db2777", fontColor: "#831843" } },
  ],
}
```

## Files expected to change

1. `frontend/src/features/process/drawio/drawioRuntimeStylePresets.js` — add `container`/`note` surfaces, default helpers.
2. `frontend/src/features/process/drawio/runtime/drawioRuntimePlacement.js` — consume style presets when building markup/rows.
3. `frontend/src/features/process/drawio/runtime/drawioPlacementPreview.js` — use preset defaults for preview.
4. `frontend/src/features/process/drawio/drawioDocXml.js` — build `<mxCell>` style from row style.
5. `frontend/src/features/process/drawio/runtime/drawioRuntimeNote.js` — optional preset-aware default note style.
6. `frontend/src/features/process/drawio/DrawioOverlayRenderer.jsx` — use `row.style` for shape/container/text.
7. `frontend/src/features/process/stage/components/LayersPopover.jsx` — add preset selector for selected Draw.io element.
8. New controller/hook files as needed to wire `onSetDrawioElementStylePreset` into state updates.
9. Tests for preset resolution and placement markup.

## Success criteria

- [ ] New `rect`/`container`/`text`/`note` elements render with default preset colors.
- [ ] Existing overlay elements without `style` continue to render with the same colors as before (backward compatibility).
- [ ] User can change a selected element's preset in `LayersPopover`; SVG updates immediately.
- [ ] Style change is persisted in `drawio_elements_v1[].style` and survives reload.
- [ ] `npm run build` passes.
- [ ] Existing overlay tests pass; new tests added for preset logic.
- [ ] H5 SVG cache remains correct (no stale colors after style change).

## Out of scope / future work

- Scheme C (property-name-based automatic coloring) can be layered later by deriving a preset from BPMN element properties and calling the same `onSetDrawioElementStylePreset` path.
- Legend outside of `LayersPopover` is not added in this PR.

## Approved by

- [ ] Author / Tech lead sign-off required before implementation
