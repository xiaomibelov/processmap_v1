import assert from "node:assert/strict";
import test from "node:test";

import { areCamundaPropertiesSectionPropsEqual } from "./camundaPropertiesSectionMemo.js";

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
