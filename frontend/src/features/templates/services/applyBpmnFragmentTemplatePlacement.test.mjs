import test from "node:test";
import assert from "node:assert/strict";
import {
  buildBpmnFragmentGhost,
  buildBpmnFragmentInsertPayload,
  createBpmnFragmentPlacementDraft,
  normalizeTemplatePack,
  readTemplatePackBBox,
  updateBpmnFragmentPlacementPointer,
} from "./applyBpmnFragmentTemplatePlacement.js";

function createTemplate() {
  return {
    id: "tpl_1",
    title: "Fragment Template",
    template_type: "bpmn_fragment_v1",
    payload: {
      pack: {
        title: "Pack 1",
        fragment: {
          nodes: [
            { id: "A", type: "bpmn:Task", di: { x: 10, y: 20, w: 120, h: 80 } },
            { id: "B", type: "bpmn:Task", di: { x: 220, y: 20, w: 120, h: 80 } },
          ],
          edges: [{ id: "Flow_1", sourceId: "A", targetId: "B" }],
        },
        entryNodeId: "A",
        exitNodeId: "B",
      },
    },
  };
}

test("createBpmnFragmentPlacementDraft builds draft with bbox", () => {
  const created = createBpmnFragmentPlacementDraft(createTemplate(), { startedAt: 1000, ignoreClickMs: 200 });
  assert.equal(created.ok, true);
  assert.equal(created.draft.templateId, "tpl_1");
  assert.equal(created.draft.bbox.w > 0, true);
  assert.equal(created.draft.ignoreClickUntil, 1200);
});

test("buildBpmnFragmentGhost computes ghost bounds from pointer and container", () => {
  const created = createBpmnFragmentPlacementDraft(createTemplate(), { startedAt: 1000, ignoreClickMs: 200 });
  const withPointer = updateBpmnFragmentPlacementPointer(created.draft, 300, 220);
  const ghost = buildBpmnFragmentGhost(withPointer, { left: 100, top: 100, width: 800, height: 500 });
  assert.equal(ghost.width > 0, true);
  assert.equal(ghost.height > 0, true);
  assert.equal(ghost.left >= 0, true);
  assert.equal(ghost.top >= 0, true);
});

test("buildBpmnFragmentInsertPayload returns pack and anchor points", () => {
  const created = createBpmnFragmentPlacementDraft(createTemplate(), { startedAt: 1000, ignoreClickMs: 200 });
  const payload = buildBpmnFragmentInsertPayload(created.draft, {
    clientPoint: { x: 320, y: 240 },
    diagramPoint: { x: 128, y: 96 },
    mode: "after",
  });
  assert.equal(payload.pack.fragment.nodes.length, 2);
  assert.equal(payload.anchor.client.x, 320);
  assert.equal(payload.anchor.point.y, 96);
});

test("buildBpmnFragmentInsertPayload carries preferPointAnchor flag for immediate insert flow", () => {
  const created = createBpmnFragmentPlacementDraft(createTemplate(), { startedAt: 1000, ignoreClickMs: 200 });
  const payload = buildBpmnFragmentInsertPayload(created.draft, {
    clientPoint: { x: 400, y: 260 },
    diagramPoint: { x: 180, y: 110 },
    mode: "after",
    preferPointAnchor: true,
  });
  assert.equal(payload.preferPointAnchor, true);
  assert.equal(payload.anchor.point.x, 180);
});

test("normalizeTemplatePack lazily migrates absolute-di pack to offset layout via entry anchor", () => {
  const pack = normalizeTemplatePack({
    entryNodeId: "A",
    exitNodeId: "B",
    fragment: {
      nodes: [
        { id: "A", type: "bpmn:Task", di: { x: 10, y: 20, w: 120, h: 80 } },
        { id: "B", type: "bpmn:Task", di: { x: 220, y: 20, w: 120, h: 80 } },
      ],
      edges: [{ id: "Flow_1", sourceId: "A", targetId: "B" }],
    },
  });
  assert.ok(pack);
  assert.equal(pack.fragment.layout, "offset.v1");
  assert.equal(pack.fragment.anchorNodeId, "A");
  assert.deepEqual(pack.fragment.anchorAbs, { x: 10, y: 20 });
  assert.deepEqual(pack.fragment.nodes[0].di, { dx: 0, dy: 0, w: 120, h: 80 });
  assert.deepEqual(pack.fragment.nodes[1].di, { dx: 210, dy: 0, w: 120, h: 80 });
});

test("normalizeTemplatePack falls back to top-left node when entryNodeId is not in nodes", () => {
  const pack = normalizeTemplatePack({
    entryNodeId: "Ghost_1",
    fragment: {
      nodes: [
        { id: "B", type: "bpmn:Task", di: { x: 220, y: 40, w: 120, h: 80 } },
        { id: "A", type: "bpmn:Task", di: { x: 120, y: 80, w: 120, h: 80 } },
      ],
      edges: [],
    },
  });
  assert.ok(pack);
  assert.equal(pack.fragment.layout, "offset.v1");
  assert.equal(pack.fragment.anchorNodeId, "B");
  assert.deepEqual(pack.fragment.anchorAbs, { x: 220, y: 40 });
  const nodeA = pack.fragment.nodes.find((node) => node.id === "A");
  assert.deepEqual(nodeA?.di, { dx: -100, dy: 40, w: 120, h: 80 });
});

test("normalizeTemplatePack offset migration is idempotent", () => {
  const legacy = {
    entryNodeId: "A",
    fragment: {
      nodes: [
        { id: "A", type: "bpmn:Task", di: { x: 10, y: 20, w: 120, h: 80 } },
        { id: "B", type: "bpmn:Task", di: { x: 220, y: 20, w: 120, h: 80 } },
      ],
      edges: [],
    },
  };
  const first = normalizeTemplatePack(legacy);
  const snapshot = JSON.parse(JSON.stringify(first));
  const second = normalizeTemplatePack(first);
  assert.deepEqual(second, snapshot);
  assert.equal(second.fragment.layout, "offset.v1");
  assert.deepEqual(second.fragment.nodes[1].di, { dx: 210, dy: 0, w: 120, h: 80 });
});

test("normalizeTemplatePack keeps offset-layout packs untouched", () => {
  const offsetPack = {
    entryNodeId: "A",
    fragment: {
      layout: "offset.v1",
      anchorNodeId: "A",
      anchorAbs: { x: 500, y: 300 },
      nodes: [
        { id: "A", type: "bpmn:Task", di: { dx: 0, dy: 0, w: 120, h: 80 } },
        { id: "B", type: "bpmn:Task", di: { dx: 210, dy: 0, w: 120, h: 80 } },
      ],
      edges: [],
    },
  };
  const pack = normalizeTemplatePack(offsetPack);
  assert.ok(pack);
  assert.deepEqual(pack.fragment.nodes[1].di, { dx: 210, dy: 0, w: 120, h: 80 });
  assert.deepEqual(pack.fragment.anchorAbs, { x: 500, y: 300 });
});

test("readTemplatePackBBox computes size for offset-layout packs", () => {
  const bbox = readTemplatePackBBox({
    fragment: {
      layout: "offset.v1",
      anchorNodeId: "A",
      nodes: [
        { id: "A", type: "bpmn:Task", di: { dx: 0, dy: 0, w: 120, h: 80 } },
        { id: "B", type: "bpmn:Task", di: { dx: 210, dy: 0, w: 120, h: 80 } },
      ],
      edges: [],
    },
  });
  assert.deepEqual(bbox, { w: 330, h: 80 });
});

test("readTemplatePackBBox keeps size stable across lazy migration of legacy pack", () => {
  const legacy = {
    entryNodeId: "A",
    fragment: {
      nodes: [
        { id: "A", type: "bpmn:Task", di: { x: 500, y: 300, w: 120, h: 80 } },
        { id: "B", type: "bpmn:Task", di: { x: 710, y: 300, w: 120, h: 80 } },
      ],
      edges: [],
    },
  };
  assert.deepEqual(readTemplatePackBBox(legacy), { w: 330, h: 80 });
  assert.deepEqual(readTemplatePackBBox(legacy), { w: 330, h: 80 });
});

test("createBpmnFragmentPlacementDraft normalizes legacy template pack to offset layout", () => {
  const created = createBpmnFragmentPlacementDraft(createTemplate(), { startedAt: 1000, ignoreClickMs: 200 });
  assert.equal(created.ok, true);
  assert.equal(created.draft.pack.fragment.layout, "offset.v1");
  assert.equal(created.draft.pack.fragment.anchorNodeId, "A");
  assert.deepEqual(created.draft.pack.fragment.nodes[0].di, { dx: 0, dy: 0, w: 120, h: 80 });
  assert.deepEqual(created.draft.pack.fragment.nodes[1].di, { dx: 210, dy: 0, w: 120, h: 80 });
});
