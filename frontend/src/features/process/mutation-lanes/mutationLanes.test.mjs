import test from "node:test";
import assert from "node:assert/strict";

import { runRealtimeOpsLane } from "./RealtimeOpsLane.js";
import { runDurableSnapshotLane } from "./DurableSnapshotLane.js";

test("runRealtimeOpsLane publishes only diagram.realtime_ops payload", () => {
  const calls = [];
  const skipped = runRealtimeOpsLane({
    sid: "s1",
    mutationPayload: { kind: "diagram.change" },
    onPublishRealtimeBpmnOps: (payload) => calls.push(payload),
  });
  assert.equal(skipped.skipped, true);

  const published = runRealtimeOpsLane({
    sid: "s1",
    mutationPayload: {
      kind: "diagram.realtime_ops",
      source: "command_stack",
      ops: [
        { kind: "element_geometry_set", payload: { element_id: "Task_1", x: 10, y: 20 } },
      ],
    },
    onPublishRealtimeBpmnOps: (payload) => calls.push(payload),
  });

  assert.equal(published.published, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].sessionId, "s1");
  assert.equal(calls[0].mutationKind, "diagram.realtime_ops");
  assert.equal(calls[0].ops.length, 1);
});

test("runDurableSnapshotLane always enqueues autosave mutation", () => {
  const queued = [];
  const result = runDurableSnapshotLane({
    sid: "s2",
    mutationPayload: { kind: "xml.edit", source: "xml_editor" },
    scheduleDiagramAutosave: (job) => queued.push(job),
  });

  assert.equal(result.queued, true);
  assert.equal(queued.length, 1);
  assert.equal(queued[0].mutation.kind, "xml.edit");
  assert.equal(typeof queued[0].at, "number");
});
