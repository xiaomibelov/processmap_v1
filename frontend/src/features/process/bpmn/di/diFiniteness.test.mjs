import test from "node:test";
import assert from "node:assert/strict";

import {
  findNonFiniteDi,
  sanitizeDiFiniteness,
} from "./diFiniteness.js";

// ---------------------------------------------------------------------------
// Контур fix/canvas-nan-di-stuck-drag, P0-2/P0-3.
// Durable XML сессии 2ce69bd74c содержит di:waypoint x="NaN" y="NaN" — при
// импорте это уводит re-layout в non-finite координаты, render-listener
// бросает, Dragging.end умирает до cleanup (stuck LMB). Хелпер обязан:
//  findNonFiniteDi — находить нефинитные waypoint/bounds (NaN, ±Infinity,
//    отсутствующие/пустые атрибуты);
//  sanitizeDiFiniteness — чинить XML до importXML: битые waypoints дропаются,
//    edge с <2 waypoints получает прямой маршрут из Bounds source/target,
//    нефинитные компоненты Bounds заменяются на 0. Здоровый XML не трогаем.
// ---------------------------------------------------------------------------

const HEADER =
  '<?xml version="1.0" encoding="UTF-8"?>\n' +
  '<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" ' +
  'xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" ' +
  'xmlns:di="http://www.omg.org/spec/DD/20100524/DI" id="Defs_1" targetNamespace="http://bpmn.io/schema/bpmn">';

const FOOTER = "</bpmn:definitions>";

function xmlWith({ processBody, planeBody }) {
  return (
    HEADER +
    `<bpmn:process id="Process_1" isExecutable="false">${processBody}</bpmn:process>` +
    '<bpmndi:BPMNDiagram id="BPMNDiagram_1">' +
    '<bpmndi:BPMNPlane id="BPMNPlane_1" bpmnElement="Process_1">' +
    planeBody +
    "</bpmndi:BPMNPlane></bpmndi:BPMNDiagram>" +
    FOOTER
  );
}

function shape(id, x, y, w = 100, h = 80) {
  return `<bpmndi:BPMNShape id="${id}_di" bpmnElement="${id}">` +
    `<di:Bounds x="${x}" y="${y}" width="${w}" height="${h}"/>` +
    `</bpmndi:BPMNShape>`;
}

function edge(id, flowId, waypoints) {
  const pts = waypoints
    .map(([x, y]) => `<di:waypoint x="${x}" y="${y}"/>`)
    .join("");
  return `<bpmndi:BPMNEdge id="${flowId}_di" bpmnElement="${flowId}">${pts}</bpmndi:BPMNEdge>`;
}

// --- findNonFiniteDi -------------------------------------------------------

test("findNonFiniteDi: NaN waypoint находится с kind=waypoint и id связи", () => {
  const xml = xmlWith({
    processBody:
      '<bpmn:task id="Task_a"/><bpmn:task id="Task_b"/>' +
      '<bpmn:sequenceFlow id="Flow_1" sourceRef="Task_a" targetRef="Task_b"/>',
    planeBody:
      shape("Task_a", 100, 100) +
      shape("Task_b", 400, 100) +
      edge("Edge_1", "Flow_1", [["NaN", "NaN"], [380, 140]]),
  });
  const found = findNonFiniteDi(xml);
  assert.equal(found.length, 2);
  assert.ok(found.every((f) => f.kind === "waypoint" && f.edgeId === "Flow_1"));
  assert.deepEqual(
    found.map((f) => f.attr).sort(),
    ["x", "y"],
  );
  assert.ok(found.every((f) => f.value === "NaN"));
});

test("findNonFiniteDi: Infinity и -Infinity в waypoints и bounds", () => {
  const xml = xmlWith({
    processBody:
      '<bpmn:task id="Task_a"/><bpmn:task id="Task_b"/>' +
      '<bpmn:sequenceFlow id="Flow_1" sourceRef="Task_a" targetRef="Task_b"/>',
    planeBody:
      `<bpmndi:BPMNShape id="Task_a_di" bpmnElement="Task_a">` +
      `<di:Bounds x="Infinity" y="100" width="100" height="80"/></bpmndi:BPMNShape>` +
      shape("Task_b", 400, 100) +
      edge("Edge_1", "Flow_1", [[200, 140], ["-Infinity", 140]]),
  });
  const found = findNonFiniteDi(xml);
  const kinds = found.map((f) => `${f.kind}:${f.attr}:${f.value}`).sort();
  assert.deepEqual(kinds, [
    "bounds:x:Infinity",
    "waypoint:x:-Infinity",
  ]);
});

test("findNonFiniteDi: отсутствующий/пустой атрибут waypoint считается нефинитным", () => {
  const xml = xmlWith({
    processBody:
      '<bpmn:task id="Task_a"/><bpmn:task id="Task_b"/>' +
      '<bpmn:sequenceFlow id="Flow_1" sourceRef="Task_a" targetRef="Task_b"/>',
    planeBody:
      shape("Task_a", 100, 100) +
      shape("Task_b", 400, 100) +
      `<bpmndi:BPMNEdge id="Flow_1_di" bpmnElement="Flow_1">` +
      `<di:waypoint x="200" y="140"/><di:waypoint x="" y="140"/>` +
      `</bpmndi:BPMNEdge>`,
  });
  const found = findNonFiniteDi(xml);
  assert.equal(found.length, 1);
  assert.equal(found[0].kind, "waypoint");
  assert.equal(found[0].attr, "x");
});

test("findNonFiniteDi: здоровый XML — пустой результат", () => {
  const xml = xmlWith({
    processBody:
      '<bpmn:task id="Task_a"/><bpmn:task id="Task_b"/>' +
      '<bpmn:sequenceFlow id="Flow_1" sourceRef="Task_a" targetRef="Task_b"/>',
    planeBody:
      shape("Task_a", 100, 100) +
      shape("Task_b", 400, 100) +
      edge("Edge_1", "Flow_1", [[200, 140], [380, 140]]),
  });
  assert.deepEqual(findNonFiniteDi(xml), []);
});

test("findNonFiniteDi: пустой/битый ввод — пустой результат, без исключений", () => {
  assert.deepEqual(findNonFiniteDi(""), []);
  assert.deepEqual(findNonFiniteDi(null), []);
  assert.deepEqual(findNonFiniteDi("<bpmn:definitions>"), []);
});

test("findNonFiniteDi: dc:Bounds (реальный namespace bpmn-js) — нефинитный компонент находится", () => {
  const xml = HEADER +
    '<bpmn:process id="Process_1"><bpmn:task id="Task_a"/></bpmn:process>' +
    '<bpmndi:BPMNDiagram id="D1"><bpmndi:BPMNPlane id="P1" bpmnElement="Process_1">' +
    '<bpmndi:BPMNShape id="Task_a_di" bpmnElement="Task_a">' +
    '<dc:Bounds xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" x="NaN" y="100" width="100" height="80"/>' +
    '</bpmndi:BPMNShape>' +
    '</bpmndi:BPMNPlane></bpmndi:BPMNDiagram>' +
    FOOTER;
  const found = findNonFiniteDi(xml);
  assert.equal(found.length, 1);
  assert.equal(found[0].kind, "bounds");
  assert.equal(found[0].attr, "x");
});

test("sanitize: прямой маршрут строится из dc:Bounds (namespace bpmn-js сериализации)", () => {
  const xml = HEADER +
    '<bpmn:process id="Process_1"><bpmn:task id="Task_a"/><bpmn:task id="Task_b"/>' +
    '<bpmn:sequenceFlow id="Flow_1" sourceRef="Task_a" targetRef="Task_b"/></bpmn:process>' +
    '<bpmndi:BPMNDiagram id="D1"><bpmndi:BPMNPlane id="P1" bpmnElement="Process_1">' +
    '<bpmndi:BPMNShape id="Task_a_di" bpmnElement="Task_a">' +
    '<dc:Bounds xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" x="100" y="100" width="100" height="80"/>' +
    '</bpmndi:BPMNShape>' +
    '<bpmndi:BPMNShape id="Task_b_di" bpmnElement="Task_b">' +
    '<dc:Bounds xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" x="400" y="100" width="100" height="80"/>' +
    '</bpmndi:BPMNShape>' +
    '<bpmndi:BPMNEdge id="Flow_1_di" bpmnElement="Flow_1">' +
    '<di:waypoint x="NaN" y="NaN"/><di:waypoint x="NaN" y="NaN"/>' +
    '</bpmndi:BPMNEdge>' +
    '</bpmndi:BPMNPlane></bpmndi:BPMNDiagram>' +
    FOOTER;
  const { xml: healed, repaired } = sanitizeDiFiniteness(xml);
  assert.equal(findNonFiniteDi(healed).length, 0);
  // Горизонтальный маршрут из реальных Bounds, НЕ дегенеративный (0,0).
  assert.ok(healed.includes('x="200" y="140"'));
  assert.ok(healed.includes('x="400" y="140"'));
  assert.ok(repaired.some((r) => r.kind === "edge-relayout" && r.edgeId === "Flow_1"));
});

// --- sanitizeDiFiniteness ---------------------------------------------------

test("sanitize: битый waypoint дропается, остальные waypoints edge сохраняются", () => {
  const xml = xmlWith({
    processBody:
      '<bpmn:task id="Task_a"/><bpmn:task id="Task_b"/>' +
      '<bpmn:sequenceFlow id="Flow_1" sourceRef="Task_a" targetRef="Task_b"/>',
    planeBody:
      shape("Task_a", 100, 100) +
      shape("Task_b", 400, 100) +
      edge("Edge_1", "Flow_1", [[200, 140], ["NaN", "NaN"], [380, 140]]),
  });
  const { xml: healed, repaired } = sanitizeDiFiniteness(xml);
  assert.equal(findNonFiniteDi(healed).length, 0);
  assert.ok(healed.includes('x="200"'));
  assert.ok(healed.includes('x="380"'));
  assert.ok(!healed.includes("NaN"));
  assert.ok(repaired.some((r) => r.kind === "waypoint-drop" && r.edgeId === "Flow_1"));
});

test("sanitize: edge с <2 валидных waypoints получает прямой маршрут из Bounds source/target (горизонталь)", () => {
  const xml = xmlWith({
    processBody:
      '<bpmn:task id="Task_a"/><bpmn:task id="Task_b"/>' +
      '<bpmn:sequenceFlow id="Flow_1" sourceRef="Task_a" targetRef="Task_b"/>',
    planeBody:
      shape("Task_a", 100, 100) + // center (150,140), right edge x=200
      shape("Task_b", 400, 100) + // center (450,140), left edge x=400
      edge("Edge_1", "Flow_1", [["NaN", "NaN"], ["NaN", "NaN"]]),
  });
  const { xml: healed, repaired } = sanitizeDiFiniteness(xml);
  assert.equal(findNonFiniteDi(healed).length, 0);
  // Горизонтальный доминантный маршрут: правая кромка source → левая кромка target.
  assert.ok(healed.includes('x="200" y="140"'));
  assert.ok(healed.includes('x="400" y="140"'));
  assert.ok(repaired.some((r) => r.kind === "edge-relayout" && r.edgeId === "Flow_1"));
});

test("sanitize: вертикальный маршрут при доминантной вертикальной оси", () => {
  const xml = xmlWith({
    processBody:
      '<bpmn:task id="Task_a"/><bpmn:task id="Task_b"/>' +
      '<bpmn:sequenceFlow id="Flow_1" sourceRef="Task_a" targetRef="Task_b"/>',
    planeBody:
      shape("Task_a", 100, 100) + // center (150,140), bottom y=180
      shape("Task_b", 110, 400) + // center (160,440), top y=400
      edge("Edge_1", "Flow_1", [["NaN", "NaN"]]),
  });
  const { xml: healed } = sanitizeDiFiniteness(xml);
  assert.equal(findNonFiniteDi(healed).length, 0);
  assert.ok(healed.includes('x="150" y="180"'));
  assert.ok(healed.includes('x="160" y="400"'));
});

test("sanitize: без валидных Bounds source/target — дегенеративный финитный маршрут (bpmn-js переложит layoutConnection)", () => {
  const xml = xmlWith({
    processBody:
      '<bpmn:task id="Task_a"/>' +
      '<bpmn:sequenceFlow id="Flow_1" sourceRef="Task_a" targetRef="Task_missing"/>',
    planeBody:
      shape("Task_a", 100, 100) +
      edge("Edge_1", "Flow_1", [["NaN", "NaN"]]),
  });
  const { xml: healed, repaired } = sanitizeDiFiniteness(xml);
  assert.equal(findNonFiniteDi(healed).length, 0);
  // BPMNEdge сохранён (flow без DI не импортируется — missingdi-пробой аудита).
  assert.ok(healed.includes("BPMNEdge"));
  assert.ok(repaired.some((r) => r.kind === "edge-relayout" && r.edgeId === "Flow_1"));
});

test("sanitize: нефинитный компонент Bounds заменяется на 0, остальное сохраняется", () => {
  const xml = xmlWith({
    processBody: '<bpmn:task id="Task_a"/>',
    planeBody:
      `<bpmndi:BPMNShape id="Task_a_di" bpmnElement="Task_a">` +
      `<di:Bounds x="NaN" y="100" width="Infinity" height="80"/></bpmndi:BPMNShape>`,
  });
  const { xml: healed, repaired } = sanitizeDiFiniteness(xml);
  assert.equal(findNonFiniteDi(healed).length, 0);
  assert.ok(healed.includes('x="0" y="100" width="0" height="80"'));
  const fixes = repaired.filter((r) => r.kind === "bounds-fix" && r.elementId === "Task_a");
  assert.deepEqual(fixes.map((f) => f.attr).sort(), ["width", "x"]);
});

test("sanitize: здоровый XML возвращается без изменений и без repaired", () => {
  const xml = xmlWith({
    processBody:
      '<bpmn:task id="Task_a"/><bpmn:task id="Task_b"/>' +
      '<bpmn:sequenceFlow id="Flow_1" sourceRef="Task_a" targetRef="Task_b"/>',
    planeBody:
      shape("Task_a", 100, 100) +
      shape("Task_b", 400, 100) +
      edge("Edge_1", "Flow_1", [[200, 140], [400, 140]]),
  });
  const { xml: healed, repaired } = sanitizeDiFiniteness(xml);
  assert.equal(healed, xml);
  assert.deepEqual(repaired, []);
});

test("sanitize: инцидентный срез 2ce69bd74c — flow с двумя NaN-waypoints в длинном XML", () => {
  // Упрощённый срез: среди здоровых элементов — Flow с NaN-waypoints (RC1).
  const xml = xmlWith({
    processBody:
      '<bpmn:task id="Activity_1"/><bpmn:task id="Activity_2"/>' +
      '<bpmn:sequenceFlow id="Flow_ok" sourceRef="Activity_1" targetRef="Activity_2"/>' +
      '<bpmn:sequenceFlow id="Flow_0bmz1gi" sourceRef="Activity_1" targetRef="Activity_2"/>',
    planeBody:
      shape("Activity_1", 9168, -450) +
      shape("Activity_2", 8130, 990) +
      edge("Edge_ok", "Flow_ok", [[8130, 990], [9218, 990], [9218, -370]]) +
      edge("Edge_bad", "Flow_0bmz1gi", [["NaN", "NaN"], ["NaN", "NaN"]]),
  });
  const { xml: healed, repaired } = sanitizeDiFiniteness(xml);
  assert.equal(findNonFiniteDi(healed).length, 0);
  // Здоровый маршрут Flow_ok не тронут.
  assert.ok(healed.includes('x="8130" y="990"'));
  assert.ok(healed.includes('x="9218" y="-370"'));
  assert.ok(repaired.some((r) => r.kind === "edge-relayout" && r.edgeId === "Flow_0bmz1gi"));
});
