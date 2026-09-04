import test from "node:test";
import assert from "node:assert/strict";

import { JSDOM } from "jsdom";

import moveRetargetRulesModule from "./moveRetargetRules.js";

function setupDom() {
  const dom = new JSDOM('<!DOCTYPE html><body><div id="canvas"></div></body>', {
    pretendToBeVisual: true,
  });
  const { window } = dom;

  for (const k of ["window", "document", "navigator", "HTMLElement", "SVGElement", "Element", "Node", "XMLSerializer", "DOMParser", "getComputedStyle", "requestAnimationFrame", "cancelAnimationFrame", "KeyboardEvent", "MouseEvent", "TouchEvent", "PointerEvent", "UIEvent", "Event", "CustomEvent"]) {
    if (window[k] !== undefined && globalThis[k] === undefined) {
      try { globalThis[k] = window[k]; } catch (e) { /* noop */ }
    }
  }
  globalThis.requestAnimationFrame = globalThis.requestAnimationFrame || ((cb) => setTimeout(cb, 0));

  window.SVGSVGElement = window.SVGSVGElement || window.SVGElement;
  const fakeMatrix = () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0, multiply: (m) => m, inverse() { return this; }, translate() { return this; }, scale() { return this; } });
  const fakeTransform = () => ({
    type: 1,
    matrix: fakeMatrix(),
    setMatrix(m) { this.matrix = m; },
    setTranslate(x, y) { this.matrix.e = x; this.matrix.f = y; },
    setRotate() {},
    setScale(a) { this.matrix.a = a; this.matrix.d = a; },
  });
  const fakeTransformList = () => {
    const items = [];
    const list = {
      numberOfItems: 0,
      getItem: (i) => items[i],
      appendItem: (m) => { items.push(m); list.numberOfItems = items.length; return m; },
      insertItemBefore: (m) => { items.unshift(m); return m; },
      removeItem: () => ({}),
      clear: () => { items.length = 0; list.numberOfItems = 0; },
      consolidate: () => items[0] || fakeTransform(),
      createSVGTransformFromMatrix: (m) => { const t = fakeTransform(); t.setMatrix(m); return t; },
      initialize: (m) => m,
    };
    return list;
  };
  if (!window.SVGSVGElement.prototype.createSVGMatrix) {
    window.SVGSVGElement.prototype.createSVGMatrix = fakeMatrix;
    window.SVGSVGElement.prototype.createSVGTransform = fakeTransform;
    window.SVGSVGElement.prototype.createSVGPoint = function () { return { x: 0, y: 0, matrixTransform() { return this; } }; };
  }
  Object.defineProperty(window.SVGElement.prototype, "transform", { configurable: true, get() { return { baseVal: fakeTransformList() }; } });
  Object.defineProperty(window.SVGElement.prototype, "viewBox", { configurable: true, get() { return { baseVal: { x: 0, y: 0, width: 1000, height: 1000 } }; } });
  window.SVGElement.prototype.getBBox = window.SVGElement.prototype.getBBox || function () { return { x: 0, y: 0, width: 0, height: 0 }; };
  window.SVGElement.prototype.getScreenCTM = window.SVGElement.prototype.getScreenCTM || function () { return { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0, inverse() { return this; } }; };
  globalThis.CSS = globalThis.CSS || { escape: (s) => String(s).replace(/[^a-zA-Z0-9_-]/g, (ch) => "\\" + ch) };
  globalThis.SVGMatrix = globalThis.SVGMatrix || function SVGMatrix() {};
  return window;
}

const PROCESS_XML = `<?xml version="1.0" encoding="UTF-8"?>
<definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" id="Defs_1" targetNamespace="http://p1/repro">
  <process id="Process_1" isExecutable="false">
    <startEvent id="StartEvent_1"><outgoing>Flow_1</outgoing></startEvent>
    <task id="Task_A" name="A"><incoming>Flow_1</incoming><outgoing>Flow_2</outgoing></task>
    <task id="Task_B" name="B"><incoming>Flow_2</incoming><outgoing>Flow_3</outgoing></task>
    <endEvent id="EndEvent_1"><incoming>Flow_3</incoming></endEvent>
    <sequenceFlow id="Flow_1" sourceRef="StartEvent_1" targetRef="Task_A"/>
    <sequenceFlow id="Flow_2" sourceRef="Task_A" targetRef="Task_B"/>
    <sequenceFlow id="Flow_3" sourceRef="Task_B" targetRef="EndEvent_1"/>
  </process>
  <bpmndi:BPMNDiagram id="BPMNDiagram_1" xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI">
    <bpmndi:BPMNPlane id="BPMNPlane_1" bpmnElement="Process_1">
      <bpmndi:BPMNShape id="StartEvent_1_di" bpmnElement="StartEvent_1"><dc:Bounds xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" x="100" y="100" width="36" height="36"/></bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Task_A_di" bpmnElement="Task_A"><dc:Bounds xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" x="200" y="80" width="100" height="80"/></bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Task_B_di" bpmnElement="Task_B"><dc:Bounds xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" x="380" y="80" width="100" height="80"/></bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="EndEvent_1_di" bpmnElement="EndEvent_1"><dc:Bounds xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" x="540" y="100" width="36" height="36"/></bpmndi:BPMNShape>
      <bpmndi:BPMNEdge id="Flow_1_di" bpmnElement="Flow_1"><di:waypoint xmlns:di="http://www.omg.org/spec/DD/20100524/DI" x="136" y="118"/><di:waypoint xmlns:di="http://www.omg.org/spec/DD/20100524/DI" x="200" y="118"/></bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_2_di" bpmnElement="Flow_2"><di:waypoint xmlns:di="http://www.omg.org/spec/DD/20100524/DI" x="300" y="118"/><di:waypoint xmlns:di="http://www.omg.org/spec/DD/20100524/DI" x="380" y="118"/></bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_3_di" bpmnElement="Flow_3"><di:waypoint xmlns:di="http://www.omg.org/spec/DD/20100524/DI" x="480" y="118"/><di:waypoint xmlns:di="http://www.omg.org/spec/DD/20100524/DI" x="540" y="118"/></bpmndi:BPMNEdge>
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</definitions>`;

const COLLAB_XML = `<?xml version="1.0" encoding="UTF-8"?>
<definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" id="Defs_2" targetNamespace="http://p1/collab">
  <collaboration id="Collaboration_1">
    <participant id="Participant_1" name="P1" processRef="Process_1"/>
    <participant id="Participant_2" name="P2" processRef="Process_2"/>
    <messageFlow id="MessageFlow_1" sourceRef="Task_X" targetRef="Task_Y"/>
  </collaboration>
  <process id="Process_1" isExecutable="false">
    <startEvent id="Start_S1"><outgoing>Flow_S1X</outgoing></startEvent>
    <task id="Task_X" name="X"><incoming>Flow_S1X</incoming><outgoing>Flow_XE1</outgoing></task>
    <endEvent id="End_E1"><incoming>Flow_XE1</incoming></endEvent>
    <sequenceFlow id="Flow_S1X" sourceRef="Start_S1" targetRef="Task_X"/>
    <sequenceFlow id="Flow_XE1" sourceRef="Task_X" targetRef="End_E1"/>
  </process>
  <process id="Process_2" isExecutable="false">
    <task id="Task_Y" name="Y"/>
  </process>
  <bpmndi:BPMNDiagram id="BPMNDiagram_2" xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI">
    <bpmndi:BPMNPlane id="BPMNPlane_2" bpmnElement="Collaboration_1">
      <bpmndi:BPMNShape id="Participant_1_di" bpmnElement="Participant_1" isHorizontal="true"><dc:Bounds xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" x="100" y="100" width="620" height="200"/></bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Start_S1_di" bpmnElement="Start_S1"><dc:Bounds xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" x="140" y="182" width="36" height="36"/></bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Task_X_di" bpmnElement="Task_X"><dc:Bounds xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" x="230" y="170" width="100" height="80"/></bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="End_E1_di" bpmnElement="End_E1"><dc:Bounds xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" x="400" y="182" width="36" height="36"/></bpmndi:BPMNShape>
      <bpmndi:BPMNEdge id="Flow_S1X_di" bpmnElement="Flow_S1X"><di:waypoint xmlns:di="http://www.omg.org/spec/DD/20100524/DI" x="176" y="200"/><di:waypoint xmlns:di="http://www.omg.org/spec/DD/20100524/DI" x="230" y="200"/></bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_XE1_di" bpmnElement="Flow_XE1"><di:waypoint xmlns:di="http://www.omg.org/spec/DD/20100524/DI" x="330" y="210"/><di:waypoint xmlns:di="http://www.omg.org/spec/DD/20100524/DI" x="400" y="200"/></bpmndi:BPMNEdge>
      <bpmndi:BPMNShape id="Participant_2_di" bpmnElement="Participant_2" isHorizontal="true"><dc:Bounds xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" x="100" y="400" width="620" height="200"/></bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Task_Y_di" bpmnElement="Task_Y"><dc:Bounds xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" x="230" y="470" width="100" height="80"/></bpmndi:BPMNShape>
      <bpmndi:BPMNEdge id="MessageFlow_1_di" bpmnElement="MessageFlow_1"><di:waypoint xmlns:di="http://www.omg.org/spec/DD/20100524/DI" x="280" y="250"/><di:waypoint xmlns:di="http://www.omg.org/spec/DD/20100524/DI" x="280" y="470"/></bpmndi:BPMNEdge>
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</definitions>`;

const COLLAB_NO_PROCESS_XML = `<?xml version="1.0" encoding="UTF-8"?>
<definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" id="Defs_3" targetNamespace="http://p1/collab2">
  <collaboration id="Collaboration_9">
    <participant id="Participant_9" name="BlackBox"/>
  </collaboration>
  <bpmndi:BPMNDiagram id="BPMNDiagram_3" xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI">
    <bpmndi:BPMNPlane id="BPMNPlane_3" bpmnElement="Collaboration_9">
      <bpmndi:BPMNShape id="Participant_9_di" bpmnElement="Participant_9" isHorizontal="true"><dc:Bounds xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" x="100" y="100" width="620" height="200"/></bpmndi:BPMNShape>
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</definitions>`;

setupDom();

const HAS_DOM = typeof DOMParser !== "undefined";

async function createModeler(window, xml, { withModule = true } = {}) {
  const { default: Modeler } = await import("bpmn-js/lib/Modeler.js");
  const container = window.document.createElement("div");
  window.document.body.appendChild(container);
  const options = { container };
  if (withModule) options.additionalModules = [moveRetargetRulesModule];
  const modeler = new Modeler(options);
  const result = await modeler.importXML(xml);
  if (result.error) throw result.error;
  return modeler;
}

function connectionIds(modeler, parent) {
  return (parent.children || []).filter((el) => Array.isArray(el.waypoints)).map((el) => el.id).sort();
}

test("baseline: stock rules reject move of task onto its own sequence flow", { skip: !HAS_DOM }, async () => {
  const window = setupDom();
  const modeler = await createModeler(window, PROCESS_XML, { withModule: false });
  const registry = modeler.get("elementRegistry");
  const rules = modeler.get("rules");

  const taskA = registry.get("Task_A");
  const flow2 = registry.get("Flow_2");
  const allowed = rules.allowed("elements.move", {
    shapes: [taskA],
    delta: { x: 90, y: -2 },
    position: { x: 340, y: 118 },
    target: flow2,
  });
  assert.equal(allowed, false);
  modeler.destroy();
});

test("own flow: rule allows drop and retargets to connection parent without split", { skip: !HAS_DOM }, async () => {
  const window = setupDom();
  const modeler = await createModeler(window, PROCESS_XML);
  const registry = modeler.get("elementRegistry");
  const rules = modeler.get("rules");
  const modeling = modeler.get("modeling");

  const taskA = registry.get("Task_A");
  const flow2 = registry.get("Flow_2");
  const processRoot = flow2.parent;
  const beforeConnections = connectionIds(modeler, processRoot);

  const allowed = rules.allowed("elements.move", {
    shapes: [taskA],
    delta: { x: 90, y: -2 },
    position: { x: 340, y: 118 },
    target: flow2,
  });
  assert.equal(allowed, true);

  modeling.moveElements([taskA], { x: 90, y: -2 }, flow2);

  assert.equal(taskA.parent, processRoot, "task stays child of connection parent");
  assert.ok(registry.get("Flow_2"), "Flow_2 not split/removed");
  assert.equal(flow2.source, taskA, "flow source unchanged");
  assert.equal(flow2.target.id, "Task_B", "flow target unchanged");
  assert.deepEqual(connectionIds(modeler, processRoot), beforeConnections, "no new connections created");
  assert.deepEqual(taskA.outgoing.map((c) => c.id), ["Flow_2"]);
  assert.deepEqual(taskA.incoming.map((c) => c.id), ["Flow_1"]);
  modeler.destroy();
});

function stripGraphics(modeler, window) {
  const gfxFactory = modeler.get("graphicsFactory");
  const ns = "http://www.w3.org/2000/svg";
  gfxFactory.create = (type) => window.document.createElementNS(ns, "g");
  gfxFactory.update = () => {};
  gfxFactory.updateContainments = () => {};
  gfxFactory.remove = () => {};
}

test("other flow: rule passes through and stock insert/split is preserved", { skip: !HAS_DOM }, async () => {
  const window = setupDom();
  const modeler = await createModeler(window, PROCESS_XML);
  stripGraphics(modeler, window);
  const registry = modeler.get("elementRegistry");
  const rules = modeler.get("rules");
  const modeling = modeler.get("modeling");

  const taskA = registry.get("Task_A");
  const flow3 = registry.get("Flow_3"); // Task_B -> EndEvent_1, taskA not involved
  const processRoot = flow3.parent;
  const beforeConnections = connectionIds(modeler, processRoot);

  const allowed = rules.allowed("elements.move", {
    shapes: [taskA],
    delta: { x: 260, y: -2 },
    position: { x: 510, y: 118 },
    target: flow3,
  });
  assert.equal(allowed, true, "stock still allows insert/split on unrelated flow");

  modeling.moveElements([taskA], { x: 260, y: -2 }, flow3);

  assert.equal(taskA.parent, processRoot);
  assert.ok(registry.get("Flow_3"), "Flow_3 reused as incoming half of the split");
  assert.equal(flow3.source.id, "Task_B", "split: original flow keeps its source");
  assert.equal(flow3.target, taskA, "split: original flow retargeted to moved task");
  const afterConnections = connectionIds(modeler, processRoot);
  assert.equal(afterConnections.length, beforeConnections.length + 1, "split adds one connection");
  assert.deepEqual(taskA.incoming.map((c) => c.id).sort(), ["Flow_1", "Flow_3"]);
  assert.equal(taskA.outgoing.length, 2, "taskA gains outgoing from split");
  assert.equal(taskA.outgoing.find((c) => c.id !== "Flow_2").target.id, "EndEvent_1");
  modeler.destroy();
});

test("multi-select over flow: allowed and retargeted to parent without split", { skip: !HAS_DOM }, async () => {
  const window = setupDom();
  const modeler = await createModeler(window, PROCESS_XML);
  const registry = modeler.get("elementRegistry");
  const rules = modeler.get("rules");
  const modeling = modeler.get("modeling");

  const taskA = registry.get("Task_A");
  const taskB = registry.get("Task_B");
  const flow2 = registry.get("Flow_2");
  const processRoot = flow2.parent;
  const beforeConnections = connectionIds(modeler, processRoot);

  const allowed = rules.allowed("elements.move", {
    shapes: [taskA, taskB],
    delta: { x: 0, y: 200 },
    position: { x: 340, y: 318 },
    target: flow2,
  });
  assert.equal(allowed, true);

  modeling.moveElements([taskA, taskB], { x: 0, y: 200 }, flow2);

  assert.equal(taskA.parent, processRoot);
  assert.equal(taskB.parent, processRoot);
  assert.ok(registry.get("Flow_2"), "Flow_2 intact");
  assert.deepEqual(connectionIds(modeler, processRoot), beforeConnections, "no split for multi-select");
  modeler.destroy();
});

test("message flow drop: retargets to first participant of collaboration", { skip: !HAS_DOM }, async () => {
  const window = setupDom();
  const modeler = await createModeler(window, COLLAB_XML);
  const registry = modeler.get("elementRegistry");
  const rules = modeler.get("rules");
  const modeling = modeler.get("modeling");
  const canvas = modeler.get("canvas");

  const taskX = registry.get("Task_X");
  const messageFlow = registry.get("MessageFlow_1");
  const participant1 = registry.get("Participant_1");
  const collabRoot = canvas.getRootElement();

  const allowed = rules.allowed("elements.move", {
    shapes: [taskX],
    delta: { x: 0, y: 40 },
    position: { x: 280, y: 250 },
    target: messageFlow,
  });
  assert.equal(allowed, true);

  modeling.moveElements([taskX], { x: 0, y: 40 }, messageFlow);

  assert.equal(taskX.parent, participant1, "task moved into first process participant");

  const allowedOnRoot = rules.allowed("elements.move", {
    shapes: [taskX],
    delta: { x: 0, y: 40 },
    position: { x: 280, y: 330 },
    target: collabRoot,
  });
  assert.equal(allowedOnRoot, true, "drop on collaboration root allowed");

  modeling.moveElements([taskX], { x: 0, y: 40 }, collabRoot);
  assert.equal(taskX.parent, participant1, "root drop retargets to first participant");
  modeler.destroy();
});

test("collaboration without process: stock rejection preserved", { skip: !HAS_DOM }, async () => {
  const window = setupDom();
  const modeler = await createModeler(window, COLLAB_NO_PROCESS_XML);
  const rules = modeler.get("rules");
  const canvas = modeler.get("canvas");
  const elementFactory = modeler.get("elementFactory");

  const collabRoot = canvas.getRootElement();
  const task = elementFactory.createShape({ type: "bpmn:Task" });

  const moveAllowed = rules.allowed("elements.move", {
    shapes: [task],
    delta: { x: 0, y: 0 },
    position: { x: 300, y: 200 },
    target: collabRoot,
  });
  assert.ok(!moveAllowed, "move stays rejected when collaboration has no process");

  const createAllowed = rules.allowed("shape.create", {
    shape: task,
    target: collabRoot,
    position: { x: 300, y: 200 },
  });
  assert.ok(!createAllowed, "create stays rejected when collaboration has no process");
  modeler.destroy();
});

test("pass-through: drop onto another shape is not forced by the rule", { skip: !HAS_DOM }, async () => {
  const window = setupDom();
  const modeler = await createModeler(window, PROCESS_XML);
  const registry = modeler.get("elementRegistry");
  const rules = modeler.get("rules");

  const taskA = registry.get("Task_A");
  const taskB = registry.get("Task_B");
  const allowed = rules.allowed("elements.move", {
    shapes: [taskA],
    delta: { x: 5, y: 0 },
    position: { x: 430, y: 120 },
    target: taskB,
  });
  assert.equal(allowed, false, "stock rejection on shape target preserved");
  modeler.destroy();
});

test("shape.create onto collaboration root: allowed and created inside first participant", { skip: !HAS_DOM }, async () => {
  const window = setupDom();
  const modeler = await createModeler(window, COLLAB_XML);
  const registry = modeler.get("elementRegistry");
  const rules = modeler.get("rules");
  const modeling = modeler.get("modeling");
  const elementFactory = modeler.get("elementFactory");
  const canvas = modeler.get("canvas");

  const collabRoot = canvas.getRootElement();
  const participant1 = registry.get("Participant_1");
  const task = elementFactory.createShape({ type: "bpmn:Task" });

  const allowed = rules.allowed("shape.create", {
    shape: task,
    target: collabRoot,
    position: { x: 700, y: 150 },
  });
  assert.equal(allowed, true);

  modeling.createShape(task, { x: 700, y: 150 }, collabRoot);

  assert.equal(task.parent, participant1, "created task lands in first process participant");
  modeler.destroy();
});
