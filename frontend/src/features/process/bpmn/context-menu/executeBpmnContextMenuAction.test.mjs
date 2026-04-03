import test from "node:test";
import assert from "node:assert/strict";
import { executeBpmnContextMenuAction } from "./executeBpmnContextMenuAction.js";

function createStubModeler({
  root,
  registryItems = [],
  createShapeImpl = null,
  viewbox = { x: 100, y: 50, scale: 2 },
  rect = { left: 10, top: 20 },
  commandStack = null,
} = {}) {
  const calls = [];
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
    updateLabel() {
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
      return null;
    },
  };

  return { inst, calls };
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
