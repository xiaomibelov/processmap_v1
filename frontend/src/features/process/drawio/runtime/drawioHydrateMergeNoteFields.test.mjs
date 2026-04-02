import test from "node:test";
import assert from "node:assert/strict";

import mergeDrawioHydrateDeletions from "./drawioHydrateMergeDeletions.js";
import mergeDrawioHydrateNoteFields from "./drawioHydrateMergeNoteFields.js";

test("merge note fields when incoming row lost note semantics", () => {
  const merged = mergeDrawioHydrateNoteFields({
    current: {
      drawio_elements_v1: [{
        id: "note_1",
        type: "note",
        text: "Локальный текст",
        width: 220,
        height: 140,
        style: {
          bg_color: "#fde68a",
          border_color: "#b45309",
          text_color: "#111827",
        },
      }],
    },
    incoming: {
      drawio_elements_v1: [{
        id: "note_1",
        deleted: false,
      }],
    },
  });
  const row = merged.drawio_elements_v1[0];
  assert.equal(row.type, "note");
  assert.equal(row.text, "Локальный текст");
  assert.equal(row.width, 220);
  assert.equal(row.height, 140);
  assert.deepEqual(row.style, {
    bg_color: "#fde68a",
    border_color: "#b45309",
    text_color: "#111827",
  });
});

test("preserve explicit empty text via explicit-empty signal when local normalized row has no text field", () => {
  const merged = mergeDrawioHydrateNoteFields({
    current: {
      drawio_elements_v1: [{
        id: "note_1",
        type: "note",
        width: 180,
        height: 110,
        style: {
          bg_color: "#fef08a",
          border_color: "#ca8a04",
          text_color: "#1f2937",
        },
      }],
    },
    incoming: {
      drawio_elements_v1: [{
        id: "note_1",
        deleted: false,
      }],
    },
    explicitEmptyNoteIds: ["note_1"],
  });
  const row = merged.drawio_elements_v1[0];
  assert.equal(row.type, "note");
  assert.equal(Object.prototype.hasOwnProperty.call(row, "text"), true);
  assert.equal(row.text, "");
});

test("do not inject empty text when local note has missing text and no explicit-empty signal", () => {
  const merged = mergeDrawioHydrateNoteFields({
    current: {
      drawio_elements_v1: [{
        id: "note_1",
        type: "note",
        width: 180,
        height: 110,
        style: {
          bg_color: "#fef08a",
          border_color: "#ca8a04",
          text_color: "#1f2937",
        },
      }],
    },
    incoming: {
      drawio_elements_v1: [{
        id: "note_1",
        deleted: false,
      }],
    },
  });
  const row = merged.drawio_elements_v1[0];
  assert.equal(row.type, "note");
  assert.equal(Object.prototype.hasOwnProperty.call(row, "text"), false);
});

test("incoming row that already has note fields remains unchanged", () => {
  const incoming = {
    drawio_elements_v1: [{
      id: "note_1",
      type: "note",
      text: "Incoming",
      width: 200,
      height: 120,
      style: {
        bg_color: "#fef08a",
        border_color: "#ca8a04",
        text_color: "#1f2937",
      },
    }],
  };
  const merged = mergeDrawioHydrateNoteFields({
    current: {
      drawio_elements_v1: [{
        id: "note_1",
        type: "note",
        text: "Local",
        width: 300,
        height: 240,
        style: {
          bg_color: "#000000",
          border_color: "#111111",
          text_color: "#222222",
        },
      }],
    },
    incoming,
  });
  assert.equal(merged, incoming);
});

test("safe no-op when incoming has no matching row for local note", () => {
  const incoming = {
    drawio_elements_v1: [{ id: "shape_1", deleted: false }],
  };
  const merged = mergeDrawioHydrateNoteFields({
    current: {
      drawio_elements_v1: [{ id: "note_1", type: "note", text: "A" }],
    },
    incoming,
  });
  assert.equal(merged, incoming);
});

test("non-note rows are untouched", () => {
  const incoming = {
    drawio_elements_v1: [
      { id: "shape_1", deleted: false, visible: true },
      { id: "shape_2", deleted: true, visible: false },
    ],
  };
  const merged = mergeDrawioHydrateNoteFields({
    current: {
      drawio_elements_v1: [{ id: "note_1", type: "note", text: "A" }],
    },
    incoming,
  });
  assert.equal(merged, incoming);
});

test("deleted note composes correctly with deletion merge", () => {
  const incomingWithNoteFields = mergeDrawioHydrateNoteFields({
    current: {
      drawio_elements_v1: [{
        id: "note_1",
        type: "note",
        deleted: true,
        text: "",
        width: 160,
        height: 120,
        style: {
          bg_color: "#fef08a",
          border_color: "#ca8a04",
          text_color: "#1f2937",
        },
      }],
    },
    incoming: {
      drawio_elements_v1: [{ id: "note_1", deleted: false }],
    },
  });
  const merged = mergeDrawioHydrateDeletions({
    current: {
      drawio_elements_v1: [{ id: "note_1", type: "note", deleted: true, text: "" }],
    },
    incoming: incomingWithNoteFields,
  });
  const row = merged.drawio_elements_v1[0];
  assert.equal(row.type, "note");
  assert.equal(row.deleted, true);
  assert.equal(row.text, "");
});

test("empty local state returns incoming unchanged", () => {
  const incoming = {
    drawio_elements_v1: [{ id: "note_1", deleted: false }],
  };
  const merged = mergeDrawioHydrateNoteFields({
    current: { drawio_elements_v1: [] },
    incoming,
  });
  assert.equal(merged, incoming);
});
