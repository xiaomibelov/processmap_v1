import test from "node:test";
import assert from "node:assert/strict";
import {
  areCamundaPropertiesSectionPropsEqual,
  buildPropertiesOverlayPreviewSignature,
} from "./camundaPropertiesSectionMemo.js";

test("CamundaPropertiesSection comparator ignores callback identity churn when data props are stable", () => {
  const prev = {
    selectedElementId: "Task_1",
    operationKey: "set_container",
    extensionStateDraft: { properties: { extensionProperties: [{ id: "p1", name: "k", value: "v" }] } },
    extensionStateBusy: false,
    onSaveExtensionState: () => "prev",
  };
  const next = {
    selectedElementId: "Task_1",
    operationKey: "set_container",
    extensionStateDraft: prev.extensionStateDraft,
    extensionStateBusy: false,
    onSaveExtensionState: () => "next",
  };

  assert.equal(areCamundaPropertiesSectionPropsEqual(prev, next), true);
});

test("CamundaPropertiesSection comparator forces rerender when any non-function prop changes", () => {
  const sharedDraft = { properties: { extensionProperties: [] } };
  const prev = {
    selectedElementId: "Task_1",
    extensionStateDraft: sharedDraft,
    extensionStateBusy: false,
    onSaveExtensionState: () => {},
  };
  const nextBusy = {
    ...prev,
    extensionStateBusy: true,
    onSaveExtensionState: () => {},
  };
  const nextDraftRef = {
    ...prev,
    extensionStateDraft: { properties: { extensionProperties: [] } },
    onSaveExtensionState: () => {},
  };
  const nextElement = {
    ...prev,
    selectedElementId: "Task_2",
    onSaveExtensionState: () => {},
  };

  assert.equal(areCamundaPropertiesSectionPropsEqual(prev, nextBusy), false);
  assert.equal(areCamundaPropertiesSectionPropsEqual(prev, nextDraftRef), false);
  assert.equal(areCamundaPropertiesSectionPropsEqual(prev, nextElement), false);
});

test("buildPropertiesOverlayPreviewSignature is stable for semantic-equal preview payloads", () => {
  const left = {
    enabled: true,
    elementId: "Task_1",
    hiddenCount: 2,
    totalCount: 6,
    items: [
      { key: "IN:foo", label: "IN foo", value: "bar" },
      { key: "prop_1", label: "Code", value: "A-1" },
    ],
  };
  const right = {
    enabled: true,
    elementId: "Task_1",
    hiddenCount: 2,
    totalCount: 6,
    items: [
      { key: "IN:foo", label: "IN   foo", value: " bar " },
      { key: "prop_1", label: "Code", value: "A-1" },
    ],
  };
  assert.equal(
    buildPropertiesOverlayPreviewSignature(left),
    buildPropertiesOverlayPreviewSignature(right),
  );
});

test("buildPropertiesOverlayPreviewSignature changes when semantic values change", () => {
  const base = {
    enabled: true,
    elementId: "Task_1",
    hiddenCount: 0,
    totalCount: 1,
    items: [{ key: "prop_1", label: "Code", value: "A-1" }],
  };
  const changedValue = {
    ...base,
    items: [{ key: "prop_1", label: "Code", value: "B-2" }],
  };
  assert.notEqual(
    buildPropertiesOverlayPreviewSignature(base),
    buildPropertiesOverlayPreviewSignature(changedValue),
  );
});

test("buildPropertiesOverlayPreviewSignature supports null payload", () => {
  assert.equal(buildPropertiesOverlayPreviewSignature(null), "null");
});
