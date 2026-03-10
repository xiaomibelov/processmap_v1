import test from "node:test";
import assert from "node:assert/strict";

import { extractDrawioElementIdsFromSvg } from "./drawioSvg.js";
import {
  drawioDocXmlContainsElementId,
  readDrawioDocXmlCellGeometry,
  updateDrawioDocXmlCellGeometry,
  updateDrawioDocXmlCellStyle,
  updateDrawioDocXmlCellValue,
} from "./drawioDocXml.js";
import { normalizeDrawioMeta, serializeDrawioMeta } from "./drawioMeta.js";
import { buildRuntimePlacementPatch } from "./runtime/drawioRuntimePlacement.js";
import { updateDrawioElementAttributes, updateDrawioTextElementContent } from "./drawioSvg.js";
import { updateRuntimeTextLayout } from "./drawioRuntimeText.js";

function toText(value) {
  return String(value || "").trim();
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function asObject(value) {
  return value && typeof value === "object" ? value : {};
}

function resolvePrimaryLayerId(metaRaw = {}) {
  const meta = asObject(metaRaw);
  const activeLayerId = toText(meta.active_layer_id);
  if (activeLayerId) return activeLayerId;
  const firstLayerId = toText(asObject(asArray(meta.drawio_layers_v1)[0]).id);
  if (firstLayerId) return firstLayerId;
  return "DL1";
}

function buildElementsFromSvgMirror(prevMetaRaw, svgRaw) {
  const prevMeta = asObject(prevMetaRaw);
  const ids = extractDrawioElementIdsFromSvg(svgRaw);
  const prevById = new Map();
  asArray(prevMeta.drawio_elements_v1).forEach((rowRaw) => {
    const row = asObject(rowRaw);
    const id = toText(row.id);
    if (!id || prevById.has(id)) return;
    prevById.set(id, row);
  });
  if (!ids.length) return asArray(prevMeta.drawio_elements_v1);
  const layerId = resolvePrimaryLayerId(prevMeta);
  return ids.map((id, index) => {
    const prev = asObject(prevById.get(id));
    return {
      ...prev,
      id,
      layer_id: toText(prev.layer_id) || layerId,
      visible: prev.visible !== false,
      locked: prev.locked === true,
      deleted: false,
      opacity: Number.isFinite(Number(prev.opacity)) ? Number(prev.opacity) : 1,
      offset_x: Number.isFinite(Number(prev.offset_x ?? prev.offsetX)) ? Number(prev.offset_x ?? prev.offsetX) : 0,
      offset_y: Number.isFinite(Number(prev.offset_y ?? prev.offsetY)) ? Number(prev.offset_y ?? prev.offsetY) : 0,
      z_index: Number.isFinite(Number(prev.z_index)) ? Number(prev.z_index) : index,
    };
  });
}

function svgWith(...ids) {
  const rects = ids.map((id) => `<rect id="${id}" x="0" y="0" width="10" height="10"/>`).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg">${rects}</svg>`;
}

function mxfile(label = "Page-1") {
  return `<mxfile host="app.diagrams.net"><diagram id="page-1" name="${label}"></diagram></mxfile>`;
}

function makeLayer(id = "DL1", overrides = {}) {
  return {
    id,
    name: id === "DL1" ? "Default" : `Layer ${id}`,
    visible: true,
    locked: false,
    opacity: 1,
    ...overrides,
  };
}

function makeElement(id, overrides = {}) {
  return {
    id,
    layer_id: "DL1",
    visible: true,
    locked: false,
    deleted: false,
    opacity: 1,
    offset_x: 0,
    offset_y: 0,
    z_index: 0,
    ...overrides,
  };
}

function byId(metaRaw, id) {
  const meta = normalizeDrawioMeta(metaRaw);
  return asArray(meta.drawio_elements_v1).find((row) => toText(row?.id) === toText(id)) || null;
}

function activeIds(metaRaw) {
  return asArray(normalizeDrawioMeta(metaRaw).drawio_elements_v1)
    .filter((row) => row && row.deleted !== true)
    .map((row) => toText(row.id));
}

test("unified editing contract: existing lineaged id survives runtime -> editor apply -> reload -> runtime continue", () => {
  const initial = normalizeDrawioMeta({
    enabled: true,
    doc_xml: mxfile("lineaged"),
    svg_cache: svgWith("shape1"),
    drawio_layers_v1: [makeLayer("DL1"), makeLayer("DL2")],
    active_layer_id: "DL2",
    drawio_elements_v1: [makeElement("shape1", { layer_id: "DL2", offset_x: 0, offset_y: 0, z_index: 4 })],
  });

  const afterRuntimeMove = normalizeDrawioMeta({
    ...initial,
    drawio_elements_v1: [makeElement("shape1", { layer_id: "DL2", offset_x: 18, offset_y: -4, z_index: 4 })],
  });

  const afterEditorApply = normalizeDrawioMeta({
    ...afterRuntimeMove,
    doc_xml: mxfile("lineaged-after-save"),
    svg_cache: svgWith("shape1"),
    drawio_elements_v1: buildElementsFromSvgMirror(afterRuntimeMove, svgWith("shape1")),
  });

  assert.deepEqual(activeIds(afterEditorApply), ["shape1"]);
  assert.equal(byId(afterEditorApply, "shape1")?.layer_id, "DL2");
  assert.equal(byId(afterEditorApply, "shape1")?.offset_x, 18);
  assert.equal(byId(afterEditorApply, "shape1")?.offset_y, -4);
  assert.equal(byId(afterEditorApply, "shape1")?.deleted, false);

  const reloaded = normalizeDrawioMeta(JSON.parse(serializeDrawioMeta(afterEditorApply)));
  const afterRuntimeContinue = normalizeDrawioMeta({
    ...reloaded,
    drawio_elements_v1: [makeElement("shape1", { layer_id: "DL2", offset_x: 26, offset_y: -4, z_index: 4 })],
  });

  assert.deepEqual(activeIds(afterRuntimeContinue), ["shape1"]);
  assert.equal(byId(afterRuntimeContinue, "shape1")?.layer_id, "DL2");
  assert.equal(byId(afterRuntimeContinue, "shape1")?.offset_x, 26);
  assert.equal(String(afterRuntimeContinue.doc_xml).includes("<mxfile"), true);
  assert.equal(String(afterRuntimeContinue.svg_cache).includes("shape1"), true);
});

test("unified editing contract: full-editor-first id survives runtime continuation and reopen-apply without duplicates", () => {
  const afterEditorAuthor = normalizeDrawioMeta({
    enabled: true,
    doc_xml: mxfile("editor-first"),
    svg_cache: svgWith("shape_alpha"),
    drawio_layers_v1: [makeLayer("DL1"), makeLayer("DL2")],
    active_layer_id: "DL2",
    drawio_elements_v1: buildElementsFromSvgMirror({
      active_layer_id: "DL2",
      drawio_layers_v1: [makeLayer("DL1"), makeLayer("DL2")],
      drawio_elements_v1: [],
    }, svgWith("shape_alpha")).map((row) => ({ ...row, layer_id: "DL2" })),
  });

  const afterRuntimeContinue = normalizeDrawioMeta({
    ...afterEditorAuthor,
    drawio_elements_v1: [
      makeElement("shape_alpha", {
        layer_id: "DL2",
        offset_x: 9,
        offset_y: 3,
        visible: false,
        z_index: 2,
      }),
    ],
  });

  const afterReload = normalizeDrawioMeta(JSON.parse(serializeDrawioMeta(afterRuntimeContinue)));
  const afterEditorReopenApply = normalizeDrawioMeta({
    ...afterReload,
    doc_xml: mxfile("editor-reopen"),
    svg_cache: svgWith("shape_alpha"),
    drawio_elements_v1: buildElementsFromSvgMirror(afterReload, svgWith("shape_alpha")),
  });

  assert.deepEqual(activeIds(afterEditorReopenApply), ["shape_alpha"]);
  assert.equal(byId(afterEditorReopenApply, "shape_alpha")?.layer_id, "DL2");
  assert.equal(byId(afterEditorReopenApply, "shape_alpha")?.offset_x, 9);
  assert.equal(byId(afterEditorReopenApply, "shape_alpha")?.offset_y, 3);
  assert.equal(byId(afterEditorReopenApply, "shape_alpha")?.visible, false);
  assert.equal(byId(afterEditorReopenApply, "shape_alpha")?.deleted, false);
});

test("unified editing contract: runtime-created id enters doc_xml lineage without duplicate rows", () => {
  const patch = buildRuntimePlacementPatch({
    metaRaw: {
      enabled: true,
      doc_xml: mxfile("runtime-gap"),
      svg_cache: "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 400 300\"></svg>",
      drawio_layers_v1: [makeLayer("DL1")],
      active_layer_id: "DL1",
      drawio_elements_v1: [],
    },
    toolIdRaw: "rect",
    pointRaw: { x: 220, y: 140 },
  });

  assert.equal(patch.changed, true);
  assert.equal(String(patch.createdId || "").startsWith("rect_"), true);
  assert.equal(String(patch.meta?.svg_cache || "").includes(String(patch.createdId || "")), true);
  assert.equal(activeIds(patch.meta).includes(String(patch.createdId || "")), true);
  assert.equal(drawioDocXmlContainsElementId(patch.meta?.doc_xml, patch.createdId), true);

  const afterEditorApply = normalizeDrawioMeta({
    ...patch.meta,
    doc_xml: patch.meta.doc_xml,
    svg_cache: svgWith(String(patch.createdId || "")),
    drawio_elements_v1: buildElementsFromSvgMirror(patch.meta, svgWith(String(patch.createdId || ""))),
  });
  const ids = activeIds(afterEditorApply).filter((id) => id === String(patch.createdId || ""));
  assert.equal(ids.length, 1);
});

test("unified editing contract: runtime text edit stays in session-first lineage across reload and editor apply", () => {
  const patch = buildRuntimePlacementPatch({
    metaRaw: {
      enabled: true,
      doc_xml: "",
      svg_cache: "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 400 300\"></svg>",
      drawio_layers_v1: [makeLayer("DL1")],
      active_layer_id: "DL1",
      drawio_elements_v1: [],
    },
    toolIdRaw: "text",
    pointRaw: { x: 180, y: 120 },
  });

  const textId = String(patch.createdId || "");
  const afterRuntimeEdit = normalizeDrawioMeta({
    ...patch.meta,
    svg_cache: updateDrawioTextElementContent(patch.meta.svg_cache, textId, "Session-first label"),
    doc_xml: updateDrawioDocXmlCellValue(patch.meta.doc_xml, textId, "Session-first label"),
    drawio_elements_v1: asArray(patch.meta.drawio_elements_v1).map((row) => (
      toText(row?.id) === textId
        ? { ...row, text: "Session-first label", label: "Session-first label" }
        : row
    )),
  });

  assert.equal(String(afterRuntimeEdit.svg_cache).includes("Session-first label"), true);
  assert.equal(String(afterRuntimeEdit.doc_xml).includes("Session-first label"), true);
  assert.equal(byId(afterRuntimeEdit, textId)?.text, "Session-first label");

  const afterReload = normalizeDrawioMeta(JSON.parse(serializeDrawioMeta(afterRuntimeEdit)));
  const afterEditorApply = normalizeDrawioMeta({
    ...afterReload,
    drawio_elements_v1: buildElementsFromSvgMirror(afterReload, afterReload.svg_cache),
  });

  assert.equal(activeIds(afterEditorApply).includes(textId), true);
  assert.equal(byId(afterEditorApply, textId)?.text, "Session-first label");
  assert.equal(String(afterEditorApply.doc_xml).includes("Session-first label"), true);
  assert.equal(String(afterEditorApply.svg_cache).includes("Session-first label"), true);
});

test("unified editing contract: runtime text width adjust stays wrapping-safe across reload and editor apply", () => {
  const patch = buildRuntimePlacementPatch({
    metaRaw: {
      enabled: true,
      doc_xml: "",
      svg_cache: "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 400 300\"></svg>",
      drawio_layers_v1: [makeLayer("DL1")],
      active_layer_id: "DL1",
      drawio_elements_v1: [],
    },
    toolIdRaw: "text",
    pointRaw: { x: 180, y: 120 },
  });

  const textId = String(patch.createdId || "");
  const afterRuntimeEdit = normalizeDrawioMeta({
    ...patch.meta,
    svg_cache: updateDrawioTextElementContent(patch.meta.svg_cache, textId, "This is a longer session first text label"),
    doc_xml: updateDrawioDocXmlCellValue(patch.meta.doc_xml, textId, "This is a longer session first text label"),
  });
  const resizedLayout = updateRuntimeTextLayout(afterRuntimeEdit.svg_cache, textId, {
    widthRaw: 88,
    docGeometryRaw: readDrawioDocXmlCellGeometry(afterRuntimeEdit.doc_xml, textId),
  });
  const afterWidthAdjust = normalizeDrawioMeta({
    ...afterRuntimeEdit,
    svg_cache: resizedLayout.svg,
    doc_xml: updateDrawioDocXmlCellGeometry(afterRuntimeEdit.doc_xml, textId, {
      width: resizedLayout.state?.width,
      height: resizedLayout.state?.height,
    }),
  });

  assert.equal(drawioDocXmlContainsElementId(afterWidthAdjust.doc_xml, textId), true);
  assert.equal(String(afterWidthAdjust.doc_xml).includes('width="88"'), true);
  assert.equal(String(afterWidthAdjust.svg_cache).includes('data-drawio-text-width="88"'), true);
  assert.equal(String(afterWidthAdjust.svg_cache).includes("<tspan"), true);

  const afterReload = normalizeDrawioMeta(JSON.parse(serializeDrawioMeta(afterWidthAdjust)));
  const afterEditorApply = normalizeDrawioMeta({
    ...afterReload,
    drawio_elements_v1: buildElementsFromSvgMirror(afterReload, afterReload.svg_cache),
  });

  assert.equal(activeIds(afterEditorApply).filter((id) => id === textId).length, 1);
  assert.equal(String(afterEditorApply.svg_cache).includes('data-drawio-text-width="88"'), true);
  assert.equal(String(afterEditorApply.doc_xml).includes('width="88"'), true);
});

test("unified editing contract: runtime style preset stays on same shape lineage across reload", () => {
  const patch = buildRuntimePlacementPatch({
    metaRaw: {
      enabled: true,
      doc_xml: "",
      svg_cache: "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 400 300\"></svg>",
      drawio_layers_v1: [makeLayer("DL1")],
      active_layer_id: "DL1",
      drawio_elements_v1: [],
    },
    toolIdRaw: "rect",
    pointRaw: { x: 220, y: 140 },
  });

  const shapeId = String(patch.createdId || "");
  const afterRuntimeStyle = normalizeDrawioMeta({
    ...patch.meta,
    svg_cache: updateDrawioElementAttributes(patch.meta.svg_cache, shapeId, {
      fill: "rgba(16,185,129,0.20)",
      stroke: "#059669",
      "stroke-width": "2",
    }),
    doc_xml: updateDrawioDocXmlCellStyle(patch.meta.doc_xml, shapeId, {
      fillColor: "#d1fae5",
      strokeColor: "#059669",
      strokeWidth: "2",
    }),
  });

  assert.equal(activeIds(afterRuntimeStyle).includes(shapeId), true);
  assert.equal(String(afterRuntimeStyle.svg_cache).includes("rgba(16,185,129,0.20)"), true);
  assert.equal(String(afterRuntimeStyle.doc_xml).includes("fillColor=#d1fae5"), true);

  const afterReload = normalizeDrawioMeta(JSON.parse(serializeDrawioMeta(afterRuntimeStyle)));
  assert.equal(activeIds(afterReload).includes(shapeId), true);
  assert.equal(String(afterReload.svg_cache).includes("rgba(16,185,129,0.20)"), true);
  assert.equal(String(afterReload.doc_xml).includes("fillColor=#d1fae5"), true);
});

test("unified editing contract: runtime resize stays on same shape lineage across reload and editor apply", () => {
  const patch = buildRuntimePlacementPatch({
    metaRaw: {
      enabled: true,
      doc_xml: "",
      svg_cache: "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 400 300\"></svg>",
      drawio_layers_v1: [makeLayer("DL1")],
      active_layer_id: "DL1",
      drawio_elements_v1: [],
    },
    toolIdRaw: "rect",
    pointRaw: { x: 220, y: 140 },
  });

  const shapeId = String(patch.createdId || "");
  const afterRuntimeResize = normalizeDrawioMeta({
    ...patch.meta,
    svg_cache: updateDrawioElementAttributes(patch.meta.svg_cache, shapeId, {
      width: "240",
      height: "96",
    }),
    doc_xml: updateDrawioDocXmlCellGeometry(patch.meta.doc_xml, shapeId, {
      width: 240,
      height: 96,
    }),
  });

  assert.equal(activeIds(afterRuntimeResize).includes(shapeId), true);
  assert.equal(String(afterRuntimeResize.svg_cache).includes('width="240"'), true);
  assert.equal(String(afterRuntimeResize.doc_xml).includes('height="96"'), true);
  assert.equal(drawioDocXmlContainsElementId(afterRuntimeResize.doc_xml, shapeId), true);

  const afterReload = normalizeDrawioMeta(JSON.parse(serializeDrawioMeta(afterRuntimeResize)));
  const afterEditorApply = normalizeDrawioMeta({
    ...afterReload,
    drawio_elements_v1: buildElementsFromSvgMirror(afterReload, afterReload.svg_cache),
  });

  assert.equal(activeIds(afterEditorApply).filter((id) => id === shapeId).length, 1);
  assert.equal(String(afterEditorApply.svg_cache).includes('height="96"'), true);
  assert.equal(String(afterEditorApply.doc_xml).includes('width="240"'), true);
});
