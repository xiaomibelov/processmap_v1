import assert from "node:assert/strict";
import test from "node:test";

import {
  buildPropertiesOverlayEntryBaseSignature,
  shouldReusePropertiesOverlayEntry,
} from "./decorManager.js";

function buildEntry({
  elementId = "Activity_017vg6s",
  hostType = "task",
  hiddenCount = 0,
  zoomBucket = 1,
  items = [{ key: "k", label: "Label", value: "Value" }],
} = {}) {
  return buildPropertiesOverlayEntryBaseSignature({
    elementId,
    hostType,
    hiddenCount,
    zoomBucket,
    items,
  });
}

test("overlay base signature is stable for equal-by-meaning payload", () => {
  const signatureA = buildEntry({
    items: [{ key: "cost", label: "Cost", value: "100" }],
  });
  const signatureB = buildEntry({
    items: [{ key: "cost", label: "Cost", value: "100" }],
  });
  assert.equal(signatureA, signatureB);
});

test("overlay base signature changes when selected-element payload changes", () => {
  const prev = buildEntry({
    elementId: "Activity_017vg6s",
    items: [{ key: "cost", label: "Cost", value: "100" }],
  });
  const next = buildEntry({
    elementId: "Activity_017vg6s",
    items: [{ key: "cost", label: "Cost", value: "150" }],
  });
  assert.notEqual(prev, next);
});

test("overlay base signature changes when always-on dataset entry changes", () => {
  const prev = buildEntry({
    elementId: "Activity_squid_5",
    hiddenCount: 2,
    items: [
      { key: "p0", label: "P0", value: "A" },
      { key: "p1", label: "P1", value: "B" },
    ],
  });
  const next = buildEntry({
    elementId: "Activity_squid_5",
    hiddenCount: 3,
    items: [
      { key: "p0", label: "P0", value: "A" },
      { key: "p1", label: "P1", value: "B" },
    ],
  });
  assert.notEqual(prev, next);
});

test("reuse guard allows skip only for unchanged entry signature", () => {
  const baseSignature = buildEntry({
    elementId: "Activity_017vg6s",
    items: [{ key: "cost", label: "Cost", value: "100" }],
  });
  assert.equal(
    shouldReusePropertiesOverlayEntry({ baseSignature }, baseSignature),
    true,
  );
  assert.equal(
    shouldReusePropertiesOverlayEntry({ baseSignature }, `${baseSignature}:changed`),
    false,
  );
});
