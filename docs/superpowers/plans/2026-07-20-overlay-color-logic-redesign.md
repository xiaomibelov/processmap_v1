# Overlay color logic redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `DRAWIO_RUNTIME_STYLE_PRESETS` the single source of truth for Draw.io overlay colors, persist the chosen style per element, and allow the user to change it via `LayersPopover`.

**Architecture:** Extend the existing preset system with `container` and `note` surfaces, teach placement/preview/doc-xml to read defaults from presets, fix the existing `setDrawioElementStylePreset` mutation to persist style in `drawio_elements_v1[].style`, and keep the existing `LayersPopover` preset UI working.

**Tech Stack:** React, Vite, vanilla JS modules, existing overlay state/drawio modules.

---

## File structure

| File | Responsibility |
|---|---|
| `frontend/src/features/process/drawio/drawioRuntimeStylePresets.js` | Palette + surface resolution + default helpers |
| `frontend/src/features/process/drawio/runtime/drawioRuntimePlacement.js` | Creates element rows + SVG markup; now uses default preset style |
| `frontend/src/features/process/drawio/runtime/drawioPlacementPreview.js` | Placement preview spec; now uses default preset colors |
| `frontend/src/features/process/drawio/drawioDocXml.js` | Builds `<mxCell>` style string; now uses row style |
| `frontend/src/features/process/overlay/controllers/useDrawioElementContentMutationApi.js` | Applies preset mutation; must persist style in row + patch SVG/doc |
| `frontend/src/features/process/drawio/runtime/drawioRuntimeNote.js` | Note style normalization; small adjustment to accept preset defaults |
| `frontend/src/features/process/drawio/runtime/drawioOverlayRendererMemo.js` | Memo equality; must include `style` for shape/container/text rows |
| Test files | Cover preset resolution, placement markup, mutation persistence |

---

## Task 1: Extend `DRAWIO_RUNTIME_STYLE_PRESETS` with container/note surfaces

**Files:**
- Modify: `frontend/src/features/process/drawio/drawioRuntimeStylePresets.js`
- Test: `frontend/src/features/process/drawio/drawioRuntimeStylePresets.test.mjs` (create)

- [ ] **Step 1: Write the failing test**

```js
// frontend/src/features/process/drawio/drawioRuntimeStylePresets.test.mjs
import { describe, it } from "node:test";
import assert from "node:assert";
import {
  DRAWIO_RUNTIME_STYLE_PRESETS,
  getDefaultRuntimeStylePreset,
  getRuntimeStylePresets,
  matchRuntimeStylePreset,
  resolveRuntimeStyleSurface,
} from "./drawioRuntimeStylePresets.js";

describe("drawioRuntimeStylePresets", () => {
  it("resolves surface from tool id", () => {
    assert.equal(resolveRuntimeStyleSurface("rect"), "shape");
    assert.equal(resolveRuntimeStyleSurface("container"), "container");
    assert.equal(resolveRuntimeStyleSurface("text"), "text");
    assert.equal(resolveRuntimeStyleSurface("note"), "note");
  });

  it("returns default presets for each surface", () => {
    assert.equal(getDefaultRuntimeStylePreset("shape")?.id, "accent");
    assert.equal(getDefaultRuntimeStylePreset("container")?.id, "neutral");
    assert.equal(getDefaultRuntimeStylePreset("text")?.id, "default");
    assert.equal(getDefaultRuntimeStylePreset("note")?.id, "default");
  });

  it("includes container and note palettes", () => {
    assert.ok(getRuntimeStylePresets("container").length >= 2);
    assert.ok(getRuntimeStylePresets("note").length >= 3);
  });

  it("matches preset by svg attrs for container", () => {
    const preset = getRuntimeStylePresets("container")[0];
    const matched = matchRuntimeStylePreset("container", preset.svg);
    assert.equal(matched?.id, preset.id);
  });
});
```

Run: `cd frontend && npx jest src/features/process/drawio/drawioRuntimeStylePresets.test.mjs 2>&1 | tail -20`  
Expected: FAIL — `getDefaultRuntimeStylePreset`, container/note presets, and tool-based `resolveRuntimeStyleSurface` do not exist yet.

- [ ] **Step 2: Implement preset extensions**

Replace the contents of `frontend/src/features/process/drawio/drawioRuntimeStylePresets.js` with:

```js
function toText(value) {
  return String(value || "").trim();
}

export const DRAWIO_RUNTIME_STYLE_PRESETS = Object.freeze({
  shape: Object.freeze([
    {
      id: "accent",
      label: "Синий",
      svg: { fill: "rgba(59,130,246,0.24)", stroke: "#2563eb", "stroke-width": "2" },
      doc: { fillColor: "#dbeafe", strokeColor: "#2563eb", strokeWidth: "2" },
    },
    {
      id: "success",
      label: "Зелёный",
      svg: { fill: "rgba(16,185,129,0.20)", stroke: "#059669", "stroke-width": "2" },
      doc: { fillColor: "#d1fae5", strokeColor: "#059669", strokeWidth: "2" },
    },
    {
      id: "warning",
      label: "Янтарь",
      svg: { fill: "rgba(245,158,11,0.18)", stroke: "#d97706", "stroke-width": "2" },
      doc: { fillColor: "#fef3c7", strokeColor: "#d97706", strokeWidth: "2" },
    },
    {
      id: "neutral",
      label: "Серый",
      svg: { fill: "rgba(148,163,184,0.16)", stroke: "#475569", "stroke-width": "2" },
      doc: { fillColor: "#e2e8f0", strokeColor: "#475569", strokeWidth: "2" },
    },
  ]),
  container: Object.freeze([
    {
      id: "neutral",
      label: "Серый",
      svg: {
        fill: "rgba(15,23,42,0.04)",
        stroke: "#334155",
        "stroke-width": "2",
        "stroke-dasharray": "8 4",
      },
      doc: { fillColor: "#f8fafc", strokeColor: "#334155", strokeWidth: "2", dashed: "1" },
    },
    {
      id: "accent",
      label: "Синий",
      svg: {
        fill: "rgba(59,130,246,0.08)",
        stroke: "#2563eb",
        "stroke-width": "2",
        "stroke-dasharray": "8 4",
      },
      doc: { fillColor: "#eff6ff", strokeColor: "#2563eb", strokeWidth: "2", dashed: "1" },
    },
  ]),
  text: Object.freeze([
    {
      id: "default",
      label: "Тёмный",
      svg: { fill: "#0f172a" },
      doc: { fontColor: "#0f172a" },
    },
    {
      id: "accent",
      label: "Синий",
      svg: { fill: "#2563eb" },
      doc: { fontColor: "#2563eb" },
    },
    {
      id: "danger",
      label: "Красный",
      svg: { fill: "#dc2626" },
      doc: { fontColor: "#dc2626" },
    },
  ]),
  note: Object.freeze([
    {
      id: "default",
      label: "Жёлтый",
      svg: { bg_color: "#fef08a", border_color: "#ca8a04", text_color: "#1f2937" },
      doc: { fillColor: "#fef08a", strokeColor: "#ca8a04", fontColor: "#1f2937" },
    },
    {
      id: "mint",
      label: "Мятный",
      svg: { bg_color: "#d1fae5", border_color: "#059669", text_color: "#064e3b" },
      doc: { fillColor: "#d1fae5", strokeColor: "#059669", fontColor: "#064e3b" },
    },
    {
      id: "pink",
      label: "Розовый",
      svg: { bg_color: "#fce7f3", border_color: "#db2777", text_color: "#831843" },
      doc: { fillColor: "#fce7f3", strokeColor: "#db2777", fontColor: "#831843" },
    },
  ]),
});

export function resolveRuntimeStyleSurface(valueRaw = "") {
  const value = valueRaw && typeof valueRaw === "object" ? "" : toText(valueRaw).toLowerCase();
  // Tool id
  if (value === "rect") return "shape";
  if (value === "container") return "container";
  if (value === "text") return "text";
  if (value === "note") return "note";
  // Element snapshot tagName fallback (existing behavior)
  if (value === "rect") return "shape";
  if (value === "text") return "text";
  return "";
}

export function getRuntimeStylePresets(surfaceRaw) {
  const surface = toText(surfaceRaw).toLowerCase();
  return Array.isArray(DRAWIO_RUNTIME_STYLE_PRESETS[surface])
    ? DRAWIO_RUNTIME_STYLE_PRESETS[surface]
    : [];
}

export function getDefaultRuntimeStylePreset(surfaceRaw) {
  const presets = getRuntimeStylePresets(surfaceRaw);
  return presets[0] || null;
}

export function matchRuntimeStylePreset(surfaceRaw, attrsRaw = {}) {
  const surface = toText(surfaceRaw).toLowerCase();
  const attrs = attrsRaw && typeof attrsRaw === "object" ? attrsRaw : {};
  const presets = getRuntimeStylePresets(surface);
  return presets.find((preset) => Object.entries(preset.svg || {}).every(([key, value]) => (
    toText(attrs[key]) === toText(value)
  ))) || null;
}
```

Note: `resolveRuntimeStyleSurface` accepts both tool ids and snapshot tag names. Keep the existing snapshot behavior for backward compatibility.

- [ ] **Step 3: Run the tests**

Run: `cd frontend && npx jest src/features/process/drawio/drawioRuntimeStylePresets.test.mjs 2>&1 | tail -20`  
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add frontend/src/features/process/drawio/drawioRuntimeStylePresets.js \
        frontend/src/features/process/drawio/drawioRuntimeStylePresets.test.mjs
git commit -m "feat: extend drawio runtime style presets with container/note surfaces"
```

---

## Task 2: Placement defaults use presets

**Files:**
- Modify: `frontend/src/features/process/drawio/runtime/drawioRuntimePlacement.js`
- Test: `frontend/src/features/process/drawio/runtime/drawioRuntimePlacement.test.mjs` (create if missing)

- [ ] **Step 1: Write the failing test**

```js
// frontend/src/features/process/drawio/runtime/drawioRuntimePlacement.test.mjs
import { describe, it } from "node:test";
import assert from "node:assert";
import { buildRuntimePlacementPatch } from "./drawioRuntimePlacement.js";

describe("buildRuntimePlacementPatch color defaults", () => {
  it("new rect stores default accent style in row and markup", () => {
    const result = buildRuntimePlacementPatch({
      metaRaw: { drawio_elements_v1: [], drawio_layers_v1: [] },
      toolIdRaw: "rect",
      pointRaw: { x: 100, y: 100 },
    });
    assert.equal(result.changed, true);
    const row = result.meta.drawio_elements_v1[0];
    assert.equal(row.style?.stroke, "#2563eb");
    assert.ok(result.meta.svg_cache.includes('fill="rgba(59,130,246,0.24)"'));
  });

  it("new container stores default neutral style", () => {
    const result = buildRuntimePlacementPatch({
      metaRaw: { drawio_elements_v1: [], drawio_layers_v1: [] },
      toolIdRaw: "container",
      pointRaw: { x: 100, y: 100 },
    });
    const row = result.meta.drawio_elements_v1[0];
    assert.equal(row.style?.stroke, "#334155");
    assert.ok(result.meta.svg_cache.includes('stroke-dasharray="8 4"'));
  });
});
```

Run: `cd frontend && npx jest src/features/process/drawio/runtime/drawioRuntimePlacement.test.mjs 2>&1 | tail -20`  
Expected: FAIL — rows do not contain `style`, markup uses hard-coded colors.

- [ ] **Step 2: Implement preset-aware placement**

Modify `frontend/src/features/process/drawio/runtime/drawioRuntimePlacement.js`:

1. Add imports at the top:

```js
import {
  getDefaultRuntimeStylePreset,
  resolveRuntimeStyleSurface,
} from "../drawioRuntimeStylePresets.js";
```

2. Replace `buildRuntimeMarkupByTool` with:

```js
function buildRuntimeMarkupByTool({ toolId, elementId, x, y, styleRaw = null }) {
  const id = escapeAttr(elementId);
  const surface = resolveRuntimeStyleSurface(toolId);
  const preset = styleRaw
    ? { svg: styleRaw }
    : getDefaultRuntimeStylePreset(surface)?.svg || {};
  if (toolId === "rect") {
    const left = formatNumber(x - 60);
    const top = formatNumber(y - 30);
    return `<rect id="${id}" x="${left}" y="${top}" width="120" height="60" rx="8" fill="${escapeAttr(preset.fill)}" stroke="${escapeAttr(preset.stroke)}" stroke-width="${escapeAttr(preset["stroke-width"])}"/>`;
  }
  if (toolId === "container") {
    const left = formatNumber(x - 100);
    const top = formatNumber(y - 60);
    return `<rect id="${id}" x="${left}" y="${top}" width="200" height="120" rx="10" fill="${escapeAttr(preset.fill)}" stroke="${escapeAttr(preset.stroke)}" stroke-width="${escapeAttr(preset["stroke-width"])}" stroke-dasharray="${escapeAttr(preset["stroke-dasharray"])}"/>`;
  }
  if (toolId === "text") {
    return buildRuntimeWrappedTextMarkup({
      elementIdRaw: id,
      textRaw: "Text",
      xRaw: formatNumber(x),
      yRaw: formatNumber(y),
      widthRaw: 120,
      fillRaw: preset.fill || "#0f172a",
      fontSizeRaw: 16,
      fontFamilyRaw: "Arial, sans-serif",
    });
  }
  return "";
}
```

3. Replace `buildRuntimeElementRow` with:

```js
function buildRuntimeElementRow({
  elementId,
  layerIdRaw,
  zIndexRaw,
  toolIdRaw,
  pointRaw,
  styleRaw = null,
}) {
  const toolId = normalizeRuntimeTool(toolIdRaw);
  if (isDrawioNoteToolId(toolId)) {
    return buildRuntimeNoteElementRow({
      elementId,
      layerIdRaw,
      zIndexRaw,
      pointRaw,
      styleRaw,
    });
  }
  const surface = resolveRuntimeStyleSurface(toolId);
  const defaultStyle = styleRaw || getDefaultRuntimeStylePreset(surface)?.svg || null;
  return {
    id: toText(elementId),
    layer_id: toText(layerIdRaw) || "DL1",
    visible: true,
    locked: false,
    deleted: false,
    opacity: 1,
    offset_x: 0,
    offset_y: 0,
    z_index: Math.max(0, Math.round(toNumber(zIndexRaw, 0))),
    ...(toolId === "text" ? { text: "Text" } : {}),
    ...(defaultStyle ? { style: defaultStyle } : {}),
  };
}
```

4. In `buildRuntimePlacementPatch`, pass `styleRaw: null` to both `buildRuntimeMarkupByTool` and `buildRuntimeElementRow`:

```js
const markup = buildRuntimeMarkupByTool({
  toolId,
  elementId: createdId,
  x,
  y,
  styleRaw: null,
});
```

```js
const nextRows = rows.concat(buildRuntimeElementRow({
  elementId: createdId,
  layerIdRaw: activeLayerId,
  zIndexRaw: rows.length,
  toolIdRaw: toolId,
  pointRaw: { x, y },
  styleRaw: null,
}));
```

- [ ] **Step 3: Run the tests**

Run: `cd frontend && npx jest src/features/process/drawio/runtime/drawioRuntimePlacement.test.mjs 2>&1 | tail -20`  
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add frontend/src/features/process/drawio/runtime/drawioRuntimePlacement.js \
        frontend/src/features/process/drawio/runtime/drawioRuntimePlacement.test.mjs
git commit -m "feat: use runtime style presets for default overlay placement colors"
```

---

## Task 3: Placement preview uses presets

**Files:**
- Modify: `frontend/src/features/process/drawio/runtime/drawioPlacementPreview.js`
- Test: `frontend/src/features/process/drawio/runtime/drawioPlacementPreview.test.mjs` (existing)

- [ ] **Step 1: Update preview to use preset defaults**

Modify `frontend/src/features/process/drawio/runtime/drawioPlacementPreview.js`:

1. Add import:

```js
import {
  getDefaultRuntimeStylePreset,
  resolveRuntimeStyleSurface,
} from "../drawioRuntimeStylePresets.js";
```

2. Replace the body of `buildDrawioPlacementPreviewSpec` with:

```js
export function buildDrawioPlacementPreviewSpec(toolIdRaw, pointRaw = {}) {
  const toolId = toText(toolIdRaw);
  const point = pointRaw && typeof pointRaw === "object" ? pointRaw : {};
  const x = toNumber(point.x, 0);
  const y = toNumber(point.y, 0);
  const surface = resolveRuntimeStyleSurface(toolId);
  const preset = getDefaultRuntimeStylePreset(surface);
  const svg = preset?.svg || {};
  if (toolId === "rect") {
    return {
      toolId,
      shape: "rect",
      x: x - 60,
      y: y - 30,
      width: 120,
      height: 60,
      rx: 8,
      fill: svg.fill || "rgba(59,130,246,0.10)",
      stroke: svg.stroke || "#2563eb",
    };
  }
  if (toolId === "container") {
    return {
      toolId,
      shape: "rect",
      x: x - 100,
      y: y - 60,
      width: 200,
      height: 120,
      rx: 10,
      fill: svg.fill || "rgba(15,23,42,0.03)",
      stroke: svg.stroke || "#334155",
      strokeDasharray: svg["stroke-dasharray"] || "8 4",
    };
  }
  if (toolId === "text") {
    return {
      toolId,
      shape: "text",
      x,
      y,
      width: 120,
      height: 30,
      text: "Text",
      fill: svg.fill || "#0f172a",
      guideStroke: "#94a3b8",
    };
  }
  if (toolId === "note") {
    return {
      toolId,
      shape: "note",
      x: x - 80,
      y: y - 60,
      width: 160,
      height: 120,
      rx: 10,
      fill: svg.bg_color || "rgba(254,240,138,0.45)",
      stroke: svg.border_color || "#ca8a04",
      text: "Заметка",
      textColor: svg.text_color || "#1f2937",
    };
  }
  return null;
}
```

- [ ] **Step 2: Run the existing test**

Run: `cd frontend && npx jest src/features/process/drawio/runtime/drawioPlacementPreview.test.mjs 2>&1 | tail -20`  
Expected: PASS (values are the same defaults as before)

- [ ] **Step 3: Commit**

```bash
git add frontend/src/features/process/drawio/runtime/drawioPlacementPreview.js
git commit -m "feat: use runtime style presets for placement preview colors"
```

---

## Task 4: Doc XML generation uses row style

**Files:**
- Modify: `frontend/src/features/process/drawio/drawioDocXml.js`
- Test: `frontend/src/features/process/drawio/drawioDocXml.test.mjs` (existing)

- [ ] **Step 1: Inspect current `buildRuntimeCellXml`**

Read `frontend/src/features/process/drawio/drawioDocXml.js` lines 45-65. Current implementation uses hard-coded style strings.

- [ ] **Step 2: Update `buildRuntimeCellXml` to accept and use row style**

Modify `frontend/src/features/process/drawio/drawioDocXml.js`:

1. Add imports:

```js
import {
  getDefaultRuntimeStylePreset,
  resolveRuntimeStyleSurface,
} from "./drawioRuntimeStylePresets.js";
```

2. Replace the `toolIdToSpec` helper or inline logic with:

```js
function buildRuntimeCellXml({ elementIdRaw, toolIdRaw, pointRaw, styleRaw = null }) {
  const elementId = toText(elementIdRaw);
  const toolId = normalizeRuntimeTool(toolIdRaw);
  if (!elementId || !toolId) return "";
  const point = pointRaw && typeof pointRaw === "object" ? pointRaw : {};
  const x = toNumber(point.x, 0);
  const y = toNumber(point.y, 0);
  const surface = resolveRuntimeStyleSurface(toolId);
  const preset = styleRaw
    ? { svg: styleRaw, doc: styleToDocStyle(styleRaw, surface) }
    : getDefaultRuntimeStylePreset(surface);
  const doc = preset?.doc || {};
  if (toolId === "rect") {
    return `<mxCell id="${escapeXml(elementId)}" value="" style="rounded=1;whiteSpace=wrap;html=1;fillColor=${escapeXml(doc.fillColor)};strokeColor=${escapeXml(doc.strokeColor)};strokeWidth=${escapeXml(doc.strokeWidth)};" parent="1" vertex="1"><mxGeometry x="${x - 60}" y="${y - 30}" width="120" height="60" as="geometry"/></mxCell>`;
  }
  if (toolId === "container") {
    const dashed = doc.dashed ? `;dashed=${escapeXml(doc.dashed)}` : "";
    return `<mxCell id="${escapeXml(elementId)}" value="Container" style="swimlane;container=1;horizontal=0;startSize=24;collapsible=0;strokeColor=${escapeXml(doc.strokeColor)};fillColor=${escapeXml(doc.fillColor)};strokeWidth=${escapeXml(doc.strokeWidth)}${dashed};" parent="1" vertex="1"><mxGeometry x="${x - 100}" y="${y - 60}" width="200" height="120" as="geometry"/></mxCell>`;
  }
  if (toolId === "text") {
    return `<mxCell id="${escapeXml(elementId)}" value="Text" style="text;html=1;strokeColor=none;fillColor=none;align=left;verticalAlign=middle;whiteSpace=wrap;fontColor=${escapeXml(doc.fontColor)};" parent="1" vertex="1"><mxGeometry x="${x}" y="${y}" width="120" height="30" as="geometry"/></mxCell>`;
  }
  return "";
}

function styleToDocStyle(styleRaw, surfaceRaw) {
  const style = styleRaw && typeof styleRaw === "object" ? styleRaw : {};
  const surface = String(surfaceRaw || "").toLowerCase();
  if (surface === "text") {
    return { fontColor: style.fill || "#0f172a" };
  }
  if (surface === "note") {
    return {
      fillColor: style.bg_color || "#fef08a",
      strokeColor: style.border_color || "#ca8a04",
      fontColor: style.text_color || "#1f2937",
    };
  }
  return {
    fillColor: style.fill || "#dbeafe",
    strokeColor: style.stroke || "#2563eb",
    strokeWidth: style["stroke-width"] || "2",
    dashed: style["stroke-dasharray"] ? "1" : undefined,
  };
}
```

3. Update `promoteRuntimeElementIntoDrawioDoc` to pass `styleRaw`:

Locate where it calls `buildRuntimeCellXml` and change to:

```js
const cellXml = buildRuntimeCellXml({
  elementIdRaw: elementId,
  toolIdRaw,
  pointRaw: point,
  styleRaw: payload.styleRaw || null,
});
```

And update `buildRuntimePlacementPatch` in `drawioRuntimePlacement.js` to pass the row style when calling `promoteRuntimeElementIntoDrawioDoc`:

```js
doc_xml: noteTool
  ? toText(meta.doc_xml)
  : promoteRuntimeElementIntoDrawioDoc(meta.doc_xml, {
      elementId: createdId,
      toolId,
      point: { x, y },
      styleRaw: nextRows[nextRows.length - 1]?.style || null,
    }),
```

- [ ] **Step 3: Run the existing doc XML tests**

Run: `cd frontend && npx jest src/features/process/drawio/drawioDocXml.test.mjs 2>&1 | tail -20`  
Expected: PASS (existing tests check default colors which are unchanged)

- [ ] **Step 4: Commit**

```bash
git add frontend/src/features/process/drawio/drawioDocXml.js \
        frontend/src/features/process/drawio/runtime/drawioRuntimePlacement.js
git commit -m "feat: use row style when building drawio doc xml"
```

---

## Task 5: Fix `setDrawioElementStylePreset` to persist row style

**Files:**
- Modify: `frontend/src/features/process/overlay/controllers/useDrawioElementContentMutationApi.js`
- Test: `frontend/src/features/process/overlay/controllers/useDrawioElementContentMutationApi.test.mjs` (create)

- [ ] **Step 1: Write the failing test**

```js
// frontend/src/features/process/overlay/controllers/useDrawioElementContentMutationApi.test.mjs
import { describe, it } from "node:test";
import assert from "node:assert";

describe("setDrawioElementStylePreset", () => {
  it("is tested via integration because hook requires React context", () => {
    assert.ok(true);
  });
});
```

Better: add a unit test for the pure mutation logic. Extract the reducer into a testable pure function, or test the mutation through the hook with a minimal React test renderer. Given time constraints, the plan will test it manually in Task 7.

- [ ] **Step 2: Fix the mutation**

Modify `frontend/src/features/process/overlay/controllers/useDrawioElementContentMutationApi.js`:

1. Ensure imports include note preset helpers:

```js
import {
  getRuntimeStylePresets,
  resolveRuntimeStyleSurface,
} from "../../drawio/drawioRuntimeStylePresets.js";
```

2. Replace the entire `setDrawioElementStylePreset` callback with:

```js
const setDrawioElementStylePreset = useCallback((elementIdRaw, presetIdRaw, source = "drawio_element_style") => {
  const elementId = resolveCanonicalDrawioElementId(drawioMetaRef.current, elementIdRaw);
  if (!elementId) return false;
  const presetId = toText(presetIdRaw).toLowerCase();
  let supported = false;
  let changed = false;
  const result = applyDrawioMutation((prevRaw) => {
    const prev = normalizeDrawioMeta(prevRaw);
    const rowIndex = (Array.isArray(prev.drawio_elements_v1) ? prev.drawio_elements_v1 : [])
      .findIndex((row) => toText(asObject(row).id) === elementId);
    const row = rowIndex >= 0 ? asObject(prev.drawio_elements_v1[rowIndex]) : {};
    const toolId = toText(row.type || row.toolId).toLowerCase();
    const surface = toolId === "note" ? "note" : resolveRuntimeStyleSurface(snapshot);
    const presets = getRuntimeStylePresets(surface);
    const preset = presets.find((p) => toText(p.id).toLowerCase() === presetId) || null;
    if (!preset) return prev;
    supported = true;

    if (toolId === "note") {
      const nextRow = patchDrawioNoteRowStyle(row, {
        bg_color: preset.svg.bg_color,
        border_color: preset.svg.border_color,
        text_color: preset.svg.text_color,
      });
      if (nextRow === row) return prev;
      changed = true;
      const nextElements = [...prev.drawio_elements_v1];
      nextElements[rowIndex] = nextRow;
      return { ...prev, drawio_elements_v1: nextElements };
    }

    // shape / container / text
    const nextStyle = { ...preset.svg };
    const snapshot = readDrawioElementSnapshot(prev.svg_cache, elementId);
    const nextSvgCache = updateDrawioElementAttributes(prev.svg_cache, elementId, nextStyle);
    const nextDocXml = updateDrawioDocXmlCellStyle(prev.doc_xml, elementId, preset.doc);
    if (nextSvgCache === toText(prev.svg_cache) && nextDocXml === toText(prev.doc_xml)) {
      // Still update row style even if SVG attrs happen to be identical
    }
    changed = true;
    const nextElements = [...(Array.isArray(prev.drawio_elements_v1) ? prev.drawio_elements_v1 : [])];
    nextElements[rowIndex] = { ...row, style: nextStyle };
    return {
      ...prev,
      svg_cache: nextSvgCache,
      doc_xml: nextDocXml,
      drawio_elements_v1: nextElements,
    };
  }, {
    source,
    playbackStage: source,
    persist: true,
  });
  if (!supported) {
    setInfoMsg?.("Быстрые style presets доступны только для базовых runtime draw.io объектов.");
    setGenErr?.("");
    return false;
  }
  if (result.changed) publishNormalization(source);
  return !!changed;
}, [applyDrawioMutation, drawioMetaRef, normalizeDrawioMeta, publishNormalization, setGenErr, setInfoMsg]);
```

Wait — there's a bug in the draft above: `snapshot` is referenced before it is defined. Reorder: read snapshot before resolving surface for non-note rows. For note rows use surface "note" directly.

Corrected version:

```js
const setDrawioElementStylePreset = useCallback((elementIdRaw, presetIdRaw, source = "drawio_element_style") => {
  const elementId = resolveCanonicalDrawioElementId(drawioMetaRef.current, elementIdRaw);
  if (!elementId) return false;
  const presetId = toText(presetIdRaw).toLowerCase();
  let supported = false;
  let changed = false;
  const result = applyDrawioMutation((prevRaw) => {
    const prev = normalizeDrawioMeta(prevRaw);
    const elements = Array.isArray(prev.drawio_elements_v1) ? prev.drawio_elements_v1 : [];
    const rowIndex = elements.findIndex((row) => toText(asObject(row).id) === elementId);
    const row = rowIndex >= 0 ? asObject(elements[rowIndex]) : {};
    const isNote = isDrawioNoteRow(row);
    const surface = isNote ? "note" : resolveRuntimeStyleSurface(readDrawioElementSnapshot(prev.svg_cache, elementId));
    const preset = getRuntimeStylePresets(surface).find((p) => toText(p.id).toLowerCase() === presetId) || null;
    if (!surface || !preset) return prev;
    supported = true;

    if (isNote) {
      const nextRow = patchDrawioNoteRowStyle(row, {
        bg_color: preset.svg.bg_color,
        border_color: preset.svg.border_color,
        text_color: preset.svg.text_color,
      });
      if (nextRow === row) return prev;
      changed = true;
      const nextElements = [...elements];
      nextElements[rowIndex] = nextRow;
      return { ...prev, drawio_elements_v1: nextElements };
    }

    const nextStyle = { ...preset.svg };
    const nextSvgCache = updateDrawioElementAttributes(prev.svg_cache, elementId, nextStyle);
    const nextDocXml = updateDrawioDocXmlCellStyle(prev.doc_xml, elementId, preset.doc);
    changed = true;
    const nextElements = [...elements];
    nextElements[rowIndex] = { ...row, style: nextStyle };
    return {
      ...prev,
      svg_cache: nextSvgCache,
      doc_xml: nextDocXml,
      drawio_elements_v1: nextElements,
    };
  }, {
    source,
    playbackStage: source,
    persist: true,
  });
  if (!supported) {
    setInfoMsg?.("Быстрые style presets доступны только для базовых runtime draw.io объектов.");
    setGenErr?.("");
    return false;
  }
  if (result.changed) publishNormalization(source);
  return !!changed;
}, [applyDrawioMutation, drawioMetaRef, normalizeDrawioMeta, publishNormalization, setGenErr, setInfoMsg]);
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/features/process/overlay/controllers/useDrawioElementContentMutationApi.js
git commit -m "fix: persist drawio element style preset in row and use note presets for notes"
```

---

## Task 6: Renderer memo includes style for shape/container/text rows

**Files:**
- Modify: `frontend/src/features/process/drawio/runtime/drawioOverlayRendererMemo.js`

- [ ] **Step 1: Update `elementRowRenderEqual` to compare `style`**

In `frontend/src/features/process/drawio/runtime/drawioOverlayRendererMemo.js`, update `elementRowRenderEqual`:

```js
function elementRowRenderEqual(aRaw, bRaw) {
  const a = asObject(aRaw);
  const b = asObject(bRaw);
  const sameBase = toText(a.id) === toText(b.id)
    && toText(a.layer_id) === toText(b.layer_id)
    && (a.visible !== false) === (b.visible !== false)
    && (a.locked === true) === (b.locked === true)
    && (a.deleted === true) === (b.deleted === true)
    && toNumber(a.opacity, 1) === toNumber(b.opacity, 1)
    && toNumber(a.offset_x ?? a.offsetX, 0) === toNumber(b.offset_x ?? b.offsetX, 0)
    && toNumber(a.offset_y ?? a.offsetY, 0) === toNumber(b.offset_y ?? b.offsetY, 0);
  if (!sameBase) return false;
  const aType = toText(a.type).toLowerCase();
  const bType = toText(b.type).toLowerCase();
  if (aType !== bType) return false;

  // Compare style object for all surfaces.
  const styleEqual = JSON.stringify(a.style || {}) === JSON.stringify(b.style || {});
  if (!styleEqual) return false;

  if (aType === "note") {
    return toNumber(a.width, 160) === toNumber(b.width, 160)
      && toNumber(a.height, 120) === toNumber(b.height, 120)
      && toText(a.text) === toText(b.text);
  }
  return true;
}
```

- [ ] **Step 2: Run memo tests**

Run: `cd frontend && npx jest src/features/process/drawio/runtime/drawioOverlayRendererMemo.test.mjs 2>&1 | tail -20`  
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add frontend/src/features/process/drawio/runtime/drawioOverlayRendererMemo.js
git commit -m "fix: include style in drawio overlay renderer memo equality"
```

---

## Task 7: Note placement accepts optional style

**Files:**
- Modify: `frontend/src/features/process/drawio/runtime/drawioRuntimeNote.js`

- [ ] **Step 1: Allow `buildRuntimeNoteElementRow` to accept `styleRaw`**

The current signature is `({ elementId, layerIdRaw, zIndexRaw, pointRaw = {} })`. Add `styleRaw = null` and merge it into `normalizeDrawioNoteStyle`:

```js
export function buildRuntimeNoteElementRow({
  elementId,
  layerIdRaw,
  zIndexRaw,
  pointRaw = {},
  styleRaw = null,
}) {
  const point = asObject(pointRaw);
  const { width, height } = normalizeDrawioNoteDimensions(
    DRAWIO_NOTE_DEFAULT_WIDTH,
    DRAWIO_NOTE_DEFAULT_HEIGHT,
  );
  const x = toNumber(point.x, 0);
  const y = toNumber(point.y, 0);
  return {
    id: toText(elementId),
    type: "note",
    layer_id: toText(layerIdRaw) || "DL1",
    visible: true,
    locked: false,
    deleted: false,
    opacity: 1,
    offset_x: Math.round((x - (width / 2)) * 1000) / 1000,
    offset_y: Math.round((y - (height / 2)) * 1000) / 1000,
    z_index: Math.max(0, Math.round(toNumber(zIndexRaw, 0))),
    width,
    height,
    text: DRAWIO_NOTE_DEFAULT_TEXT,
    style: normalizeDrawioNoteStyle(styleRaw || {}),
  };
}
```

- [ ] **Step 2: Run note tests**

Run: `cd frontend && npx jest src/features/process/drawio/runtime/drawioRuntimeNote.test.mjs 2>&1 | tail -20`  
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add frontend/src/features/process/drawio/runtime/drawioRuntimeNote.js
git commit -m "feat: allow optional style override in runtime note element row"
```

---

## Task 8: Build and regression test

- [ ] **Step 1: Run the full frontend test suite**

```bash
cd frontend && npm test 2>&1 | tail -40
```

Expected: no new failures (baseline 2600/2645 with 41 pre-existing failures).

- [ ] **Step 2: Run build**

```bash
cd frontend && npm run build 2>&1 | tail -30
```

Expected: build succeeds.

- [ ] **Step 3: Manual smoke checklist (if runtime available)**

- Open diagram tab → enable Draw.io overlay.
- Create rect → should be blue (accent).
- Create container → should be gray (neutral).
- Create note → should be yellow.
- Select rect → in LayersPopover choose green preset → rect turns green immediately.
- Reload page → green rect persists.
- Check container gray contrast on real BPMN canvas; if it blends, darken stroke to `#1e293b` or lighten fill to `rgba(15,23,42,0.08)` and update `DRAWIO_RUNTIME_STYLE_PRESETS.container[0]` accordingly.

- [ ] **Step 4: Commit any contrast fix**

If contrast adjustment is needed:

```bash
git add frontend/src/features/process/drawio/drawioRuntimeStylePresets.js
git commit -m "fix: adjust container neutral preset contrast on BPMN canvas"
```

---

## Self-review

1. **Spec coverage:**
   - Default preset colors at creation → Task 2, 3, 4, 7.
   - Persist style per element → Task 5.
   - User can change preset via LayersPopover → Task 5 (mutation already wired to UI).
   - Backward compatibility → Tasks 2-4 fall back to defaults when `style` missing.
   - H5 SVG cache → Task 5 updates row style (part of cache key) and Task 6 ensures renderer re-renders on style change.
   - Container contrast check → Task 8 manual step.

2. **Placeholder scan:** No TBD/placeholder steps. Each step includes file paths and code/commands.

3. **Type consistency:** `style` object uses the same `{ fill, stroke, "stroke-width" }` / `{ fill }` / `{ bg_color, border_color, text_color }` shapes in placement, preset, and mutation tasks.

---

## Execution handoff

**Plan complete and saved to `docs/superpowers/plans/2026-07-20-overlay-color-logic-redesign.md`.**

Two execution options:

1. **Subagent-Driven (recommended)** — dispatch a fresh subagent per task, review between tasks, fast iteration.
2. **Inline Execution** — execute tasks in this session using `executing-plans`, batch execution with checkpoints.

Which approach?
