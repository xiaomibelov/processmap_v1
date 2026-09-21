import test from "node:test";
import assert from "node:assert/strict";

import { healImportXml } from "./importDiHeal.js";
import { findNonFiniteDi } from "../di/diFiniteness.js";

// ---------------------------------------------------------------------------
// Контур fix/canvas-nan-di-stuck-drag, P0-3: self-heal NaN-DI при импорте.
// Durable XML инцидентной сессии (2ce69bd74c) содержит нефинитные waypoints —
// такой XML обязан санацироваться ДО importXML (иначе re-layout уходит в
// non-finite и drag залипает, RC2 аудита canvas-drag-stuck-after-1008).
// healImportXml — чистый шаг подготовки import-текста: healed XML + список
// healed edge id (для post-import layoutConnection) + диагностика.
// ---------------------------------------------------------------------------

function xmlWith(planeBody, processBody = '<bpmn:task id="Task_a"/><bpmn:task id="Task_b"/><bpmn:sequenceFlow id="Flow_1" sourceRef="Task_a" targetRef="Task_b"/>') {
  return (
    '<?xml version="1.0" encoding="UTF-8"?>' +
    '<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" ' +
    'xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" ' +
    'xmlns:di="http://www.omg.org/spec/DD/20100524/DI" id="Defs_1" targetNamespace="http://bpmn.io/schema/bpmn">' +
    `<bpmn:process id="Process_1">${processBody}</bpmn:process>` +
    '<bpmndi:BPMNDiagram id="D1"><bpmndi:BPMNPlane id="P1" bpmnElement="Process_1">' +
    planeBody +
    '</bpmndi:BPMNPlane></bpmndi:BPMNDiagram></bpmn:definitions>'
  );
}

const SHAPE_A = '<bpmndi:BPMNShape id="Task_a_di" bpmnElement="Task_a"><di:Bounds x="100" y="100" width="100" height="80"/></bpmndi:BPMNShape>';
const SHAPE_B = '<bpmndi:BPMNShape id="Task_b_di" bpmnElement="Task_b"><di:Bounds x="400" y="100" width="100" height="80"/></bpmndi:BPMNShape>';

test("P0-3: NaN-waypoints санацируются до import, healedEdges содержит id связи", () => {
  const xml = xmlWith(
    SHAPE_A + SHAPE_B +
    '<bpmndi:BPMNEdge id="Flow_1_di" bpmnElement="Flow_1">' +
    '<di:waypoint x="NaN" y="NaN"/><di:waypoint x="NaN" y="NaN"/>' +
    '</bpmndi:BPMNEdge>',
  );
  const records = [];
  const traces = [];
  const out = healImportXml(xml, {
    record: (type, details) => records.push({ type, details }),
    trace: (event, payload) => traces.push({ event, payload }),
  });
  assert.notEqual(out.xml, xml);
  assert.equal(findNonFiniteDi(out.xml).length, 0);
  // BPMNEdge сохранён (flow без DI не импортируется), маршрут финитный.
  assert.ok(out.xml.includes("BPMNEdge"));
  assert.deepEqual(out.healedEdges, ["Flow_1"]);
  assert.ok(records.some((r) => r.type === "di_import_healed"));
  assert.ok(traces.some((t) => t.event === "load.di_heal"));
});

test("P0-3: здоровый XML проходит без изменений и без диагностики", () => {
  const xml = xmlWith(
    SHAPE_A + SHAPE_B +
    '<bpmndi:BPMNEdge id="Flow_1_di" bpmnElement="Flow_1">' +
    '<di:waypoint x="200" y="140"/><di:waypoint x="400" y="140"/>' +
    '</bpmndi:BPMNEdge>',
  );
  const records = [];
  const out = healImportXml(xml, { record: (t) => records.push(t) });
  assert.equal(out.xml, xml);
  assert.deepEqual(out.healedEdges, []);
  assert.equal(records.length, 0);
});

test("P0-3: пустой/битый ввод — passthrough без исключений", () => {
  assert.deepEqual(healImportXml("", {}), { xml: "", healedEdges: [] });
  assert.deepEqual(healImportXml(null, {}), { xml: null, healedEdges: [] });
});
