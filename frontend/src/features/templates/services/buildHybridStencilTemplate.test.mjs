import test from "node:test";
import assert from "node:assert/strict";
import { buildHybridStencilTemplate } from "./buildHybridStencilTemplate.js";

test("buildHybridStencilTemplate builds payload with relative geometry", () => {
  const hybridDoc = {
    elements: [
      { id: "E1", type: "rect", x: 100, y: 200, w: 80, h: 40, style: { fill: "#fff" }, text: "A" },
      { id: "E2", type: "rect", x: 240, y: 260, w: 90, h: 50, style: { fill: "#eee" }, text: "B" },
    ],
    edges: [
      { id: "A1", from: { element_id: "E1" }, to: { element_id: "E2" }, style: { stroke: "#000" } },
    ],
  };
  const out = buildHybridStencilTemplate(["E1", "E2"], hybridDoc, { title: "Stencil" });
  assert.equal(out.ok, true);
  assert.equal(out.template.template_type, "hybrid_stencil_v1");
  assert.equal(out.template.payload.elements.length, 2);
  assert.deepEqual(out.template.payload.bbox, { w: 230, h: 110 });
  assert.equal(out.template.payload.elements[0].dx, 0);
  assert.equal(out.template.payload.elements[0].dy, 0);
  assert.equal(out.template.payload.edges.length, 1);
  assert.equal(out.template.payload.edges[0].from_index, 0);
  assert.equal(out.template.payload.edges[0].to_index, 1);
});

test("buildHybridStencilTemplate returns error on empty selection", () => {
  const out = buildHybridStencilTemplate([], { elements: [], edges: [] });
  assert.equal(out.ok, false);
  assert.equal(out.error, "no_hybrid_selection");
});

