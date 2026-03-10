import test from "node:test";
import assert from "node:assert/strict";

import { buildInterviewTimelineItems } from "./buildTimelineItems.js";

test("buildInterviewTimelineItems inserts between-branches item after anchor step", () => {
  const timelineView = [
    { id: "step_1", seq_label: "1", action: "Start" },
    {
      id: "step_2",
      seq_label: "2",
      action: "Decision",
      between_branches_item: {
        kind: "between_branches",
        fromGraphNo: "2",
        toGraphNo: "3",
        branches: [
          { key: "A", label: "Да", children: [{ kind: "continue", targetGraphNo: "3", targetTitle: "Mainline" }] },
          { key: "B", label: "Нет", children: [{ kind: "step", nodeId: "R1", title: "Retry" }] },
        ],
      },
    },
    { id: "step_3", seq_label: "3", action: "Mainline next" },
  ];

  const items = buildInterviewTimelineItems(timelineView);
  assert.equal(items.length, 4);
  assert.deepEqual(items.map((item) => item.kind), ["step", "step", "between_branches", "step"]);
  assert.equal(items[2].anchorStepId, "step_2");
  assert.equal(items[2].between.fromGraphNo, "2");
  assert.equal(items[2].between.toGraphNo, "3");
});

test("buildInterviewTimelineItems does not create between item for invalid block", () => {
  const timelineView = [
    { id: "step_1", action: "A", between_branches_item: { kind: "unknown" } },
    { id: "step_2", action: "B" },
  ];

  const items = buildInterviewTimelineItems(timelineView);
  assert.equal(items.length, 2);
  assert.deepEqual(items.map((item) => item.kind), ["step", "step"]);
});
