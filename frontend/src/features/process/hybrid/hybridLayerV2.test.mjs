import test from "node:test";
import assert from "node:assert/strict";
import {
  createEmptyHybridV2Doc,
  docToComparableJson,
  exportHybridV2ToDrawioXml,
  importHybridV2FromDrawioXml,
  makeHybridV2Id,
  migrateHybridV1ToV2,
  normalizeHybridV2Doc,
} from "./hybridLayerV2.js";

test("normalizeHybridV2Doc: creates stable defaults", () => {
  const doc = normalizeHybridV2Doc({});
  assert.equal(doc.schema_version, 2);
  assert.equal(doc.layers.length, 1);
  assert.equal(doc.layers[0].id, "L1");
  assert.equal(doc.view.mode, "view");
  assert.equal(doc.view.tool, "select");
});

test("migrateHybridV1ToV2: creates note elements + node bindings", () => {
  const migrated = migrateHybridV1ToV2(
    {
      Task_1: { dx: 20, dy: -8 },
      Task_2: { dx: -12, dy: 4 },
    },
    (nodeId) => {
      if (nodeId === "Task_1") return { x: 100, y: 200 };
      if (nodeId === "Task_2") return { x: 300, y: 500 };
      return null;
    },
  );
  assert.equal(migrated.elements.length, 2);
  assert.equal(migrated.bindings.length, 2);
  const first = migrated.elements.find((row) => row.id === "E1");
  assert.equal(first.type, "note");
  assert.equal(first.x, 120);
  assert.equal(first.y, 192);
});

test("makeHybridV2Id: increments by prefix and avoids collisions", () => {
  const doc = normalizeHybridV2Doc({
    elements: [{ id: "E1", type: "rect", x: 10, y: 10, w: 20, h: 20 }],
    edges: [{ id: "A1", from: { element_id: "E1" }, to: { element_id: "E1" } }],
  });
  assert.equal(makeHybridV2Id("E", doc), "E2");
  assert.equal(makeHybridV2Id("A", doc), "A2");
});

test("drawio subset export/import: roundtrip keeps key entities", () => {
  const source = normalizeHybridV2Doc({
    layers: [{ id: "L1", name: "Hybrid", visible: true, locked: false, opacity: 1 }],
    elements: [
      { id: "E1", layer_id: "L1", type: "rect", x: 120, y: 200, w: 180, h: 60, text: "Rect 1" },
      { id: "E2", layer_id: "L1", type: "text", x: 420, y: 220, w: 120, h: 30, text: "Text 2" },
    ],
    edges: [
      { id: "A1", layer_id: "L1", type: "arrow", from: { element_id: "E1" }, to: { element_id: "E2" } },
    ],
  });
  const xml = exportHybridV2ToDrawioXml(source);
  assert.ok(xml.includes("mxGraphModel"));
  assert.ok(xml.includes("mxCell id=\"E1\""));
  const imported = importHybridV2FromDrawioXml(xml);
  assert.equal(imported.doc.schema_version, 2);
  assert.equal(imported.doc.elements.length, 2);
  assert.equal(imported.doc.edges.length, 1);
  assert.ok(docToComparableJson(imported.doc).includes("\"id\":\"E1\""));
});

test("importHybridV2FromDrawioXml: empty XML returns defaults + skipped", () => {
  const out = importHybridV2FromDrawioXml("");
  assert.deepEqual(out.doc, createEmptyHybridV2Doc());
  assert.ok(out.skipped.includes("empty_xml"));
});
