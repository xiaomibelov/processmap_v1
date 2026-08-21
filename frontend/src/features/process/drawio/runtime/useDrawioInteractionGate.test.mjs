import test from "node:test";
import assert from "node:assert/strict";

import {
  canEditDrawioElement,
  canInteractWithDrawioElement,
  isDrawioInteractionEnabled,
} from "./useDrawioInteractionGate.js";

function buildMaps() {
  const layerMap = new Map([
    ["L1", { visible: true, locked: false }],
    ["L2", { visible: false, locked: false }],
  ]);
  const elementMap = new Map([
    ["shapeA", { layer_id: "L1", visible: true, locked: false, deleted: false }],
    ["shapeHidden", { layer_id: "L2", visible: true, locked: false, deleted: false }],
    ["shapeLocked", { layer_id: "L1", visible: true, locked: true, deleted: false }],
  ]);
  return { layerMap, elementMap };
}

test("interaction gate: enablement depends on visible + hasRenderable", () => {
  assert.equal(isDrawioInteractionEnabled(true, true), true);
  assert.equal(isDrawioInteractionEnabled(true, false), false);
  assert.equal(isDrawioInteractionEnabled(false, true), false);
});

test("interaction gate: canInteract blocks missing/non-visible elements", () => {
  const { layerMap, elementMap } = buildMaps();
  const meta = { locked: false };
  assert.equal(canInteractWithDrawioElement({
    interactionEnabled: true,
    meta,
    layerMap,
    elementMap,
    elementId: "shapeA",
  }), true);
  assert.equal(canInteractWithDrawioElement({
    interactionEnabled: true,
    meta,
    layerMap,
    elementMap,
    elementId: "shapeHidden",
  }), false);
  assert.equal(canInteractWithDrawioElement({
    interactionEnabled: false,
    meta,
    layerMap,
    elementMap,
    elementId: "shapeA",
  }), false);
});

test("interaction gate: editable behavior distinct from interactive", () => {
  const { layerMap, elementMap } = buildMaps();
  const unlocked = { locked: false };
  const globallyLocked = { locked: true };
  assert.equal(canEditDrawioElement({
    interactionEnabled: true,
    meta: unlocked,
    layerMap,
    elementMap,
    elementId: "shapeA",
  }), true);
  assert.equal(canEditDrawioElement({
    interactionEnabled: true,
    meta: unlocked,
    layerMap,
    elementMap,
    elementId: "shapeLocked",
  }), false);
  assert.equal(canEditDrawioElement({
    interactionEnabled: true,
    meta: globallyLocked,
    layerMap,
    elementMap,
    elementId: "shapeA",
  }), false);
});

test("interaction gate: view mode remains interactable but non-editable", () => {
  const { layerMap, elementMap } = buildMaps();
  const viewModeMeta = { locked: false, interaction_mode: "view" };
  assert.equal(canInteractWithDrawioElement({
    interactionEnabled: true,
    meta: viewModeMeta,
    layerMap,
    elementMap,
    elementId: "shapeA",
  }), true);
  assert.equal(canEditDrawioElement({
    interactionEnabled: true,
    meta: viewModeMeta,
    layerMap,
    elementMap,
    elementId: "shapeA",
  }), false);
});
