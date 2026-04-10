import test from "node:test";
import assert from "node:assert/strict";
import { resetBpmnElementClipboardForTests } from "../copy-paste/bpmnElementClipboard.js";
import {
  createBpmnContextMenuActionExecutor,
  executeBpmnContextMenuAction,
} from "./executeBpmnContextMenuAction.js";

function createStubModeler({
  root,
  registryItems = [],
  createShapeImpl = null,
  updateLabelImpl = null,
  updatePropertiesImpl = null,
  viewbox = { x: 100, y: 50, scale: 2 },
  rect = { left: 10, top: 20 },
  commandStack = null,
  copyPaste = null,
  eventBus = null,
} = {}) {
  const calls = [];
  const labelCalls = [];
  const selected = [];
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
      const created = {
        id: `Created_${calls.length}`,
        type: String(shapeLike?.type || ""),
        businessObject: shapeLike?.businessObject || { $type: String(shapeLike?.type || "") },
        x: Number(pos?.x || 0),
        y: Number(pos?.y || 0),
        width: 120,
        height: 80,
        parent,
      };
      elementById.set(String(created.id), created);
      return created;
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
            return { ...input, type: String(input?.type || "") };
          },
        };
      }
      if (key === "canvas") return canvas;
      if (key === "elementRegistry") return registry;
      if (key === "selection") {
        return {
          select(items = []) {
            selected.length = 0;
            items.forEach((item) => selected.push(item));
          },
          get() {
            return selected.slice();
          },
        };
      }
      if (key === "directEditing") return { activate() {} };
      if (key === "commandStack") return commandStack;
      if (key === "copyPaste") return copyPaste;
      if (key === "eventBus") return eventBus;
      if (key === "moddle") return moddle;
      return null;
    },
  };

  return { inst, calls, labelCalls, selected };
}

test.afterEach(() => {
  resetBpmnElementClipboardForTests();
});

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
  assert.equal(result.openPropertiesOverlay?.extensionProperties?.[0]?.key, "0:0:priority");
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

test("properties overlay updates documentation while preserving multiple entries and textFormat", async () => {
  const task = {
    id: "Task_1",
    type: "bpmn:Task",
    businessObject: {
      $type: "bpmn:Task",
      name: "Шаг",
      documentation: [
        { $type: "bpmn:Documentation", text: "Исходный текст", textFormat: "text/html" },
        { $type: "bpmn:Documentation", text: "Доп. описание", textFormat: "text/markdown" },
      ],
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
      documentation: [
        { text: "Новая документация", textFormat: "text/html" },
        { text: "Доп. описание", textFormat: "text/markdown" },
      ],
    },
    modelerRef: { current: inst },
  });
  assert.equal(docResult.ok, true);
  assert.deepEqual(task.businessObject.documentation, [
    { $type: "bpmn:Documentation", text: "Новая документация", textFormat: "text/html" },
    { $type: "bpmn:Documentation", text: "Доп. описание", textFormat: "text/markdown" },
  ]);
  assert.equal(updatePropsCalls >= 1, true);
});

test("properties overlay updates only the targeted duplicate-named extension row and keeps undo snapshot intact", async () => {
  const task = {
    id: "Task_1",
    type: "bpmn:Task",
    businessObject: {
      $type: "bpmn:Task",
      name: "Шаг",
      extensionElements: {
        $type: "bpmn:ExtensionElements",
        values: [
          {
            $type: "camunda:Properties",
            values: [{ $type: "camunda:Property", name: "priority", value: "high" }],
          },
          {
            $type: "camunda:Properties",
            values: [{ $type: "camunda:Property", name: "priority", value: "low" }],
          },
        ],
      },
    },
  };
  let commandBoundaryPreviousExt = null;
  let commandBoundaryNextExt = null;
  let commandBoundaryPreviousValue = "";
  const { inst } = createStubModeler({
    root: task,
    registryItems: [task],
    updatePropertiesImpl: (element, attrs) => {
      if (!attrs?.extensionElements) return;
      commandBoundaryPreviousExt = element.businessObject.extensionElements;
      commandBoundaryNextExt = attrs.extensionElements;
      commandBoundaryPreviousValue = String(
        commandBoundaryPreviousExt?.values?.[1]?.values?.[0]?.value ?? "",
      );
    },
  });

  const extResult = await executeBpmnContextMenuAction({
    payloadRaw: {
      actionId: "properties_overlay_update_extension_property",
      target: { id: "Task_1" },
      propertyName: "priority",
      propertyKey: "1:0:priority",
      value: "medium",
    },
    modelerRef: { current: inst },
  });

  assert.equal(extResult.ok, true);
  assert.equal(commandBoundaryPreviousValue, "low");
  assert.notEqual(commandBoundaryNextExt, commandBoundaryPreviousExt);
  assert.equal(commandBoundaryPreviousExt?.values?.[0]?.values?.[0]?.value, "high");
  assert.equal(commandBoundaryPreviousExt?.values?.[1]?.values?.[0]?.value, "low");
  assert.equal(task.businessObject.extensionElements.values[0].values[0].value, "high");
  assert.equal(task.businessObject.extensionElements.values[1].values[0].value, "medium");

  task.businessObject.extensionElements = commandBoundaryPreviousExt;
  assert.equal(task.businessObject.extensionElements.values[0].values[0].value, "high");
  assert.equal(task.businessObject.extensionElements.values[1].values[0].value, "low");

  task.businessObject.extensionElements = commandBoundaryNextExt;
  assert.equal(task.businessObject.extensionElements.values[0].values[0].value, "high");
  assert.equal(task.businessObject.extensionElements.values[1].values[0].value, "medium");
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

test("open_properties preserves selection handoff through context menu action entry", async () => {
  const task = {
    id: "Task_1",
    type: "bpmn:Task",
    businessObject: { $type: "bpmn:Task", name: "Approve" },
  };
  const root = {
    id: "Process_1",
    type: "bpmn:Process",
    businessObject: { $type: "bpmn:Process", flowElements: [task] },
    di: { planeElement: [] },
    children: [task],
  };
  task.parent = root;
  const selectionEvents = [];

  const { inst } = createStubModeler({
    root,
    registryItems: [root, task],
  });

  const result = await executeBpmnContextMenuAction({
    payloadRaw: {
      actionId: "open_properties",
      target: { id: "Task_1" },
    },
    modelerRef: { current: inst },
    emitElementSelection(element, source, extra) {
      selectionEvents.push({
        id: String(element?.id || ""),
        source: String(source || ""),
        selectedIds: Array.isArray(extra?.selectedIds) ? extra.selectedIds.slice() : [],
      });
    },
  });

  assert.equal(result.ok, true);
  assert.deepEqual(selectionEvents, [{
    id: "Task_1",
    source: "context_menu_properties",
    selectedIds: ["Task_1"],
  }]);
});

test("private context-menu executor preserves canonical open_properties selection handoff", async () => {
  const task = {
    id: "Task_1",
    type: "bpmn:Task",
    businessObject: { $type: "bpmn:Task", name: "Approve" },
  };
  const root = {
    id: "Process_1",
    type: "bpmn:Process",
    businessObject: { $type: "bpmn:Process", flowElements: [task] },
    di: { planeElement: [] },
    children: [task],
  };
  task.parent = root;
  const selectionEvents = [];

  const { inst } = createStubModeler({
    root,
    registryItems: [root, task],
  });
  const executeAction = createBpmnContextMenuActionExecutor({
    modelerRef: { current: inst },
    emitElementSelection(element, source, extra) {
      selectionEvents.push({
        id: String(element?.id || ""),
        source: String(source || ""),
        selectedIds: Array.isArray(extra?.selectedIds) ? extra.selectedIds.slice() : [],
      });
    },
  });

  const result = await executeAction({
    actionId: "open_properties",
    target: { id: "Task_1" },
  });

  assert.equal(result.ok, true);
  assert.deepEqual(selectionEvents, [{
    id: "Task_1",
    source: "context_menu_properties",
    selectedIds: ["Task_1"],
  }]);
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

test("copy_element calls backend clipboard copy and still keeps local in-tab snapshot", async () => {
  const task = {
    id: "Task_1",
    type: "bpmn:UserTask",
    x: 120,
    y: 160,
    width: 140,
    height: 90,
    businessObject: {
      $type: "bpmn:UserTask",
      name: "Backend copied task",
      documentation: [{ $type: "bpmn:Documentation", text: "docs" }],
    },
  };
  const root = {
    id: "Process_1",
    type: "bpmn:Process",
    businessObject: { $type: "bpmn:Process", flowElements: [task] },
    di: { planeElement: [] },
    children: [task],
  };
  task.parent = root;
  const backendCalls = [];
  const { inst } = createStubModeler({ root, registryItems: [root, task] });

  const result = await executeBpmnContextMenuAction({
    payloadRaw: {
      actionId: "copy_element",
      sessionId: "Session_A",
      target: { id: "Task_1" },
    },
    modelerRef: { current: inst },
    backendClipboard: {
      async copyElement(payload) {
        backendCalls.push(payload);
        return {
          ok: true,
          clipboard_item_type: "bpmn_task",
          schema_version: "pm_bpmn_task_clipboard_v1",
          copied_name: "Backend copied task",
        };
      },
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.backendClipboard, true);
  assert.equal(result.clipboardItemType, "bpmn_task");
  assert.deepEqual(backendCalls, [{ sessionId: "Session_A", elementId: "Task_1" }]);
  assert.equal(result.message, "Элемент скопирован в backend clipboard");
});

test("subprocess copy_element calls backend clipboard copy before local native-tree convenience snapshot", async () => {
  const subprocess = {
    id: "SubProcess_1",
    type: "bpmn:SubProcess",
    x: 220,
    y: 120,
    width: 300,
    height: 180,
    businessObject: {
      $type: "bpmn:SubProcess",
      name: "Backend subprocess",
      flowElements: [{ id: "InnerTask_1", $type: "bpmn:Task", name: "Inner" }],
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
  const backendCalls = [];
  const { inst } = createStubModeler({ root, registryItems: [root, subprocess] });

  const result = await executeBpmnContextMenuAction({
    payloadRaw: {
      actionId: "copy_element",
      sessionId: "Session_A",
      target: { id: "SubProcess_1" },
    },
    modelerRef: { current: inst },
    backendClipboard: {
      async copyElement(payload) {
        backendCalls.push(payload);
        return {
          ok: true,
          clipboard_item_type: "bpmn_subprocess_subtree",
          schema_version: "pm_bpmn_subprocess_subtree_clipboard_v2",
          copied_name: "Backend subprocess",
        };
      },
    },
    buildCopyElementOptions() {
      return {
        nativeTree: {
          0: [{ id: "SubProcess_1", type: "bpmn:SubProcess" }],
          1: [{ id: "InnerTask_1", type: "bpmn:Task", parent: "SubProcess_1" }],
        },
      };
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.backendClipboard, true);
  assert.equal(result.clipboardItemType, "bpmn_subprocess_subtree");
  assert.deepEqual(backendCalls, [{ sessionId: "Session_A", elementId: "SubProcess_1" }]);
});

test("paste uses backend clipboard when target tab has no local snapshot", async () => {
  const root = {
    id: "Process_1",
    type: "bpmn:Process",
    businessObject: { $type: "bpmn:Process", flowElements: [] },
    di: { planeElement: [] },
    children: [],
  };
  const backendCalls = [];
  const mutationEvents = [];
  const { inst, calls } = createStubModeler({ root, registryItems: [root] });

  const result = await executeBpmnContextMenuAction({
    payloadRaw: {
      actionId: "paste",
      sessionId: "Session_B",
      target: { kind: "canvas" },
    },
    modelerRef: { current: inst },
    backendClipboard: {
      async pasteIntoSession(payload) {
        backendCalls.push(payload);
        return {
          ok: true,
          clipboard_item_type: "bpmn_task",
          schema_version: "pm_bpmn_task_clipboard_v1",
          pasted_root_element_id: "Task_Pasted_1",
          created_node_ids: ["Task_Pasted_1"],
          created_edge_ids: [],
        };
      },
    },
    emitDiagramMutation(kind, payload) {
      mutationEvents.push({ kind, payload });
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.backendClipboard, true);
  assert.equal(result.createdId, "Task_Pasted_1");
  assert.equal(result.clipboardItemType, "bpmn_task");
  assert.deepEqual(backendCalls, [{ sessionId: "Session_B" }]);
  assert.equal(calls.length, 0);
  assert.equal(mutationEvents[0]?.payload?.source, "backend_clipboard");
});

test("backend clipboard empty state returns explicit paste failure without local snapshot", async () => {
  const root = {
    id: "Process_1",
    type: "bpmn:Process",
    businessObject: { $type: "bpmn:Process", flowElements: [] },
    di: { planeElement: [] },
    children: [],
  };
  const { inst, calls } = createStubModeler({ root, registryItems: [root] });

  const result = await executeBpmnContextMenuAction({
    payloadRaw: {
      actionId: "paste",
      sessionId: "Session_B",
      target: { kind: "canvas" },
    },
    modelerRef: { current: inst },
    backendClipboard: {
      async pasteIntoSession() {
        return { ok: false, status: 404, error: "clipboard_empty" };
      },
    },
  });

  assert.equal(result.ok, false);
  assert.equal(result.error, "clipboard_empty");
  assert.equal(calls.length, 0);
});

test("copy_element captures semantic payload and paste restores it with a new id", async () => {
  const task = {
    id: "Task_1",
    type: "bpmn:Task",
    x: 120,
    y: 160,
    width: 140,
    height: 90,
    businessObject: {
      $type: "bpmn:Task",
      name: "Исходный шаг",
      documentation: [{ $type: "bpmn:Documentation", text: "copy-doc-text" }],
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
  const root = {
    id: "Process_1",
    type: "bpmn:Process",
    businessObject: { $type: "bpmn:Process", flowElements: [task] },
    di: { planeElement: [] },
    children: [task],
  };
  task.parent = root;

  const { inst, selected } = createStubModeler({
    root,
    registryItems: [root, task],
  });

  const copyResult = await executeBpmnContextMenuAction({
    payloadRaw: {
      actionId: "copy_element",
      target: { id: "Task_1" },
    },
    modelerRef: { current: inst },
  });
  assert.equal(copyResult.ok, true);

  const pasteResult = await executeBpmnContextMenuAction({
    payloadRaw: {
      actionId: "paste",
      target: { id: "Task_1" },
    },
    modelerRef: { current: inst },
  });

  assert.equal(pasteResult.ok, true);
  assert.equal(pasteResult.createdId === "Task_1", false);
  const pasted = selected[0];
  assert.equal(pasted?.businessObject?.name, "Исходный шаг");
  assert.equal(pasted?.businessObject?.documentation?.[0]?.text, "copy-doc-text");
  assert.equal(
    pasted?.businessObject?.extensionElements?.values?.[0]?.values?.[0]?.value,
    "high",
  );
  assert.equal(
    pasted?.businessObject?.["pm:kind"] || pasted?.businessObject?.$attrs?.["pm:kind"],
    "robot",
  );
  assert.equal(pasted?.businessObject?.pmCustomFlag, "flag-1");
  assert.equal(Number(pasted?.x || 0) > Number(task.x || 0), true);
});

test("subprocess copy_element uses native subtree paste and clones companion state by remap", async () => {
  const subprocess = {
    id: "SubProcess_1",
    type: "bpmn:SubProcess",
    x: 220,
    y: 120,
    width: 300,
    height: 180,
    businessObject: {
      $type: "bpmn:SubProcess",
      name: "Expanded Source",
      flowElements: [
        { id: "InnerTask_1", $type: "bpmn:Task", name: "Inner task" },
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

  const pasteListeners = new Set();
  const copyPaste = {
    copy(elements) {
      assert.equal(elements[0], subprocess);
      return {
        0: [
          { id: "SubProcess_1", type: "bpmn:SubProcess" },
          { id: "InnerTask_1", type: "bpmn:Task", parent: "SubProcess_1" },
        ],
      };
    },
    paste() {
      const cache = {
        SubProcess_1: {
          id: "SubProcess_2",
          type: "bpmn:SubProcess",
          businessObject: { $type: "bpmn:SubProcess", name: "Expanded Source" },
        },
        InnerTask_1: {
          id: "InnerTask_2",
          type: "bpmn:Task",
          businessObject: { $type: "bpmn:Task", name: "Inner task" },
        },
      };
      pasteListeners.forEach((listener) => listener({
        cache,
        descriptor: { id: "SubProcess_1" },
      }));
      return [cache.SubProcess_1, cache.InnerTask_1];
    },
  };
  const eventBus = {
    on(eventName, listener) {
      if (String(eventName || "") === "copyPaste.pasteElement") {
        pasteListeners.add(listener);
      }
    },
    off(eventName, listener) {
      if (String(eventName || "") === "copyPaste.pasteElement") {
        pasteListeners.delete(listener);
      }
    },
  };
  const cloneCalls = [];

  const { inst, selected } = createStubModeler({
    root,
    registryItems: [root, subprocess],
    copyPaste,
    eventBus,
  });

  const copyResult = await executeBpmnContextMenuAction({
    payloadRaw: {
      actionId: "copy_element",
      target: { id: "SubProcess_1" },
    },
    modelerRef: { current: inst },
    buildCopyElementOptions() {
      return {
        nativeTree: copyPaste.copy([subprocess]),
      };
    },
  });
  assert.equal(copyResult.ok, true);

  const pasteResult = await executeBpmnContextMenuAction({
    payloadRaw: {
      actionId: "paste",
      target: { id: "SubProcess_1" },
    },
    modelerRef: { current: inst },
    cloneCompanionStateForCopiedElement(payload) {
      cloneCalls.push(payload);
    },
    emitElementSelection(element) {
      selected.length = 0;
      selected.push(element);
    },
  });

  assert.equal(pasteResult.ok, true);
  assert.equal(pasteResult.createdId, "SubProcess_2");
  assert.deepEqual(pasteResult.changedIds.sort(), ["InnerTask_2", "SubProcess_2"]);
  assert.equal(selected[0]?.id, "SubProcess_2");
  assert.deepEqual(cloneCalls, [{
    sourceElementId: "SubProcess_1",
    targetElementId: "SubProcess_2",
    remap: {
      SubProcess_1: "SubProcess_2",
      InnerTask_1: "InnerTask_2",
    },
    semanticPayload: undefined,
    inst,
  }]);
});

test("semantic paste falls back to clicked canvas point when no target shape is present", async () => {
  const task = {
    id: "Task_1",
    type: "bpmn:Task",
    x: 120,
    y: 160,
    width: 140,
    height: 90,
    businessObject: { $type: "bpmn:Task", name: "Исходный шаг" },
  };
  const root = {
    id: "Process_1",
    type: "bpmn:Process",
    businessObject: { $type: "bpmn:Process", flowElements: [task] },
    di: { planeElement: [] },
    children: [task],
  };
  task.parent = root;
  const { inst, calls } = createStubModeler({
    root,
    registryItems: [root, task],
    viewbox: { x: 100, y: 50, scale: 2 },
    rect: { left: 10, top: 20 },
  });

  await executeBpmnContextMenuAction({
    payloadRaw: {
      actionId: "copy_element",
      target: { id: "Task_1" },
    },
    modelerRef: { current: inst },
  });

  const pasteResult = await executeBpmnContextMenuAction({
    payloadRaw: {
      actionId: "paste",
      clientX: 210,
      clientY: 220,
      target: { kind: "canvas" },
    },
    modelerRef: { current: inst },
  });

  assert.equal(pasteResult.ok, true);
  assert.deepEqual(calls[calls.length - 1]?.pos, { x: 200, y: 150 });
});
