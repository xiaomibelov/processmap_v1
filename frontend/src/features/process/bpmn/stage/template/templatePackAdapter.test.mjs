import assert from "node:assert/strict";
import test from "node:test";

import { createTemplatePackAdapter, resolveGraphicalInsertParent } from "./templatePackAdapter.js";

function createShape(id, x, y, name = "", boOverrides = {}) {
  const baseBusinessObject = {
    id,
    $type: "bpmn:Task",
    name,
  };
  return {
    id,
    type: "bpmn:Task",
    x,
    y,
    width: 140,
    height: 80,
    businessObject: {
      ...baseBusinessObject,
      ...boOverrides,
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

function createModelerWithServices({
  selectionItems = [],
  registryItems = [],
  anchorShape = null,
  rootDi = null,
  rootElement = null,
} = {}) {
  const connectCalls = [];
  const createShapeCalls = [];
  const updateLabelCalls = [];
  const emitCalls = [];
  const createdConnections = [];

  let shapeSeq = 0;
  let connSeq = 0;
  const root = rootElement || { id: "Process_1", type: "bpmn:Process", di: rootDi };
  const anchor = anchorShape || createShape("Anchor_1", 100, 100, "Anchor");
  const allRegistryItems = [...registryItems];

  const modeling = {
    createShape(shapeDef, pos, parent) {
      if (root.di) {
        root.di.planeElement.push({ id: `DI_${shapeSeq + 1}` });
      }
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
          $attrs: {},
          set(key, value) {
            const currentAttrs = this.$attrs && typeof this.$attrs === "object" && !Array.isArray(this.$attrs)
              ? this.$attrs
              : {};
            if (key === "$attrs") {
              this.$attrs = {
                ...currentAttrs,
                $attrs: value,
              };
              return;
            }
            if (String(key || "").includes(":")) {
              const currentNamespaced = this.$namespaced
                && typeof this.$namespaced === "object"
                && !Array.isArray(this.$namespaced)
                ? this.$namespaced
                : {};
              this.$namespaced = {
                ...currentNamespaced,
                [key]: value,
              };
              this.$attrs = {
                ...currentAttrs,
                [key]: value,
              };
              return;
            }
            this[key] = value;
          },
          get(key) {
            if (!key) return undefined;
            if (Object.prototype.hasOwnProperty.call(this, key)) return this[key];
            const namespaced = this.$namespaced && typeof this.$namespaced === "object" && !Array.isArray(this.$namespaced)
              ? this.$namespaced
              : {};
            if (Object.prototype.hasOwnProperty.call(namespaced, key)) return namespaced[key];
            const attrs = this.$attrs && typeof this.$attrs === "object" && !Array.isArray(this.$attrs)
              ? this.$attrs
              : {};
            return attrs[key];
          },
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

  const moddle = {
    create(type, attrs = {}) {
      const obj = {
        $type: String(type || ""),
        ...attrs,
        set(key, value) {
          this[key] = value;
        },
      };
      return obj;
    },
  };

  let selectionState = Array.isArray(selectionItems) ? selectionItems : [anchor];
  const selection = {
    get() {
      return selectionState;
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
      if (name === "moddle") return moddle;
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
    registryItems: allRegistryItems,
    setSelection(nextSelection = []) {
      selectionState = Array.isArray(nextSelection) ? nextSelection : [nextSelection];
    },
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

test("captureTemplatePackOnModeler preserves documentation, camunda io/properties, and custom bo payload in semanticPayload", () => {
  const source = createShape("Task_With_Props", 120, 80, "Task with props", {
    documentation: [
      { $type: "bpmn:Documentation", text: "doc text" },
    ],
    extensionElements: {
      $type: "bpmn:ExtensionElements",
      values: [
        {
          $type: "camunda:Properties",
          values: [
            { $type: "camunda:Property", name: "robot.code", value: "R-42" },
          ],
        },
        {
          $type: "camunda:InputOutput",
          inputParameters: [
            { $type: "camunda:InputParameter", name: "payload", value: "{\"foo\":1}" },
          ],
          outputParameters: [
            { $type: "camunda:OutputParameter", name: "result", value: "ok" },
          ],
        },
        {
          $type: "camunda:ExecutionListener",
          event: "start",
          expression: "${notifyStart}",
        },
        {
          $type: "pm:RobotMeta",
          robotCode: "R-42",
          dictionaryBinding: { operationKey: "op.pack" },
        },
      ],
    },
    $attrs: {
      "pm:bindingKey": "binding_1",
    },
    propertyDictionaryBinding: {
      operationKey: "op.pack",
      propertyKey: "robot.code",
    },
  });
  const { adapter, inst } = createModelerWithServices({
    selectionItems: [source],
    registryItems: [source],
  });
  const result = adapter.captureTemplatePackOnModeler(inst, { title: "Pack with props" });
  assert.equal(result?.ok, true);
  const captured = result?.pack?.fragment?.nodes?.[0]?.semanticPayload || {};
  assert.equal(captured.documentation?.[0]?.text, "doc text");
  assert.equal(captured.extensionElements?.values?.[0]?.$type, "camunda:Properties");
  assert.equal(captured.extensionElements?.values?.[1]?.$type, "camunda:InputOutput");
  assert.equal(captured.extensionElements?.values?.[1]?.inputParameters?.[0]?.name, "payload");
  assert.equal(captured.extensionElements?.values?.[2]?.$type, "camunda:ExecutionListener");
  assert.equal(captured.attrs?.["pm:bindingKey"], "binding_1");
  assert.equal(captured.custom?.propertyDictionaryBinding?.operationKey, "op.pack");
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

test("insertTemplatePackOnModeler reapplies semantic payload to inserted node businessObject", async () => {
  const anchor = createShape("Anchor_1", 100, 100, "Anchor");
  const { adapter, registryItems, createShapeCalls } = createModelerWithServices({
    anchorShape: anchor,
    selectionItems: [anchor],
    registryItems: [anchor],
  });

  const payload = {
    mode: "after",
    pack: {
      packId: "pack_props_apply",
      entryNodeId: "N1",
      exitNodeId: "N1",
      fragment: {
        nodes: [
          {
            id: "N1",
            type: "bpmn:Task",
            name: "Copied node",
            laneHint: "lane 1",
            di: { x: 10, y: 20, w: 260, h: 130 },
            semanticPayload: {
              documentation: [
                { $type: "bpmn:Documentation", text: "template doc" },
              ],
              extensionElements: {
                $type: "bpmn:ExtensionElements",
                values: [
                  {
                    $type: "camunda:Properties",
                    values: [
                      { $type: "camunda:Property", name: "robot.code", value: "R-9000" },
                    ],
                  },
                  {
                    $type: "camunda:InputOutput",
                    inputParameters: [
                      { $type: "camunda:InputParameter", name: "in", value: "x" },
                    ],
                    outputParameters: [
                      { $type: "camunda:OutputParameter", name: "out", value: "y" },
                    ],
                  },
                  {
                    $type: "pm:RobotMeta",
                    robotCode: "R-9000",
                    dictionaryBinding: { operationKey: "op.prod" },
                  },
                ],
              },
              attrs: {
                "camunda:assignee": "user_test",
                "pm:customAttribute": "CUSTOM_TEST_VALUE",
                "pm:bindingKey": "binding_9000",
              },
              custom: {
                propertyDictionaryBinding: {
                  operationKey: "op.prod",
                  propertyKey: "robot.code",
                },
              },
            },
          },
        ],
        edges: [],
      },
    },
  };

  const result = await adapter.insertTemplatePackOnModeler(payload);
  assert.equal(result?.ok, true);
  const createdId = String(result?.entryNodeId || "");
  const created = registryItems.find((row) => String(row?.id || "") === createdId);
  assert.ok(created);
  const bo = created?.businessObject || {};
  assert.equal(bo.documentation?.[0]?.text, "template doc");
  assert.equal(bo.extensionElements?.$type, "bpmn:ExtensionElements");
  assert.equal(bo.extensionElements?.values?.[0]?.$type, "camunda:Properties");
  assert.equal(bo.extensionElements?.values?.[1]?.$type, "camunda:InputOutput");
  assert.equal(bo.extensionElements?.values?.[1]?.inputParameters?.[0]?.name, "in");
  assert.equal(bo.extensionElements?.values?.[2]?.$type, "pm:RobotMeta");
  assert.equal(bo.get?.("camunda:assignee"), "user_test");
  assert.equal(bo.get?.("pm:customAttribute"), "CUSTOM_TEST_VALUE");
  assert.equal(bo.$attrs?.["pm:bindingKey"], "binding_9000");
  assert.equal(bo.$attrs?.$attrs, undefined);
  assert.equal(bo.propertyDictionaryBinding?.operationKey, "op.prod");
  assert.equal(createShapeCalls[0]?.shapeDef?.width, 260);
  assert.equal(createShapeCalls[0]?.shapeDef?.height, 130);
});

test("semantic payload survives capture -> JSON storage -> insert -> reread roundtrip without silent loss", async () => {
  const source = createShape("Task_Source", 120, 80, "Template source", {
    status: "ready",
    state: "validated",
    documentation: [
      { $type: "bpmn:Documentation", text: "semantic roundtrip doc" },
    ],
    extensionElements: {
      $type: "bpmn:ExtensionElements",
      values: [
        {
          $type: "camunda:Properties",
          values: [
            { $type: "camunda:Property", name: "quality", value: "gold" },
          ],
        },
        {
          $type: "camunda:InputOutput",
          inputParameters: [
            { $type: "camunda:InputParameter", name: "inputPayload", value: "{\"k\":\"v\"}" },
          ],
          outputParameters: [
            { $type: "camunda:OutputParameter", name: "outputPayload", value: "ok" },
          ],
        },
        {
          $type: "camunda:ExecutionListener",
          event: "end",
          class: "com.acme.DoneListener",
        },
        {
          $type: "pm:RobotMeta",
          version: "v1",
          json: "{\"exec\":{\"mode\":\"machine\"}}",
        },
      ],
    },
    $attrs: {
      "pm:state": "ready",
      "camunda:asyncBefore": "true",
    },
    propertyDictionaryBinding: {
      operationKey: "qa.op",
      propertyKey: "quality",
    },
  });
  const anchor = createShape("Anchor_1", 420, 120, "Anchor");
  const {
    adapter,
    inst,
    registryItems,
    setSelection,
  } = createModelerWithServices({
    selectionItems: [source],
    registryItems: [source, anchor],
    anchorShape: anchor,
  });

  const captured = adapter.captureTemplatePackOnModeler(inst, { title: "Roundtrip payload" });
  assert.equal(captured?.ok, true);
  const storedPack = JSON.parse(JSON.stringify(captured.pack));
  const sourcePayload = storedPack?.fragment?.nodes?.[0]?.semanticPayload || {};
  assert.equal(sourcePayload.custom?.status, "ready");
  assert.equal(sourcePayload.custom?.state, "validated");
  assert.equal(sourcePayload.extensionElements?.values?.length, 4);

  setSelection([anchor]);
  const inserted = await adapter.insertTemplatePackOnModeler({
    mode: "after",
    pack: storedPack,
  });
  assert.equal(inserted?.ok, true);

  const insertedId = String(inserted?.entryNodeId || "");
  const insertedNode = registryItems.find((row) => String(row?.id || "") === insertedId);
  assert.ok(insertedNode);
  setSelection([insertedNode]);
  const recaptured = adapter.captureTemplatePackOnModeler(inst, { title: "Roundtrip recapture" });
  assert.equal(recaptured?.ok, true);
  const targetPayload = recaptured?.pack?.fragment?.nodes?.[0]?.semanticPayload || {};
  assert.deepEqual(targetPayload, sourcePayload);
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

test("insertTemplatePackOnModeler initializes missing root planeElement before first createShape", async () => {
  const anchor = createShape("Anchor_1", 100, 100, "Anchor");
  const { adapter } = createModelerWithServices({
    selectionItems: [anchor],
    registryItems: [anchor],
    anchorShape: anchor,
    rootDi: { planeElement: undefined },
  });
  const result = await adapter.insertTemplatePackOnModeler({
    mode: "after",
    pack: {
      entryNodeId: "N1",
      exitNodeId: "N1",
      fragment: {
        nodes: [{ id: "N1", type: "bpmn:Task", name: "First", di: { x: 10, y: 20 } }],
        edges: [],
      },
    },
  });
  assert.equal(result?.ok, true);
});

test("insertTemplatePackOnModeler falls back from collaboration root to participant flow parent", async () => {
  const collaboration = {
    id: "Collaboration_1",
    type: "bpmn:Collaboration",
    di: { planeElement: [] },
    children: [],
    businessObject: {
      id: "Collaboration_1",
      $type: "bpmn:Collaboration",
    },
  };
  const participant = {
    id: "Participant_1",
    type: "bpmn:Participant",
    x: 0,
    y: 0,
    width: 1600,
    height: 900,
    parent: collaboration,
    businessObject: {
      id: "Participant_1",
      $type: "bpmn:Participant",
      processRef: { flowElements: [] },
    },
  };
  collaboration.children = [participant];
  const { adapter, createShapeCalls } = createModelerWithServices({
    selectionItems: [],
    registryItems: [participant],
    rootElement: collaboration,
  });
  const result = await adapter.insertTemplatePackOnModeler({
    mode: "after",
    anchor: {
      point: { x: 640, y: 320 },
    },
    pack: {
      entryNodeId: "N1",
      exitNodeId: "N1",
      fragment: {
        nodes: [{ id: "N1", type: "bpmn:Task", name: "Inside participant", di: { x: 10, y: 20 } }],
        edges: [],
      },
    },
  });
  assert.equal(result?.ok, true);
  assert.equal(createShapeCalls.length, 1);
  assert.equal(String(createShapeCalls[0]?.parent?.id || ""), "Participant_1");
});

test("captureTemplatePackOnModeler returns raw-selection diagnostics when selection has no supported nodes", () => {
  const lane = {
    id: "Lane_1",
    type: "bpmn:Lane",
    businessObject: {
      id: "Lane_1",
      $type: "bpmn:Lane",
      name: "Lane 1",
    },
  };
  const { adapter, inst } = createModelerWithServices({
    selectionItems: [lane],
    registryItems: [lane],
  });
  const result = adapter.captureTemplatePackOnModeler(inst, { title: "Unsupported selection" });
  assert.equal(result?.ok, false);
  assert.equal(result?.error, "no_selection");
  assert.deepEqual(result?.diagnostics?.rawSelection?.map((row) => row.type), ["bpmn:Lane"]);
  assert.deepEqual(result?.diagnostics?.normalizedSelection, []);
});

test("insertTemplatePackOnModeler prefers point anchor over selected shape when requested", async () => {
  const selectedAnchor = createShape("Anchor_Selected", 100, 100, "Selected");
  const lane = {
    id: "Lane_1",
    type: "bpmn:Lane",
    x: 0,
    y: 0,
    width: 1600,
    height: 900,
    businessObject: {
      id: "Lane_1",
      $type: "bpmn:Lane",
      name: "lane 1",
    },
  };
  const { adapter, createShapeCalls } = createModelerWithServices({
    selectionItems: [selectedAnchor],
    registryItems: [selectedAnchor, lane],
    anchorShape: selectedAnchor,
  });
  const payload = {
    mode: "after",
    preferPointAnchor: true,
    anchor: {
      point: { x: 520, y: 320 },
    },
    pack: {
      packId: "pack_point_priority",
      entryNodeId: "N1",
      exitNodeId: "N1",
      fragment: {
        nodes: [
          { id: "N1", type: "bpmn:Task", name: "Placed by point", di: { x: 10, y: 20 } },
        ],
        edges: [],
      },
    },
  };
  const result = await adapter.insertTemplatePackOnModeler(payload);
  assert.equal(result?.ok, true);
  assert.equal(createShapeCalls.length, 1);
  assert.equal(String(createShapeCalls[0]?.createdId || "").startsWith("Task_new_"), true);
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
