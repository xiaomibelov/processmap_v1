import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";

import { normalizeHybridV2Doc } from "./hybridLayerV2.js";
import {
  detectDrawioFormat,
  exportHybridToDrawio,
  importDrawioToHybrid,
} from "./drawioCodec.js";

const ENCODED_FIXTURE_PATH = new URL("./__fixtures__/diagramsnet_encoded_cisco2.drawio", import.meta.url);
const CONTAINER_FIXTURE_PATH = new URL("./__fixtures__/diagramsnet_container_visibility.drawio", import.meta.url);

test("detectDrawioFormat: raw diagram and mxGraphModel roots", () => {
  const rawMxGraph = "<mxGraphModel><root><mxCell id=\"0\"/></root></mxGraphModel>";
  const rawMxfile = `<mxfile><diagram name=\"Page-1\">${rawMxGraph}</diagram></mxfile>`;
  assert.equal(detectDrawioFormat(rawMxGraph).format, "mxgraphmodel_root");
  assert.equal(detectDrawioFormat(rawMxfile).format, "raw_diagram_xml");
});

test("detectDrawioFormat: encoded diagram payload", async () => {
  const encodedFixture = await fs.readFile(ENCODED_FIXTURE_PATH, "utf-8");
  const format = detectDrawioFormat(encodedFixture);
  assert.equal(format.format, "encoded_diagram_payload");
  assert.ok(String(format.diagramPayload || "").length > 100);
});

test("exportHybridToDrawio: emits mxfile with mxGraphModel", () => {
  const doc = normalizeHybridV2Doc({
    layers: [{ id: "L1", name: "Hybrid", visible: true, locked: false, opacity: 1 }],
    elements: [{ id: "E1", layer_id: "L1", type: "rect", x: 120, y: 180, w: 200, h: 72, text: "Rect" }],
    edges: [],
  });
  const xml = exportHybridToDrawio(doc);
  assert.ok(xml.includes("<mxfile"));
  assert.ok(xml.includes("<mxGraphModel"));
  assert.ok(xml.includes("mxCell id=\"E1\""));
});

test("importDrawioToHybrid: imports raw drawio subset and keeps geometry", async () => {
  const source = normalizeHybridV2Doc({
    layers: [{ id: "L1", name: "Hybrid", visible: true, locked: false, opacity: 1 }],
    elements: [
      { id: "E1", layer_id: "L1", type: "rect", x: 140, y: 220, w: 180, h: 60, text: "Rect 1" },
      { id: "E2", layer_id: "L1", type: "text", x: 420, y: 240, w: 120, h: 30, text: "Text 2" },
    ],
    edges: [{ id: "A1", layer_id: "L1", type: "arrow", from: { element_id: "E1" }, to: { element_id: "E2" }, waypoints: [{ x: 330, y: 252 }] }],
    bindings: [{ hybrid_id: "E1", bpmn_id: "Task_1", kind: "node" }],
  });
  const xml = exportHybridToDrawio(source);
  const imported = await importDrawioToHybrid(xml, { baseDoc: source });
  assert.equal(imported.format, "raw_diagram_xml");
  assert.equal(imported.hybridV2.elements.length, 2);
  assert.equal(imported.hybridV2.edges.length, 1);
  const e1 = imported.hybridV2.elements.find((row) => row.id === "E1");
  assert.equal(Number(e1?.x), 140);
  assert.equal(Number(e1?.y), 220);
  assert.ok(imported.hybridV2.bindings.some((row) => row.hybrid_id === "E1" && row.bpmn_id === "Task_1"));
});

test("importDrawioToHybrid: imports encoded diagrams.net file fixture", async () => {
  const encodedFixture = await fs.readFile(ENCODED_FIXTURE_PATH, "utf-8");
  const imported = await importDrawioToHybrid(encodedFixture);
  assert.equal(imported.format, "encoded_diagram_payload");
  assert.ok(imported.hybridV2.elements.length > 0);
  assert.ok(imported.hybridV2.layers.length > 0);
  assert.equal(Array.isArray(imported.skipped), true);
  assert.equal(Array.isArray(imported.warnings), true);
});

test("importDrawioToHybrid: imports container/layer visibility fixture", async () => {
  const fixture = await fs.readFile(CONTAINER_FIXTURE_PATH, "utf-8");
  const imported = await importDrawioToHybrid(fixture);
  assert.equal(imported.format, "raw_diagram_xml");
  const doc = imported.hybridV2;
  assert.equal(doc.layers.length, 2);
  assert.equal(doc.layers.find((row) => row.id === "L2")?.visible, false);
  assert.equal(doc.elements.find((row) => row.id === "C1")?.type, "container");
  assert.equal(doc.elements.find((row) => row.id === "E1")?.parent_id, "C1");
  assert.equal(doc.elements.find((row) => row.id === "E4")?.visible, false);
  assert.equal(doc.edges.find((row) => row.id === "A2")?.visible, false);
});

test("import/export roundtrip via codec keeps container hierarchy and visibility", async () => {
  const fixture = await fs.readFile(CONTAINER_FIXTURE_PATH, "utf-8");
  const imported = await importDrawioToHybrid(fixture);
  const exported = exportHybridToDrawio(imported.hybridV2);
  const reimported = await importDrawioToHybrid(exported);
  const doc = reimported.hybridV2;
  assert.equal(doc.layers.find((row) => row.id === "L2")?.visible, false);
  assert.equal(doc.elements.find((row) => row.id === "C1")?.type, "container");
  assert.equal(doc.elements.find((row) => row.id === "E2")?.parent_id, "C1");
  assert.equal(doc.elements.find((row) => row.id === "E4")?.visible, false);
});
