import assert from "node:assert/strict";
import test from "node:test";

import {
  buildPropertiesOverlayEntryBaseSignature,
  buildPropertiesOverlayEntryContentSignature,
  buildPropertiesOverlayEntryGeometrySignature,
  classifyPropertiesOverlayEntryOperation,
} from "./decorManager.js";

function buildEntry({
  elementId = "Activity_A",
  orderIndex = 0,
  hostType = "task",
  items = [{ key: "k", label: "K", value: "V" }],
  hiddenCount = 0,
  linkedFlags = [0],
  colorSignature = "c0",
  zoomBucket = 1,
  width = 120,
  topOffset = -20,
  anchorLeft = 0,
} = {}) {
  const baseSignature = buildPropertiesOverlayEntryBaseSignature({
    elementId,
    hostType,
    orderIndex,
    items,
    hiddenCount,
    linkedFlags,
  });
  const contentSignature = buildPropertiesOverlayEntryContentSignature({
    baseSignature,
    colorSignature,
  });
  const geometrySignature = buildPropertiesOverlayEntryGeometrySignature({
    hostType,
    zoomBucket,
    width,
    topOffset,
    anchorLeft,
  });
  return {
    elementId,
    baseSignature,
    contentSignature,
    geometrySignature,
  };
}

test("unchanged overlay entry is classified as unchanged", () => {
  const prev = buildEntry();
  const next = buildEntry();
  assert.equal(classifyPropertiesOverlayEntryOperation(prev, next), "unchanged");
});

test("changed semantic content is classified as content_update", () => {
  const prev = buildEntry({
    items: [{ key: "cost", label: "Cost", value: "100" }],
  });
  const next = buildEntry({
    items: [{ key: "cost", label: "Cost", value: "200" }],
  });
  assert.equal(classifyPropertiesOverlayEntryOperation(prev, next), "content_update");
});

test("removed entry is classified as remove", () => {
  const prev = buildEntry();
  assert.equal(classifyPropertiesOverlayEntryOperation(prev, null), "remove");
});

test("moved with unchanged content is classified as position_update", () => {
  const prev = buildEntry({
    zoomBucket: 1,
    width: 120,
    topOffset: -20,
    anchorLeft: 0,
  });
  const next = buildEntry({
    zoomBucket: 1,
    width: 120,
    topOffset: -12,
    anchorLeft: 8,
  });
  assert.equal(classifyPropertiesOverlayEntryOperation(prev, next), "position_update");
});

test("selected overlay change does not force unchanged always-on entry to content update", () => {
  const alwaysPrev = buildEntry({
    elementId: "Activity_Always",
    orderIndex: 1,
    items: [{ key: "k1", label: "Always", value: "A" }],
  });
  const alwaysNext = buildEntry({
    elementId: "Activity_Always",
    orderIndex: 1,
    items: [{ key: "k1", label: "Always", value: "A" }],
  });
  const selectedPrev = buildEntry({
    elementId: "Activity_Selected",
    orderIndex: 0,
    items: [{ key: "k2", label: "Selected", value: "old" }],
  });
  const selectedNext = buildEntry({
    elementId: "Activity_Selected",
    orderIndex: 0,
    items: [{ key: "k2", label: "Selected", value: "new" }],
  });
  assert.equal(classifyPropertiesOverlayEntryOperation(alwaysPrev, alwaysNext), "unchanged");
  assert.equal(classifyPropertiesOverlayEntryOperation(selectedPrev, selectedNext), "content_update");
});

test("always-on semantic change is classified as content_update", () => {
  const prev = buildEntry({
    elementId: "Activity_Always",
    items: [{ key: "p", label: "Priority", value: "P1" }],
  });
  const next = buildEntry({
    elementId: "Activity_Always",
    items: [{ key: "p", label: "Priority", value: "P2" }],
  });
  assert.equal(classifyPropertiesOverlayEntryOperation(prev, next), "content_update");
});
