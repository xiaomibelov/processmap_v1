import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";

import { applyUserNotesDecor, clearUserNotesDecor } from "./decorManager.js";

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function asObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function toText(value) {
  return String(value ?? "").trim();
}

function createNodeElement() {
  const children = [];
  return {
    className: "",
    dataset: {},
    style: {},
    textContent: "",
    title: "",
    hidden: false,
    childNodes: children,
    classList: {
      add() {},
      remove() {},
      contains() { return false; },
    },
    appendChild(node) {
      children.push(node);
      return node;
    },
    addEventListener() {},
    setAttribute() {},
  };
}

function withDom(run) {
  const dom = new JSDOM("<!doctype html><html><body></body></html>");
  const prevDocument = globalThis.document;
  const prevDomParser = globalThis.DOMParser;
  globalThis.document = {
    createElement() {
      return createNodeElement();
    },
  };
  globalThis.DOMParser = dom.window.DOMParser;
  try {
    run();
  } finally {
    globalThis.document = prevDocument;
    globalThis.DOMParser = prevDomParser;
  }
}

function createCanvasMock() {
  const markers = [];
  return {
    markers,
    _container: {
      querySelectorAll() {
        return [];
      },
    },
    addMarker(elementId, className) {
      markers.push({ op: "add", elementId: String(elementId || ""), className: String(className || "") });
    },
    removeMarker(elementId, className) {
      markers.push({ op: "remove", elementId: String(elementId || ""), className: String(className || "") });
    },
  };
}

function createOverlaysMock() {
  let seq = 0;
  const addCalls = [];
  const removeCalls = [];
  return {
    addCalls,
    removeCalls,
    add(elementId, payload) {
      seq += 1;
      const id = `ov_${seq}`;
      addCalls.push({ id, elementId: String(elementId || ""), payload: asObject(payload) });
      return id;
    },
    remove(id) {
      removeCalls.push(String(id || ""));
    },
  };
}

function createRegistry(elements) {
  const all = asArray(elements);
  const byId = new Map(all.map((row) => [String(row?.id || ""), row]));
  return {
    get(id) {
      return byId.get(String(id || "")) || null;
    },
    getAll() {
      return all;
    },
  };
}

function createCtx({ elements = [], bpmnXml = "", notesByElement = {} } = {}) {
  const canvas = createCanvasMock();
  const overlays = createOverlaysMock();
  const registry = createRegistry(elements);
  const inst = {
    get(name) {
      if (name === "canvas") return canvas;
      if (name === "overlays") return overlays;
      if (name === "elementRegistry") return registry;
      return null;
    },
  };
  const refs = {
    userNotesDecorStateRef: { current: { viewer: {}, editor: {} } },
  };
  const ctx = {
    inst,
    kind: "viewer",
    refs,
    readOnly: {
      draftRef: { current: { bpmn_xml: bpmnXml } },
    },
    getters: {
      isInterviewDecorModeOn: () => false,
      getElementNotesMap: () => asObject(notesByElement),
      isShapeElement: (el) => !!el && !Array.isArray(el?.waypoints),
      isConnectionElement: (el) => Array.isArray(el?.waypoints),
      findShapeByNodeId: (r, id) => r.get(id),
      findShapeForHint: (r, hint) => r.get(hint?.nodeId),
    },
    callbacks: {
      setSelectedDecor() {},
      emitElementSelection() {},
    },
    utils: {
      asArray,
      asObject,
      toText,
    },
  };
  return { ctx, overlays };
}

function hasDocumentationBadge(stackNode) {
  return asArray(stackNode?.childNodes).some((node) => toText(node?.dataset?.badgeKind) === "documentation");
}

test("existing task with XML documentation gets docs badge", () => {
  withDom(() => {
    const fixture = createCtx({
      elements: [
        {
          id: "Task_existing",
          type: "bpmn:Task",
          businessObject: { id: "Task_existing", $type: "bpmn:Task", documentation: [] },
        },
      ],
      bpmnXml: `<?xml version="1.0" encoding="UTF-8"?>
        <bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL">
          <bpmn:process id="Process_1">
            <bpmn:task id="Task_existing"><bpmn:documentation>Из XML</bpmn:documentation></bpmn:task>
          </bpmn:process>
        </bpmn:definitions>`,
    });
    applyUserNotesDecor(fixture.ctx);
    assert.equal(fixture.overlays.addCalls.length, 1);
    assert.equal(hasDocumentationBadge(fixture.overlays.addCalls[0]?.payload?.html), true);
  });
});

test("existing task without documentation keeps docs badge hidden", () => {
  withDom(() => {
    const fixture = createCtx({
      elements: [
        {
          id: "Task_plain",
          type: "bpmn:Task",
          businessObject: { id: "Task_plain", $type: "bpmn:Task", documentation: [] },
        },
      ],
      bpmnXml: `<?xml version="1.0" encoding="UTF-8"?>
        <bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL">
          <bpmn:process id="Process_1">
            <bpmn:task id="Task_plain" />
          </bpmn:process>
        </bpmn:definitions>`,
    });
    applyUserNotesDecor(fixture.ctx);
    assert.equal(fixture.overlays.addCalls.length, 0);
  });
});

test("template-inserted task with BO documentation gets docs badge", () => {
  withDom(() => {
    const fixture = createCtx({
      elements: [
        {
          id: "Task_inserted",
          type: "bpmn:Task",
          businessObject: {
            id: "Task_inserted",
            $type: "bpmn:Task",
            documentation: [{ text: "Из BO после insert" }],
          },
        },
      ],
      bpmnXml: "",
    });
    applyUserNotesDecor(fixture.ctx);
    assert.equal(fixture.overlays.addCalls.length, 1);
    assert.equal(hasDocumentationBadge(fixture.overlays.addCalls[0]?.payload?.html), true);
  });
});

test("reload-like rerender preserves docs badge visibility", () => {
  withDom(() => {
    const fixture = createCtx({
      elements: [
        {
          id: "Task_reload",
          type: "bpmn:Task",
          businessObject: { id: "Task_reload", $type: "bpmn:Task", documentation: [] },
        },
      ],
      bpmnXml: `<?xml version="1.0" encoding="UTF-8"?>
        <bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL">
          <bpmn:process id="Process_1">
            <bpmn:task id="Task_reload"><bpmn:documentation>Док после reload</bpmn:documentation></bpmn:task>
          </bpmn:process>
        </bpmn:definitions>`,
    });
    applyUserNotesDecor(fixture.ctx);
    clearUserNotesDecor(fixture.ctx);
    applyUserNotesDecor(fixture.ctx);
    assert.equal(fixture.overlays.addCalls.length, 2);
    assert.equal(hasDocumentationBadge(fixture.overlays.addCalls[1]?.payload?.html), true);
  });
});
