import test from "node:test";
import assert from "node:assert/strict";
import {
  canCopyBpmnElement,
  copyBpmnElementToClipboard,
  pasteCopiedBpmnElementFromClipboard,
  readCopiedBpmnElementSnapshot,
  resetBpmnElementClipboardForTests,
  resolveBpmnPastePoint,
} from "./bpmnElementClipboard.js";

function createMockModdle() {
  return {
    create(type, attrs = {}) {
      return {
        $type: String(type || ""),
        ...attrs,
      };
    },
  };
}

test("copy clipboard snapshot preserves supported semantic payload and omits ids", () => {
  resetBpmnElementClipboardForTests();
  const element = {
    id: "Task_1",
    type: "bpmn:Task",
    x: 100,
    y: 160,
    width: 120,
    height: 80,
    businessObject: {
      $type: "bpmn:Task",
      id: "Task_1",
      name: "Исходный шаг",
      documentation: [{ $type: "bpmn:Documentation", text: "docs" }],
      extensionElements: {
        $type: "bpmn:ExtensionElements",
        values: [
          {
            $type: "camunda:Properties",
            values: [{ $type: "camunda:Property", name: "priority", value: "high" }],
          },
        ],
      },
      $attrs: { "pm:kind": "robot" },
      pmCustomFlag: "flag-1",
    },
  };

  const copied = copyBpmnElementToClipboard(element);
  const snapshot = readCopiedBpmnElementSnapshot();

  assert.equal(copied.ok, true);
  assert.equal(snapshot?.type, "bpmn:Task");
  assert.equal(snapshot?.name, "Исходный шаг");
  assert.equal(snapshot?.semanticPayload?.documentation?.[0]?.text, "docs");
  assert.equal(snapshot?.semanticPayload?.extensionElements?.values?.[0]?.values?.[0]?.value, "high");
  assert.equal(snapshot?.semanticPayload?.attrs?.["pm:kind"], "robot");
  assert.equal(snapshot?.semanticPayload?.custom?.pmCustomFlag, "flag-1");
  assert.equal(Object.prototype.hasOwnProperty.call(snapshot?.semanticPayload || {}, "id"), false);
});

test("paste clipboard snapshot creates new shape and rehydrates semantic payload", () => {
  resetBpmnElementClipboardForTests();
  copyBpmnElementToClipboard({
    id: "Task_1",
    type: "bpmn:Task",
    x: 100,
    y: 120,
    width: 140,
    height: 90,
    businessObject: {
      $type: "bpmn:Task",
      name: "Копия шага",
      documentation: [{ $type: "bpmn:Documentation", text: "docs" }],
      extensionElements: {
        $type: "bpmn:ExtensionElements",
        values: [
          {
            $type: "camunda:Properties",
            values: [{ $type: "camunda:Property", name: "priority", value: "high" }],
          },
        ],
      },
      $attrs: { "pm:kind": "robot" },
      pmCustomFlag: "flag-1",
    },
  });

  const created = [];
  const result = pasteCopiedBpmnElementFromClipboard({
    modeling: {
      createShape(shapeLike, pos, parent) {
        const shape = {
          id: "Task_2",
          type: shapeLike.type,
          x: pos.x,
          y: pos.y,
          width: shapeLike.width,
          height: shapeLike.height,
          parent,
          businessObject: shapeLike.businessObject || { $type: shapeLike.type },
          di: { id: "undefined_di" },
        };
        created.push(shape);
        return shape;
      },
      updateLabel(element, name) {
        element.businessObject.name = name;
      },
    },
    elementFactory: {
      createShape(attrs) {
        return { ...attrs };
      },
    },
    moddle: createMockModdle(),
    parent: { id: "Process_1" },
    point: { x: 300, y: 240 },
  });

  assert.equal(result.ok, true);
  assert.equal(created.length, 1);
  assert.equal(created[0].id, "Task_2");
  assert.equal(created[0].businessObject.id, "Task_2");
  assert.equal(created[0].di.id, "Task_2_di");
  assert.equal(created[0].businessObject.name, "Копия шага");
  assert.equal(created[0].businessObject.documentation?.[0]?.text, "docs");
  assert.equal(created[0].businessObject.extensionElements?.values?.[0]?.values?.[0]?.value, "high");
  assert.equal(
    created[0].businessObject["pm:kind"] || created[0].businessObject?.$attrs?.["pm:kind"],
    "robot",
  );
  assert.equal(created[0].businessObject.pmCustomFlag, "flag-1");
});

test("collapsed subprocess paste creates businessObject id before createShape runs", () => {
  resetBpmnElementClipboardForTests();
  copyBpmnElementToClipboard({
    id: "Activity_1",
    type: "bpmn:SubProcess",
    x: 100,
    y: 120,
    width: 180,
    height: 120,
    collapsed: true,
    di: { isExpanded: false },
    businessObject: {
      $type: "bpmn:SubProcess",
      name: "Collapsed copy",
    },
  });

  const calls = [];
  const result = pasteCopiedBpmnElementFromClipboard({
    modeling: {
      createShape(shapeLike, pos, parent) {
        calls.push({
          shapeId: shapeLike.id,
          businessObjectId: shapeLike.businessObject?.id || "",
          diId: shapeLike.di?.id || "",
        });
        return {
          id: shapeLike.id || "Activity_2",
          type: shapeLike.type,
          x: pos.x,
          y: pos.y,
          width: shapeLike.width,
          height: shapeLike.height,
          parent,
          collapsed: true,
          businessObject: shapeLike.businessObject || { $type: shapeLike.type },
          di: shapeLike.di || { id: "undefined_di", isExpanded: false },
        };
      },
      updateLabel(element, name) {
        element.businessObject.name = name;
      },
    },
    elementFactory: {
      _bpmnFactory: {
        create(type) {
          return { $type: type, id: "Activity_2" };
        },
      },
      createShape(attrs) {
        return {
          ...attrs,
          id: attrs.businessObject?.id || attrs.id,
          di: attrs.businessObject?.id
            ? { id: `${attrs.businessObject.id}_di`, isExpanded: false }
            : { id: "undefined_di", isExpanded: false },
        };
      },
    },
    moddle: createMockModdle(),
    parent: { id: "Process_1" },
    point: { x: 300, y: 240 },
  });

  assert.equal(result.ok, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].businessObjectId, "Activity_2");
  assert.equal(calls[0].shapeId, "Activity_2");
  assert.equal(calls[0].diId, "Activity_2_di");
});

test("copy clipboard snapshot stores native tree for subprocess subtree copy", () => {
  resetBpmnElementClipboardForTests();
  const copied = copyBpmnElementToClipboard({
    id: "SubProcess_1",
    type: "bpmn:SubProcess",
    x: 100,
    y: 120,
    width: 220,
    height: 160,
    businessObject: {
      $type: "bpmn:SubProcess",
      name: "Expanded Source",
      flowElements: [
        { id: "InnerTask_1", $type: "bpmn:Task", name: "Inner task" },
      ],
    },
  }, {
    nativeTree: {
      0: [
        { id: "SubProcess_1", type: "bpmn:SubProcess" },
        { id: "InnerTask_1", type: "bpmn:Task", parent: "SubProcess_1" },
      ],
    },
  });

  const snapshot = readCopiedBpmnElementSnapshot();
  assert.equal(copied.ok, true);
  assert.equal(snapshot?.mode, "native_tree");
  assert.deepEqual(snapshot?.sourceDescriptorIds, ["SubProcess_1", "InnerTask_1"]);
  assert.equal(snapshot?.nativeTree?.[0]?.[1]?.id, "InnerTask_1");
});

test("paste clipboard native tree uses direct copyPaste path and exposes remap", () => {
  resetBpmnElementClipboardForTests();
  copyBpmnElementToClipboard({
    id: "SubProcess_1",
    type: "bpmn:SubProcess",
    x: 100,
    y: 120,
    width: 220,
    height: 160,
    businessObject: {
      $type: "bpmn:SubProcess",
      name: "Expanded Source",
    },
  }, {
    nativeTree: {
      0: [
        { id: "SubProcess_1", type: "bpmn:SubProcess" },
        { id: "InnerTask_1", type: "bpmn:Task", parent: "SubProcess_1" },
      ],
    },
  });

  const listeners = new Set();
  const result = pasteCopiedBpmnElementFromClipboard({
    copyPaste: {
      paste() {
        const cache = {
          SubProcess_1: { id: "SubProcess_2" },
          InnerTask_1: { id: "InnerTask_2" },
        };
        listeners.forEach((listener) => listener({ cache, descriptor: { id: "SubProcess_1" } }));
        return [cache.SubProcess_1, cache.InnerTask_1];
      },
    },
    eventBus: {
      on(eventName, listener) {
        if (String(eventName || "") === "copyPaste.pasteElement") listeners.add(listener);
      },
      off(eventName, listener) {
        if (String(eventName || "") === "copyPaste.pasteElement") listeners.delete(listener);
      },
    },
    parent: { id: "Process_1" },
    point: { x: 320, y: 260 },
  });

  assert.equal(result.ok, true);
  assert.equal(result.createdElement?.id, "SubProcess_2");
  assert.deepEqual(result.remap, {
    SubProcess_1: "SubProcess_2",
    InnerTask_1: "InnerTask_2",
  });
  assert.deepEqual(result.changedIds, ["SubProcess_2", "InnerTask_2"]);
});

test("resolveBpmnPastePoint prefers nearby offset for selected target and falls back to snapshot source point", () => {
  resetBpmnElementClipboardForTests();
  copyBpmnElementToClipboard({
    id: "Task_1",
    type: "bpmn:Task",
    x: 100,
    y: 120,
    width: 140,
    height: 90,
    businessObject: { $type: "bpmn:Task", name: "Шаг" },
  });

  assert.deepEqual(resolveBpmnPastePoint({
    target: { x: 200, y: 160, width: 120, height: 80 },
  }), { x: 368, y: 184 });
  assert.deepEqual(resolveBpmnPastePoint({}), { x: 148, y: 144 });
});

test("copy support rejects connections and root lane-like shapes", () => {
  resetBpmnElementClipboardForTests();
  assert.equal(canCopyBpmnElement({
    id: "Flow_1",
    type: "bpmn:SequenceFlow",
    waypoints: [],
    businessObject: { $type: "bpmn:SequenceFlow" },
  }), false);
  assert.equal(canCopyBpmnElement({
    id: "Lane_1",
    type: "bpmn:Lane",
    x: 10,
    y: 20,
    width: 300,
    height: 120,
    businessObject: { $type: "bpmn:Lane" },
  }), false);
});

test("copy clipboard snapshot merges draft camunda state when source businessObject lacks managed entries", () => {
  resetBpmnElementClipboardForTests();
  const copied = copyBpmnElementToClipboard({
    id: "Task_1",
    type: "bpmn:Task",
    x: 100,
    y: 120,
    width: 140,
    height: 90,
    businessObject: {
      $type: "bpmn:Task",
      name: "Шаг из runtime",
      documentation: [{ $type: "bpmn:Documentation", text: "docs" }],
      extensionElements: {
        $type: "bpmn:ExtensionElements",
        values: [{ $type: "pm:RobotMeta", version: "v1", json: "{\"robot_meta_version\":\"v1\"}" }],
      },
    },
  }, {
    camundaExtensionState: {
      properties: {
        extensionProperties: [],
        extensionListeners: [],
      },
      preservedExtensionElements: [
        '<camunda:Properties xmlns:camunda="http://camunda.org/schema/1.0/bpmn"><camunda:Property name="priority" value="high" /></camunda:Properties>',
        '<pm:RobotMeta xmlns:pm="http://processmap.ai/schema/bpmn/1.0" version="v1">{"robot_meta_version":"v1"}</pm:RobotMeta>',
      ],
    },
  });
  const snapshot = readCopiedBpmnElementSnapshot();

  assert.equal(copied.ok, true);
  assert.equal(snapshot?.semanticPayload?.extensionElements?.values?.some((entry) => entry?.$type === "camunda:Properties"), true);
  const props = snapshot?.semanticPayload?.extensionElements?.values?.find((entry) => entry?.$type === "camunda:Properties");
  assert.equal(props?.values?.[0]?.name, "priority");
  assert.equal(props?.values?.[0]?.value, "high");
  assert.equal(
    snapshot?.semanticPayload?.extensionElements?.values?.filter((entry) => entry?.$type === "pm:RobotMeta").length,
    1,
  );
});
