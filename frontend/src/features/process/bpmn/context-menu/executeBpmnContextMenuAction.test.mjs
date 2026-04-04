import test from "node:test";
import assert from "node:assert/strict";
import { executeBpmnContextMenuAction } from "./executeBpmnContextMenuAction.js";

function createStubModeler({
  root,
  registryItems = [],
  createShapeImpl = null,
  updateLabelImpl = null,
  updatePropertiesImpl = null,
  viewbox = { x: 100, y: 50, scale: 2 },
  rect = { left: 10, top: 20 },
  commandStack = null,
} = {}) {
  const calls = [];
  const labelCalls = [];
  const elementById = new Map();
  registryItems.forEach((item) => {
    if (item?.id) elementById.set(String(item.id), item);
  });
  if (root?.id) elementById.set(String(root.id), root);

  const modeling = {
    createShape(shapeLike, pos, parent) {
      calls.push({
        type: String(shapeLike?.type || ""),
        pos: { x: Number(pos?.x || 0), y: Number(pos?.y || 0) },
        parent,
      });
      if (typeof createShapeImpl === "function") {
        return createShapeImpl(shapeLike, pos, parent);
      }
      return {
        id: `Created_${calls.length}`,
        type: String(shapeLike?.type || ""),
        businessObject: { $type: String(shapeLike?.type || "") },
        x: Number(pos?.x || 0),
        y: Number(pos?.y || 0),
        width: 120,
        height: 80,
        parent,
      };
    },
    connect() {
      return null;
    },
    removeShape() {
    },
    removeConnection() {
    },
    updateLabel(element, text) {
      const value = String(text ?? "");
      labelCalls.push({
        id: String(element?.id || ""),
        value,
      });
      if (typeof updateLabelImpl === "function") {
        updateLabelImpl(element, text);
      }
    },
    updateProperties(element, attrs) {
      if (typeof updatePropertiesImpl === "function") {
        updatePropertiesImpl(element, attrs);
      }
      if (attrs && typeof attrs === "object") {
        const bo = element?.businessObject || (element.businessObject = {});
        Object.keys(attrs).forEach((key) => {
          bo[key] = attrs[key];
        });
      }
    },
  };

  const moddle = {
    create(type, attrs = {}) {
      return { $type: String(type || ""), ...attrs };
    },
  };

  const canvas = {
    _container: {
      getBoundingClientRect() {
        return {
          left: Number(rect.left || 0),
          top: Number(rect.top || 0),
          right: Number(rect.left || 0) + 1000,
          bottom: Number(rect.top || 0) + 800,
        };
      },
    },
    viewbox() {
      return {
        x: Number(viewbox.x || 0),
        y: Number(viewbox.y || 0),
        scale: Number(viewbox.scale || 1),
      };
    },
    zoom() {
      return Number(viewbox.scale || 1);
    },
    getRootElement() {
      return root || null;
    },
    scrollToElement() {
    },
  };

  const registry = {
    get(id) {
      return elementById.get(String(id || "")) || null;
    },
    getAll() {
      return registryItems.slice();
    },
  };

  const inst = {
    get(key) {
      if (key === "modeling") return modeling;
      if (key === "elementFactory") {
        return {
          createShape(input = {}) {
            return { type: String(input?.type || "") };
          },
        };
      }
      if (key === "canvas") return canvas;
      if (key === "elementRegistry") return registry;
      if (key === "selection") return { select() {} };
      if (key === "directEditing") return { activate() {} };
      if (key === "commandStack") return commandStack;
      if (key === "moddle") return moddle;
      return null;
    },
  };

  return { inst, calls, labelCalls };
}

test("canvas create task: resolves lane click to participant parent and guards DI/flowElements collections", async () => {
  const root = {
    id: "Collaboration_1",
    type: "bpmn:Collaboration",
    businessObject: { $type: "bpmn:Collaboration" },
    di: {},
    children: [],
  };
  const participant = {
    id: "Participant_1",
    type: "bpmn:Participant",
    x: 120,
    y: 120,
    width: 500,
    height: 320,
    businessObject: {
      $type: "bpmn:Participant",
      processRef: {},
    },
    parent: root,
    children: [],
  };
  const lane = {
    id: "Lane_1",
    type: "bpmn:Lane",
    x: 150,
    y: 140,
    width: 450,
    height: 280,
    businessObject: { $type: "bpmn:Lane" },
    parent: participant,
    children: [],
  };
  root.children = [participant];
  participant.children = [lane];

  const { inst, calls } = createStubModeler({
    root,
    registryItems: [root, participant, lane],
  });

  const result = await executeBpmnContextMenuAction({
    payloadRaw: {
      actionId: "create_task",
      clientX: 350,
      clientY: 260,
      target: { kind: "canvas" },
    },
    modelerRef: { current: inst },
  });

  assert.equal(result.ok, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].parent, participant);
  assert.ok(Array.isArray(root?.di?.planeElement));
  assert.ok(Array.isArray(participant?.businessObject?.processRef?.flowElements));
});

test("canvas create uses viewport-aware client->diagram coordinate translation", async () => {
  const root = {
    id: "Process_1",
    type: "bpmn:Process",
    businessObject: { $type: "bpmn:Process", flowElements: [] },
    di: { planeElement: [] },
    children: [],
  };
  const { inst, calls } = createStubModeler({
    root,
    registryItems: [root],
    viewbox: { x: 100, y: 50, scale: 2 },
    rect: { left: 10, top: 20 },
  });

  const result = await executeBpmnContextMenuAction({
    payloadRaw: {
      actionId: "create_gateway",
      clientX: 210,
      clientY: 220,
      target: { kind: "canvas" },
    },
    modelerRef: { current: inst },
  });

  assert.equal(result.ok, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].parent, root);
  assert.deepEqual(calls[0].pos, { x: 200, y: 150 });
});

test("canvas create supports start/end/subprocess action ids without runtime errors", async () => {
  const root = {
    id: "Process_1",
    type: "bpmn:Process",
    businessObject: { $type: "bpmn:Process", flowElements: [] },
    di: { planeElement: [] },
    children: [],
  };
  const { inst, calls } = createStubModeler({
    root,
    registryItems: [root],
  });
  const scenarios = [
    { actionId: "create_start_event", expectedType: "bpmn:StartEvent" },
    { actionId: "create_end_event", expectedType: "bpmn:EndEvent" },
    { actionId: "create_subprocess", expectedType: "bpmn:SubProcess" },
  ];

  for (const row of scenarios) {
    const result = await executeBpmnContextMenuAction({
      payloadRaw: {
        actionId: row.actionId,
        clientX: 220,
        clientY: 240,
        target: { kind: "canvas" },
      },
      modelerRef: { current: inst },
    });
    assert.equal(result.ok, true, row.actionId);
  }

  const createdTypes = calls.map((row) => row.type);
  assert.ok(createdTypes.includes("bpmn:StartEvent"));
  assert.ok(createdTypes.includes("bpmn:EndEvent"));
  assert.ok(createdTypes.includes("bpmn:SubProcess"));
});

test("canvas add annotation: initializes artifacts collection on participant processRef", async () => {
  const root = {
    id: "Collaboration_1",
    type: "bpmn:Collaboration",
    businessObject: { $type: "bpmn:Collaboration" },
    di: {},
    children: [],
  };
  const participant = {
    id: "Participant_1",
    type: "bpmn:Participant",
    x: 120,
    y: 120,
    width: 500,
    height: 320,
    businessObject: {
      $type: "bpmn:Participant",
      processRef: { flowElements: [] },
    },
    parent: root,
    children: [],
  };
  root.children = [participant];

  const { inst, calls } = createStubModeler({
    root,
    registryItems: [root, participant],
  });

  const result = await executeBpmnContextMenuAction({
    payloadRaw: {
      actionId: "add_annotation",
      clientX: 280,
      clientY: 220,
      target: { kind: "canvas" },
    },
    modelerRef: { current: inst },
  });

  assert.equal(result.ok, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].parent, participant);
  assert.ok(Array.isArray(participant?.businessObject?.processRef?.artifacts));
});

test("undo/redo actions route through commandStack", async () => {
  const calls = [];
  const commandStack = {
    canUndo() {
      return true;
    },
    canRedo() {
      return true;
    },
    undo() {
      calls.push("undo");
    },
    redo() {
      calls.push("redo");
    },
  };
  const { inst } = createStubModeler({
    root: {
      id: "Process_1",
      type: "bpmn:Process",
      businessObject: { $type: "bpmn:Process", flowElements: [] },
      di: { planeElement: [] },
      children: [],
    },
    registryItems: [],
    commandStack,
  });

  const undoResult = await executeBpmnContextMenuAction({
    payloadRaw: { actionId: "undo" },
    modelerRef: { current: inst },
  });
  const redoResult = await executeBpmnContextMenuAction({
    payloadRaw: { actionId: "redo" },
    modelerRef: { current: inst },
  });
  assert.equal(undoResult.ok, true);
  assert.equal(redoResult.ok, true);
  assert.deepEqual(calls, ["undo", "redo"]);
});

test("open_properties returns overlay payload with BPMN fields", async () => {
  const task = {
    id: "Task_1",
    type: "bpmn:Task",
    businessObject: {
      $type: "bpmn:Task",
      name: "Проверка",
      documentation: [{ $type: "bpmn:Documentation", text: "Текст документации" }],
      extensionElements: {
        values: [
          {
            $type: "camunda:Properties",
            values: [{ $type: "camunda:Property", name: "priority", value: "high" }],
          },
          {
            $type: "pm:RobotMeta",
            robot: "scale_01",
            retry: "3",
          },
        ],
      },
    },
  };
  const { inst } = createStubModeler({ root: task, registryItems: [task] });
  const result = await executeBpmnContextMenuAction({
    payloadRaw: {
      actionId: "open_properties",
      target: { id: "Task_1" },
    },
    modelerRef: { current: inst },
  });

  assert.equal(result.ok, true);
  assert.equal(result.openPropertiesOverlay?.elementId, "Task_1");
  assert.equal(result.openPropertiesOverlay?.elementName, "Проверка");
  assert.equal(result.openPropertiesOverlay?.bpmnType, "bpmn:Task");
  assert.equal(Array.isArray(result.openPropertiesOverlay?.documentation), true);
  assert.equal(result.openPropertiesOverlay?.documentation?.[0]?.text, "Текст документации");
  assert.equal(result.openPropertiesOverlay?.extensionProperties?.[0]?.name, "priority");
});

test("properties overlay updates name through canonical modeling path", async () => {
  const task = {
    id: "Task_1",
    type: "bpmn:Task",
    businessObject: { $type: "bpmn:Task", name: "Старое имя" },
  };
  let updatedName = "";
  const { inst } = createStubModeler({
    root: task,
    registryItems: [task],
    updateLabelImpl: (element, text) => {
      updatedName = String(text || "");
      if (element?.businessObject) element.businessObject.name = updatedName;
    },
  });

  const result = await executeBpmnContextMenuAction({
    payloadRaw: {
      actionId: "properties_overlay_update_name",
      target: { id: "Task_1" },
      value: "Новое имя",
    },
    modelerRef: { current: inst },
  });

  assert.equal(result.ok, true);
  assert.equal(updatedName, "Новое имя");
  assert.equal(task.businessObject.name, "Новое имя");
});

test("properties overlay updates documentation and extension values", async () => {
  const task = {
    id: "Task_1",
    type: "bpmn:Task",
    businessObject: {
      $type: "bpmn:Task",
      name: "Шаг",
      extensionElements: {
        values: [
          {
            $type: "camunda:Properties",
            values: [{ $type: "camunda:Property", name: "priority", value: "high" }],
          },
        ],
      },
    },
  };
  let updatePropsCalls = 0;
  const { inst } = createStubModeler({
    root: task,
    registryItems: [task],
    updatePropertiesImpl: () => {
      updatePropsCalls += 1;
    },
  });

  const docResult = await executeBpmnContextMenuAction({
    payloadRaw: {
      actionId: "properties_overlay_update_documentation",
      target: { id: "Task_1" },
      documentation: [{ text: "Новая документация" }],
    },
    modelerRef: { current: inst },
  });
  assert.equal(docResult.ok, true);
  assert.equal(task.businessObject.documentation?.[0]?.text, "Новая документация");

  const extResult = await executeBpmnContextMenuAction({
    payloadRaw: {
      actionId: "properties_overlay_update_extension_property",
      target: { id: "Task_1" },
      propertyName: "priority",
      value: "low",
    },
    modelerRef: { current: inst },
  });
  assert.equal(extResult.ok, true);
  assert.equal(
    task.businessObject.extensionElements.values[0].values[0].value,
    "low",
  );
  assert.equal(updatePropsCalls >= 2, true);
});

test("undo action returns explicit unavailable error when commandStack cannot undo", async () => {
  const { inst } = createStubModeler({
    root: {
      id: "Process_1",
      type: "bpmn:Process",
      businessObject: { $type: "bpmn:Process", flowElements: [] },
      di: { planeElement: [] },
      children: [],
    },
    registryItems: [],
    commandStack: {
      canUndo() {
        return false;
      },
      canRedo() {
        return false;
      },
    },
  });

  const result = await executeBpmnContextMenuAction({
    payloadRaw: { actionId: "undo" },
    modelerRef: { current: inst },
  });

  assert.equal(result.ok, false);
  assert.equal(result.error, "undo_unavailable");
});

test("quick_set_name updates BPMN label through canonical modeling.updateLabel path", async () => {
  const task = {
    id: "Task_1",
    type: "bpmn:Task",
    businessObject: { $type: "bpmn:Task", name: "Старое имя" },
  };
  const root = {
    id: "Process_1",
    type: "bpmn:Process",
    businessObject: { $type: "bpmn:Process", flowElements: [task] },
    di: { planeElement: [] },
    children: [task],
  };
  task.parent = root;

  const { inst, labelCalls } = createStubModeler({
    root,
    registryItems: [root, task],
  });

  const result = await executeBpmnContextMenuAction({
    payloadRaw: {
      actionId: "quick_set_name",
      target: { id: "Task_1" },
      value: "Новое имя шага",
    },
    modelerRef: { current: inst },
  });

  assert.equal(result.ok, true);
  assert.deepEqual(labelCalls, [{ id: "Task_1", value: "Новое имя шага" }]);
});

test("quick_set_flow_label updates sequence flow label", async () => {
  const flow = {
    id: "Flow_1",
    type: "bpmn:SequenceFlow",
    businessObject: { $type: "bpmn:SequenceFlow", name: "Старый текст" },
    waypoints: [{ x: 0, y: 0 }, { x: 100, y: 100 }],
  };
  const root = {
    id: "Process_1",
    type: "bpmn:Process",
    businessObject: { $type: "bpmn:Process", flowElements: [flow] },
    di: { planeElement: [] },
    children: [flow],
  };
  flow.parent = root;

  const { inst, labelCalls } = createStubModeler({
    root,
    registryItems: [root, flow],
  });

  const result = await executeBpmnContextMenuAction({
    payloadRaw: {
      actionId: "quick_set_flow_label",
      target: { id: "Flow_1" },
      value: "Да",
    },
    modelerRef: { current: inst },
  });

  assert.equal(result.ok, true);
  assert.deepEqual(labelCalls, [{ id: "Flow_1", value: "Да" }]);
});

test("open_inside returns read-only subprocess preview and does not require drilldown provider", async () => {
  const subprocess = {
    id: "SubProcess_1",
    type: "bpmn:SubProcess",
    businessObject: {
      $type: "bpmn:SubProcess",
      name: "Подготовка",
      flowElements: [
        { id: "StartEvent_1", $type: "bpmn:StartEvent", name: "Начало" },
        { id: "Task_1", $type: "bpmn:Task", name: "Проверить ёмкость" },
        { id: "Gateway_1", $type: "bpmn:ExclusiveGateway", name: "Достаточно?" },
        { id: "EndEvent_1", $type: "bpmn:EndEvent", name: "Завершить" },
        { id: "Flow_1", $type: "bpmn:SequenceFlow", name: "" },
      ],
    },
  };
  const root = {
    id: "Process_1",
    type: "bpmn:Process",
    businessObject: { $type: "bpmn:Process", flowElements: [subprocess] },
    di: { planeElement: [] },
    children: [subprocess],
  };
  subprocess.parent = root;

  const { inst } = createStubModeler({
    root,
    registryItems: [root, subprocess],
  });
  const originalGet = inst.get.bind(inst);
  inst.get = (key) => {
    if (String(key || "") === "drilldown") {
      throw new Error('No provider for "drilldown"!');
    }
    return originalGet(key);
  };

  const result = await executeBpmnContextMenuAction({
    payloadRaw: {
      actionId: "open_inside",
      target: { id: "SubProcess_1" },
      clientX: 220,
      clientY: 220,
    },
    modelerRef: { current: inst },
  });

  assert.equal(result.ok, true);
  assert.equal(result.openInsidePreview?.title, "Подготовка");
  assert.equal(result.openInsidePreview?.internalId, "SubProcess_1");
  assert.equal(result.openInsidePreview?.summary?.stepCount, 4);
  assert.equal(result.openInsidePreview?.summary?.transitionCount, 1);
  assert.equal(result.openInsidePreview?.summary?.hasStart, true);
  assert.equal(result.openInsidePreview?.summary?.hasEnd, true);
  assert.equal(result.openInsidePreview?.summary?.hasGateway, true);
  assert.ok(Array.isArray(result.openInsidePreview?.items));
  assert.equal(result.openInsidePreview.items.length, 4);
  assert.ok(Array.isArray(result.openInsidePreview.items[0]?.keyBpmnAttrs));
  assert.ok(Array.isArray(result.openInsidePreview.items[0]?.customProperties));
  assert.ok(Array.isArray(result.openInsidePreview.items[0]?.extensionProperties));
  assert.ok(Array.isArray(result.openInsidePreview.items[0]?.timerAndListeners));
  assert.ok(Array.isArray(result.openInsidePreview.items[0]?.robotMeta));
  assert.ok(Array.isArray(result.openInsidePreview.items[0]?.executionAttrs));
});
