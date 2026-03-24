import test from "node:test";
import assert from "node:assert/strict";

import {
  buildRealtimeOpsFromDiff,
  emitRealtimeOpsFromModeler,
} from "./BpmnRealtimeOpCapture.js";

test("buildRealtimeOpsFromDiff emits geometry and waypoint ops", () => {
  const prev = new Map([
    ["Task_1", { kind: "shape", x: 10, y: 20, width: 120, height: 80, label: "A" }],
    ["Flow_1", { kind: "connection", waypoints: [{ x: 0, y: 0 }, { x: 50, y: 50 }], label: "F" }],
  ]);
  const next = new Map([
    ["Task_1", { kind: "shape", x: 30, y: 40, width: 120, height: 80, label: "A2" }],
    ["Flow_1", { kind: "connection", waypoints: [{ x: 1, y: 1 }, { x: 50, y: 50 }], label: "F" }],
  ]);

  const ops = buildRealtimeOpsFromDiff(prev, next, { now: () => 123 });
  const kinds = ops.map((row) => row.kind).sort();
  assert.deepEqual(kinds, ["connection_waypoints_set", "element_geometry_set", "element_label_set"]);
  assert.ok(ops.every((row) => row.client_ts === 123));
});

test("emitRealtimeOpsFromModeler skips when emit is suppressed", () => {
  const suppressRealtimeOpsEmitRef = { current: 1 };
  const realtimeElementSnapshotRef = { current: new Map() };
  const fakeModeler = {
    get(name) {
      if (name !== "elementRegistry") return null;
      return {
        getAll() {
          return [{ id: "Task_1", type: "bpmn:Task", x: 1, y: 2, width: 100, height: 80, businessObject: { name: "T" } }];
        },
      };
    },
  };

  const result = emitRealtimeOpsFromModeler({
    inst: fakeModeler,
    suppressRealtimeOpsEmitRef,
    realtimeElementSnapshotRef,
    isConnectionElement: (el) => Array.isArray(el?.waypoints),
    isShapeElement: (el) => !Array.isArray(el?.waypoints) && el?.type !== "label",
    emitDiagramMutation: () => {
      throw new Error("must_not_emit_when_suppressed");
    },
  });

  assert.equal(result.reason, "emit_suppressed");
  assert.equal(realtimeElementSnapshotRef.current instanceof Map, true);
});
