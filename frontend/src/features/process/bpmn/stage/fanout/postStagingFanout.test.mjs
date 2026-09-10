import assert from "node:assert/strict";
import test from "node:test";

import { runImmediateEditorFanout, shouldRefreshDecorForCommand } from "./postStagingFanout.js";

test("positional commands do not require a full decorator refresh", () => {
  assert.equal(shouldRefreshDecorForCommand("shape.move"), false);
  assert.equal(shouldRefreshDecorForCommand("elements.move"), false);
  assert.equal(shouldRefreshDecorForCommand("shape.create"), true);
  assert.equal(shouldRefreshDecorForCommand(""), true);
});

test("positional fanout preserves realtime operation emission", () => {
  const calls = [];
  runImmediateEditorFanout({
    inst: {},
    refreshDecor: false,
    applyTaskTypeDecor: () => calls.push("task"),
    applyLinkEventDecor: () => calls.push("link"),
    applyHappyFlowDecor: () => calls.push("happy"),
    emitRealtimeOpsFromModeler: () => calls.push("realtime"),
    realtimeOpsEnabled: true,
  });
  assert.deepEqual(calls, ["realtime"]);
});
