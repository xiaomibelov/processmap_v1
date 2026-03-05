import assert from "node:assert/strict";
import test from "node:test";

import { createTemplatePackAdapter, resolveGraphicalInsertParent } from "./templatePackAdapter.js";

function createShape(id, x, y, name = "") {
  return {
    id,
    type: "bpmn:Task",
    x,
    y,
    width: 140,
    height: 80,
    businessObject: {
      id,
      $type: "bpmn:Task",
      name,
    },
    outgoing: [],
  };
}

function createSequence(id, source, target, name = "") {
  return {
    id,
    type: "bpmn:SequenceFlow",
    waypoints: [{ x: 0, y: 0 }, { x: 10, y: 10 }],
    source,
    target,
    businessObject: {
      id,
      $type: "bpmn:SequenceFlow",
      name,
    },
  };
}

function createModelerWithServices({ selectionItems = [], registryItems = [], anchorShape = null } = {}) {
  const connectCalls = [];
  const createShapeCalls = [];
  const updateLabelCalls = [];
  const emitCalls = [];
  const createdConnections = [];

  let shapeSeq = 0;
  let connSeq = 0;
  const root = { id: "Process_1", type: "bpmn:Process" };
  const anchor = anchorShape || createShape("Anchor_1", 100, 100, "Anchor");
  const allRegistryItems = [...registryItems];

  const modeling = {
    createShape(shapeDef, pos, parent) {
      shapeSeq += 1;
      const shape = {
        id: `Task_new_${shapeSeq}`,
        type: shapeDef?.type || "bpmn:Task",
        x: Number(pos?.x || 0),
        y: Number(pos?.y || 0),
        width: 140,
        height: 80,
        parent,
        businessObject: {
          id: `Task_new_${shapeSeq}`,
          $type: shapeDef?.type || "bpmn:Task",
          name: "",
        },
        outgoing: [],
      };
      createShapeCalls.push({ shapeDef, pos, parent, createdId: shape.id });
      allRegistryItems.push(shape);
      return shape;
    },
    updateLabel(element, label) {
      updateLabelCalls.push({ elementId: String(element?.id || ""), label: String(label || "") });
      if (element?.businessObject) element.businessObject.name = String(label || "");
    },
    connect(source, target, attrs = {}) {
      connSeq += 1;
      const conn = {
        id: `Flow_new_${connSeq}`,
        type: attrs?.type || "bpmn:SequenceFlow",
        source,
        target,
        businessObject: {
          id: `Flow_new_${connSeq}`,
          $type: attrs?.type || "bpmn:SequenceFlow",
          name: "",
        },
      };
      connectCalls.push({ sourceId: String(source?.id || ""), targetId: String(target?.id || ""), attrs });
      if (source?.outgoing && Array.isArray(source.outgoing)) {
        source.outgoing.push(conn);
      }
      createdConnections.push(conn);
      return conn;
    },
    removeConnection() {
    },
  };

  const elementFactory = {
    createShape(input = {}) {
      return { ...input };
    },
  };

  const selection = {
    get() {
      if (Array.isArray(selectionItems)) return selectionItems;
      return [anchor];
    },
  };

  const elementRegistry = {
    getAll() {
      return allRegistryItems;
    },
    get(id) {
      const target = String(id || "");
      return allRegistryItems.find((item) => String(item?.id || "") === target) || null;
    },
  };

  const canvas = {
    getRootElement() {
      return root;
    },
  };

  const inst = {
    get(name) {
      if (name === "selection") return selection;
      if (name === "elementRegistry") return elementRegistry;
      if (name === "modeling") return modeling;
      if (name === "elementFactory") return elementFactory;
      if (name === "canvas") return canvas;
      return null;
    },
  };

  const adapter = createTemplatePackAdapter({
    ensureModeler: async () => inst,
    getModeler: () => inst,
    emitDiagramMutation: (...args) => emitCalls.push(args),
    logPackDebug: () => {},
    getSessionId: () => "sid_test",
    readLaneNameForElement: () => "lane 1",
    isShapeElement: (el) => !!el && !Array.isArray(el?.waypoints) && el.type !== "label",
    isConnectionElement: (el) => !!el && Array.isArray(el?.waypoints),
  });

  return {
    adapter,
    inst,
    anchor,
    connectCalls,
    createShapeCalls,
    updateLabelCalls,
    emitCalls,
    createdConnections,
  };
}

test("captureTemplatePackOnModeler returns pack with selected nodes and edges", () => {
  const a = createShape("Task_A", 120, 80, "A");
  const b = createShape("Task_B", 320, 120, "B");
  const ab = createSequence("Flow_AB", a, b, "when ok");
  const { adapter, inst } = createModelerWithServices({
    selectionItems: [a, b],
    registryItems: [a, b, ab],
  });

  const result = adapter.captureTemplatePackOnModeler(inst, { title: "Pack A-B" });
  assert.equal(result?.ok, true);
  assert.equal(result?.pack?.title, "Pack A-B");
  assert.equal(Array.isArray(result?.pack?.fragment?.nodes), true);
  assert.equal(result.pack.fragment.nodes.length, 2);
  assert.equal(result.pack.fragment.edges.length, 1);
  assert.equal(result.pack.fragment.edges[0].sourceId, "Task_A");
  assert.equal(result.pack.fragment.edges[0].targetId, "Task_B");
});

test("insertTemplatePackOnModeler creates nodes, connects sequence flows and emits mutation", async () => {
  const anchor = createShape("Anchor_1", 100, 100, "Anchor");
  const { adapter, connectCalls, createShapeCalls, emitCalls } = createModelerWithServices({
    anchorShape: anchor,
    selectionItems: [anchor],
    registryItems: [anchor],
  });

  const payload = {
    mode: "after",
    pack: {
      packId: "pack_1",
      entryNodeId: "N1",
      exitNodeId: "N2",
      fragment: {
        nodes: [
          { id: "N1", type: "bpmn:Task", name: "First", laneHint: "lane 1", di: { x: 10, y: 20 } },
          { id: "N2", type: "bpmn:Task", name: "Second", laneHint: "lane 1", di: { x: 180, y: 20 } },
        ],
        edges: [
          { id: "E1", sourceId: "N1", targetId: "N2", when: "ok" },
        ],
      },
    },
  };

  const result = await adapter.insertTemplatePackOnModeler(payload);
  assert.equal(result?.ok, true);
  assert.equal(result?.createdNodes, 2);
  assert.equal(result?.createdEdges, 1);
  assert.equal(createShapeCalls.length, 2);
  assert.equal(connectCalls.length, 2);
  assert.equal(emitCalls.length, 1);
  assert.equal(emitCalls[0][0], "diagram.template_insert");
});

test("insertTemplatePackOnModeler supports point-based insert without selected anchor", async () => {
  const lane = {
    id: "Lane_1",
    type: "bpmn:Lane",
    x: 0,
    y: 0,
    width: 1200,
    height: 600,
    businessObject: {
      id: "Lane_1",
      $type: "bpmn:Lane",
      name: "lane 1",
    },
  };
  const { adapter, connectCalls, createShapeCalls } = createModelerWithServices({
    selectionItems: [],
    registryItems: [lane],
  });
  const payload = {
    mode: "after",
    anchor: {
      point: { x: 320, y: 220 },
    },
    pack: {
      packId: "pack_point",
      entryNodeId: "N1",
      exitNodeId: "N2",
      fragment: {
        nodes: [
          { id: "N1", type: "bpmn:Task", name: "One", di: { x: 10, y: 20 } },
          { id: "N2", type: "bpmn:Task", name: "Two", di: { x: 180, y: 20 } },
        ],
        edges: [{ id: "E1", sourceId: "N1", targetId: "N2" }],
      },
    },
  };
  const result = await adapter.insertTemplatePackOnModeler(payload);
  assert.equal(result?.ok, true);
  assert.equal(result?.createdNodes, 2);
  assert.equal(createShapeCalls.length, 2);
  assert.equal(connectCalls.length, 1);
  assert.equal(result?.anchorByPoint, true);
});

test("resolveGraphicalInsertParent maps lane to participant/root", () => {
  const root = {
    id: "Process_1",
    type: "bpmn:Process",
    businessObject: {
      $type: "bpmn:Process",
      flowElements: [],
    },
  };
  const participant = {
    id: "Participant_1",
    type: "bpmn:Participant",
    parent: root,
    businessObject: {
      $type: "bpmn:Participant",
      processRef: { flowElements: [] },
    },
  };
  const lane = {
    id: "Lane_1",
    type: "bpmn:Lane",
    parent: participant,
    businessObject: {
      $type: "bpmn:Lane",
      flowNodeRef: [],
    },
  };

  const fromLane = resolveGraphicalInsertParent(lane, root);
  assert.equal(fromLane, participant);

  const fromParticipant = resolveGraphicalInsertParent(participant, root);
  assert.equal(fromParticipant, participant);
});
