import test from "node:test";
import assert from "node:assert/strict";

import { normalizeDrawioMeta } from "../drawioMeta.js";
import { getDrawioRenderableIdSet } from "../domain/drawioSelectors.js";
import { buildRuntimePlacementPatch } from "./drawioRuntimePlacement.js";
import {
  buildDrawioNoteFallbackText,
  buildDrawioNoteTextLines,
  isDrawioNoteRow,
  normalizeDrawioNoteRow,
  patchDrawioNoteRowSize,
  patchDrawioNoteRowText,
} from "./drawioRuntimeNote.js";

function createBaseMeta(overrides = {}) {
  return {
    enabled: true,
    interaction_mode: "edit",
    active_tool: "select",
    doc_xml: "<mxfile host=\"ProcessMap\" version=\"1\"><diagram id=\"page-1\" name=\"Page-1\"><mxGraphModel><root><mxCell id=\"0\"/><mxCell id=\"1\" parent=\"0\"/></root></mxGraphModel></diagram></mxfile>",
    svg_cache: "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 800 600\"></svg>",
    drawio_layers_v1: [{ id: "DL1", name: "Default", visible: true, locked: false, opacity: 1 }],
    drawio_elements_v1: [],
    ...overrides,
  };
}

test("drawio sticky note: create note adds runtime note row", () => {
  const patch = buildRuntimePlacementPatch({
    metaRaw: createBaseMeta(),
    toolIdRaw: "note",
    pointRaw: { x: 240, y: 180 },
  });
  assert.equal(patch.changed, true);
  const rows = Array.isArray(patch.meta?.drawio_elements_v1) ? patch.meta.drawio_elements_v1 : [];
  assert.equal(rows.length, 1);
  assert.equal(isDrawioNoteRow(rows[0]), true);
});

test("drawio sticky note: edit text keeps value in persisted row", () => {
  const row = normalizeDrawioNoteRow({ id: "note_1", type: "note", text: "До" });
  const next = patchDrawioNoteRowText(row, "После");
  assert.equal(String(next.text || ""), "После");
  assert.equal(isDrawioNoteRow(next), true);
});

test("drawio sticky note: explicit empty text is preserved", () => {
  const row = normalizeDrawioNoteRow({ id: "note_1", type: "note", text: "" });
  assert.equal(row.text, "");
});

test("drawio sticky note: null/undefined text falls back to default", () => {
  const undefinedTextRow = normalizeDrawioNoteRow({ id: "note_1", type: "note" });
  const nullTextRow = normalizeDrawioNoteRow({ id: "note_2", type: "note", text: null });
  assert.equal(undefinedTextRow.text, "Заметка");
  assert.equal(nullTextRow.text, "Заметка");
});

test("drawio sticky note: drag move updates offset and survives normalize", () => {
  const row = normalizeDrawioNoteRow({ id: "note_1", type: "note", offset_x: 20, offset_y: 40 });
  const moved = { ...row, offset_x: 85, offset_y: 130 };
  const meta = normalizeDrawioMeta(createBaseMeta({ drawio_elements_v1: [moved] }));
  assert.equal(Number(meta.drawio_elements_v1[0].offset_x), 85);
  assert.equal(Number(meta.drawio_elements_v1[0].offset_y), 130);
});

test("drawio sticky note: resize updates width and height", () => {
  const row = normalizeDrawioNoteRow({ id: "note_1", type: "note", width: 160, height: 120 });
  const resized = patchDrawioNoteRowSize(row, { width: 260, height: 180 });
  assert.equal(Number(resized.width), 260);
  assert.equal(Number(resized.height), 180);
});

test("drawio sticky note: toggle off/on keeps note rows", () => {
  const note = normalizeDrawioNoteRow({ id: "note_1", type: "note" });
  const off = normalizeDrawioMeta(createBaseMeta({ enabled: false, drawio_elements_v1: [note] }));
  const on = normalizeDrawioMeta({ ...off, enabled: true });
  assert.equal(on.drawio_elements_v1.length, 1);
  assert.equal(isDrawioNoteRow(on.drawio_elements_v1[0]), true);
});

test("drawio sticky note: hydration normalize keeps note type and style", () => {
  const hydrated = normalizeDrawioMeta(createBaseMeta({
    drawio_elements_v1: [{
      id: "note_1",
      type: "note",
      width: 220,
      height: 140,
      text: "Hydrated",
      style: {
        bg_color: "#fde68a",
        border_color: "#b45309",
        text_color: "#111827",
      },
    }],
  }));
  const row = hydrated.drawio_elements_v1[0];
  assert.equal(String(row.type || ""), "note");
  assert.equal(Number(row.width), 220);
  assert.equal(Number(row.height), 140);
  assert.equal(String(row.style?.bg_color || ""), "#fde68a");
});

test("drawio sticky note: delete keeps soft-delete row marker", () => {
  const note = normalizeDrawioNoteRow({ id: "note_1", type: "note" });
  const deleted = normalizeDrawioMeta(createBaseMeta({
    drawio_elements_v1: [{ ...note, deleted: true }],
  }));
  assert.equal(deleted.drawio_elements_v1.length, 1);
  assert.equal(deleted.drawio_elements_v1[0].deleted, true);
});

test("drawio sticky note: soft-deleted note is excluded from renderable set", () => {
  const renderable = getDrawioRenderableIdSet(createBaseMeta({
    drawio_elements_v1: [{ id: "note_1", type: "note", deleted: true }],
  }));
  assert.equal(renderable?.has("note_1"), false);
});

test("drawio sticky note: non-deleted note remains in renderable set", () => {
  const renderable = getDrawioRenderableIdSet(createBaseMeta({
    drawio_elements_v1: [{ id: "note_1", type: "note", deleted: false }],
  }));
  assert.equal(renderable?.has("note_1"), true);
});

test("drawio sticky note: wrapped multiline text preserves line separators in fallback reader", () => {
  const lines = buildDrawioNoteTextLines("line1\nline2", 90, { padding: 12, fontSize: 14 });
  const fallbackText = buildDrawioNoteFallbackText(null, lines);
  assert.equal(fallbackText, "line1\nline2");
});

test("drawio sticky note: fallback edit text does not collapse multiline separators", () => {
  const lines = buildDrawioNoteTextLines("line1\nline2", 90, { padding: 12, fontSize: 14 });
  const fallbackText = buildDrawioNoteFallbackText(null, lines);
  assert.notEqual(fallbackText, "line1line2");
});
