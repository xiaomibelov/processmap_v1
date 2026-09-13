import assert from "node:assert/strict";
import test from "node:test";

import { buildPropertiesOverlayPreview } from "./propertyDictionaryModel.js";
import { resolvePropertiesOverlayDraftIndicator } from "./propertiesOverlayDraftIndicator.js";

function extensionState(eeTime) {
  return {
    properties: {
      extensionProperties: [
        { id: "p1", name: "ee_operation", value: "А" },
        { id: "p2", name: "ee_time", value: eeTime },
      ],
      extensionListeners: [],
    },
    preservedExtensionElements: [],
  };
}

const META_MAP = { T1: extensionState("5") };

function draftPreview(eeTime) {
  return buildPropertiesOverlayPreview({
    elementId: "T1",
    extensionStateRaw: extensionState(eeTime),
    showPropertiesOverlay: true,
  });
}

test("indicator: draft differs from saved meta state -> element id (unsaved changes)", () => {
  const id = resolvePropertiesOverlayDraftIndicator({
    draftPreview: draftPreview("7"),
    metaExtensionsByElementId: META_MAP,
    hiddenFields: null,
  });
  assert.equal(id, "T1");
});

test("indicator: draft equals saved meta state -> empty (after save or cancel)", () => {
  const id = resolvePropertiesOverlayDraftIndicator({
    draftPreview: draftPreview("5"),
    metaExtensionsByElementId: META_MAP,
    hiddenFields: null,
  });
  assert.equal(id, "");
});

test("indicator: no meta state (new unsaved property) -> element id", () => {
  const id = resolvePropertiesOverlayDraftIndicator({
    draftPreview: draftPreview("7"),
    metaExtensionsByElementId: {},
    hiddenFields: null,
  });
  assert.equal(id, "T1");
});

test("indicator: disabled/empty draft preview -> empty", () => {
  const id = resolvePropertiesOverlayDraftIndicator({
    draftPreview: { enabled: false, elementId: "T1", items: [] },
    metaExtensionsByElementId: META_MAP,
    hiddenFields: null,
  });
  assert.equal(id, "");
  const idNull = resolvePropertiesOverlayDraftIndicator({
    draftPreview: null,
    metaExtensionsByElementId: META_MAP,
    hiddenFields: null,
  });
  assert.equal(idNull, "");
});

// Review blocker (review/overlay-props-ee-time-desync): the hook builds the
// draft preview WITH operationKey (template displayName like «Открыть …»),
// while the App-side rebuild runs WITHOUT it (generic fallback). displayName
// is a derived, never-persisted field — it must not affect the comparison.
function operationState(containerRef) {
  return {
    properties: {
      extensionProperties: [
        { id: "p1", name: "container_ref", value: containerRef },
      ],
      extensionListeners: [],
    },
    preservedExtensionElements: [],
  };
}

function operationDraftPreview(containerRef) {
  return buildPropertiesOverlayPreview({
    elementId: "T1",
    extensionStateRaw: operationState(containerRef),
    operationKey: "open_container",
    operationLabel: "Открыть",
    showPropertiesOverlay: true,
  });
}

test("indicator: operationKey-derived displayName does NOT false-positive (no edits)", () => {
  const id = resolvePropertiesOverlayDraftIndicator({
    draftPreview: operationDraftPreview("Котёл"),
    metaExtensionsByElementId: { T1: operationState("Котёл") },
    hiddenFields: null,
  });
  assert.equal(id, "");
});

test("indicator: real field edit with operation key still detected", () => {
  const id = resolvePropertiesOverlayDraftIndicator({
    draftPreview: operationDraftPreview("Цех"),
    metaExtensionsByElementId: { T1: operationState("Котёл") },
    hiddenFields: null,
  });
  assert.equal(id, "T1");
});
