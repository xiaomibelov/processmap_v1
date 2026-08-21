import test from "node:test";
import assert from "node:assert/strict";
import {
  buildBpmnFragmentGhost,
  buildBpmnFragmentInsertPayload,
  createBpmnFragmentPlacementDraft,
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
