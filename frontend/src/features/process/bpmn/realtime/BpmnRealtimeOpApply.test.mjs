import test from "node:test";
import assert from "node:assert/strict";

import { applyBpmnRealtimeOpBatch } from "./BpmnRealtimeOpApply.js";

test("applyBpmnRealtimeOpBatch applies supported ops without touching autosave lane", async () => {
  const shape = { id: "Task_1", type: "bpmn:Task", width: 100, height: 80 };
  const flow = { id: "Flow_1", waypoints: [{ x: 0, y: 0 }, { x: 10, y: 10 }] };
  const labels = [];

  const modeling = {
    resizeShape(el, bounds) {
      el.x = bounds.x;
      el.y = bounds.y;
      el.width = bounds.width;
      el.height = bounds.height;
    },
    updateWaypoints(el, points) {
      el.waypoints = points;
    },
    updateLabel(el, text) {
      labels.push({ id: el.id, text });
    },
  };

  const inst = {
    get(name) {
      if (name === "elementRegistry") {
        return {
          get(id) {
            if (id === "Task_1") return shape;
            if (id === "Flow_1") return flow;
            return null;
          },
        };
      }
      if (name === "modeling") return modeling;
      return null;
    },
  };

  const suppressRealtimeOpsEmitRef = { current: 0 };
  let refreshCalls = 0;

  const result = await applyBpmnRealtimeOpBatch({
    sessionId: "s1",
    payload: {
      ops: [
        { kind: "element_geometry_set", payload: { element_id: "Task_1", x: 20, y: 25, width: 120, height: 90 } },
        { kind: "connection_waypoints_set", payload: { element_id: "Flow_1", waypoints: [{ x: 1, y: 2 }, { x: 30, y: 40 }] } },
        { kind: "element_label_set", payload: { element_id: "Task_1", label: "Renamed" } },
      ],
    },
    modeler: inst,
    ensureModeler: async () => inst,
    isShapeElement: (el) => !Array.isArray(el?.waypoints),
    isConnectionElement: (el) => Array.isArray(el?.waypoints),
    withSuppressedCommandStack: async (task) => task(),
    suppressRealtimeOpsEmitRef,
    refreshRealtimeElementsSnapshot: () => {
      refreshCalls += 1;
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.applied, 3);
  assert.equal(result.failed, 0);
  assert.equal(refreshCalls, 1);
  assert.equal(suppressRealtimeOpsEmitRef.current, 0);
  assert.equal(shape.x, 20);
  assert.equal(shape.y, 25);
  assert.equal(shape.width, 120);
  assert.equal(flow.waypoints.length, 2);
  assert.deepEqual(labels, [{ id: "Task_1", text: "Renamed" }]);
});
