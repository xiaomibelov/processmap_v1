import test from "node:test";
import assert from "node:assert/strict";
import {
  setElementLocked,
  setElementVisible,
  updateElementStyle,
  updateElementText,
} from "../hybridUpdate.js";

const baseDoc = {
  layers: [{ id: "L1", name: "Hybrid", visible: true, locked: false, opacity: 1 }],
  elements: [
    {
      id: "E1",
      layer_id: "L1",
      type: "rect",
      x: 10,
      y: 10,
      w: 120,
      h: 60,
      text: "",
      visible: true,
      locked: false,
      style: { stroke: "#111", fill: "#fff" },
    },
    { id: "E2", layer_id: "L1", type: "rect", x: 220, y: 10, w: 120, h: 60, text: "B", visible: true, locked: false },
  ],
  edges: [
    { id: "A1", layer_id: "L1", type: "arrow", from: { element_id: "E1" }, to: { element_id: "E2" }, visible: true, locked: false },
  ],
};

test("updateElementText changes only target element", () => {
  const out = updateElementText(baseDoc, "E1", "Hello");
  assert.equal(out.elements.find((row) => row.id === "E1")?.text, "Hello");
  assert.equal(out.elements.find((row) => row.id === "E2")?.text, "B");
});

test("setElementVisible updates visibility by id", () => {
  const out = setElementVisible(baseDoc, "E1", false);
  assert.equal(out.elements.find((row) => row.id === "E1")?.visible, false);
  assert.equal(out.elements.find((row) => row.id === "E2")?.visible, true);
  const edgeOut = setElementVisible(baseDoc, "A1", false);
  assert.equal(edgeOut.edges.find((row) => row.id === "A1")?.visible, false);
});

test("setElementLocked updates lock by id", () => {
  const out = setElementLocked(baseDoc, "E1", true);
  assert.equal(out.layers.find((row) => row.id === "L1")?.locked, true);
});

test("updateElementStyle patches style only for target element", () => {
  const out = updateElementStyle(baseDoc, "E1", { fill: "#000", radius: 12 });
  const style = out.elements.find((row) => row.id === "E1")?.style;
  assert.equal(style?.fill, "#000");
  assert.equal(style?.stroke, "#111");
  assert.equal(style?.radius, 12);
  assert.equal(out.elements.find((row) => row.id === "E2")?.style?.fill, "#f8fafc");
});
