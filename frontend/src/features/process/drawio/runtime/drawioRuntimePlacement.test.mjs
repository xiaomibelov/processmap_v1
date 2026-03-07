import test from "node:test";
import assert from "node:assert/strict";

import { buildRuntimePlacementPatch, normalizeRuntimeTool } from "./drawioRuntimePlacement.js";

test("drawio runtime placement: normalize tool keeps only supported runtime tools", () => {
  assert.equal(normalizeRuntimeTool("rect"), "rect");
  assert.equal(normalizeRuntimeTool("text"), "text");
  assert.equal(normalizeRuntimeTool("container"), "container");
  assert.equal(normalizeRuntimeTool("ellipse"), "");
});

test("drawio runtime placement: patch appends svg node and meta row", () => {
  const patch = buildRuntimePlacementPatch({
    metaRaw: {
      enabled: true,
      interaction_mode: "edit",
      active_tool: "select",
      svg_cache: "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 400 300\"></svg>",
      drawio_layers_v1: [{ id: "DL1", name: "Default", visible: true, locked: false, opacity: 1 }],
      drawio_elements_v1: [],
    },
    toolIdRaw: "rect",
    pointRaw: { x: 220, y: 140 },
  });
  assert.equal(patch.changed, true);
  assert.equal(String(patch.createdId || "").startsWith("rect_"), true);
  assert.equal(String(patch.meta?.svg_cache || "").includes(String(patch.createdId || "")), true);
  const rows = Array.isArray(patch.meta?.drawio_elements_v1) ? patch.meta.drawio_elements_v1 : [];
  assert.equal(rows.some((row) => String(row?.id || "") === String(patch.createdId || "")), true);
  assert.equal(String(patch.meta?.active_tool || ""), "rect");
});

