import test from "node:test";
import assert from "node:assert/strict";

import mergeDrawioHydrateDeletions from "./drawioHydrateMergeDeletions.js";

test("merge local deleted:true flags into incoming rows", () => {
  const merged = mergeDrawioHydrateDeletions({
    current: {
      drawio_elements_v1: [{ id: "shapeA", deleted: true }],
    },
    incoming: {
      drawio_elements_v1: [{ id: "shapeA", deleted: false }],
    },
  });
  assert.equal(merged.drawio_elements_v1[0].deleted, true);
});

test("preserve incoming new elements while merging deletions", () => {
  const merged = mergeDrawioHydrateDeletions({
    current: {
      drawio_elements_v1: [{ id: "shapeA", deleted: true }],
    },
    incoming: {
      drawio_elements_v1: [
        { id: "shapeA", deleted: false },
        { id: "shapeNew", deleted: false },
      ],
    },
  });
  const ids = merged.drawio_elements_v1.map((row) => row.id);
  assert.deepEqual(ids.sort(), ["shapeA", "shapeNew"]);
  assert.equal(merged.drawio_elements_v1.find((row) => row.id === "shapeNew")?.deleted, false);
});

test("preserve incoming deleted:true rows", () => {
  const merged = mergeDrawioHydrateDeletions({
    current: {
      drawio_elements_v1: [{ id: "shapeA", deleted: true }],
    },
    incoming: {
      drawio_elements_v1: [{ id: "shapeA", deleted: true }],
    },
  });
  assert.equal(merged.drawio_elements_v1[0].deleted, true);
});

test("no-op when current has no deleted rows", () => {
  const incoming = {
    drawio_elements_v1: [{ id: "shapeA", deleted: false }],
  };
  const merged = mergeDrawioHydrateDeletions({
    current: {
      drawio_elements_v1: [{ id: "shapeA", deleted: false }],
    },
    incoming,
  });
  assert.equal(merged, incoming);
});

test("append local deleted row when absent from incoming array", () => {
  const merged = mergeDrawioHydrateDeletions({
    current: {
      drawio_elements_v1: [{ id: "shapeDeleted", deleted: true, layer_id: "DL1" }],
    },
    incoming: {
      drawio_elements_v1: [{ id: "shapeVisible", deleted: false }],
    },
  });
  const byId = new Map(merged.drawio_elements_v1.map((row) => [row.id, row]));
  assert.equal(byId.get("shapeDeleted")?.deleted, true);
  assert.equal(byId.get("shapeVisible")?.deleted, false);
});
