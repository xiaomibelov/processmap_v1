import test from "node:test";
import assert from "node:assert/strict";

import {
  readInsertedTemplateElementIds,
  shouldNudgeViewportToElement,
} from "./useTemplatesStageBridge.js";

test("readInsertedTemplateElementIds: returns unique inserted ids", () => {
  const ids = readInsertedTemplateElementIds({
    remap: {
      old_a: "Activity_A",
      old_b: "Activity_B",
      old_f: "Flow_A_B",
    },
    entryNodeId: "Activity_A",
    exitNodeId: "Activity_B",
  });
  assert.deepEqual(ids, ["Activity_A", "Activity_B", "Flow_A_B"]);
});

test("shouldNudgeViewportToElement: true when element mostly outside viewport", () => {
  const nudge = shouldNudgeViewportToElement(
    { x: 720, y: 980, width: 120, height: 80 },
    { viewbox: { x: 0, y: 0, width: 704, height: 846 } },
  );
  assert.equal(nudge, true);
});

test("shouldNudgeViewportToElement: false when element is sufficiently visible", () => {
  const nudge = shouldNudgeViewportToElement(
    { x: 180, y: 220, width: 120, height: 80 },
    { viewbox: { x: 0, y: 0, width: 704, height: 846 } },
  );
  assert.equal(nudge, false);
});
