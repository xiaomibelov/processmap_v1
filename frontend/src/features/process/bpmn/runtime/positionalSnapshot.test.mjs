import test from "node:test";
import assert from "node:assert/strict";

import {
  collectIncidentConnections,
  enrichPositionalSnapshot,
} from "./positionalSnapshot.js";

// ---------------------------------------------------------------------------
// Контур fix/canvas-move-di-desync-409-tracker, срез S1 (F1/F2).
// Одиночный drag фаерит shape.move, resize — shape.resize; вложенные
// connection-обновления diagram-js «тихие» (commandStack.changed — только
// outermost action), поэтому enrichment обязан доснимать affectedConnections
// с актуальными waypoints — иначе серверный DI стрелок устаревает →
// растянутые стрелки после reload (аудит canvas-move-di-desync-422,
// evidence f1b-f2-fixture). Паритет с elements.move/spaceTool (S3).
// ---------------------------------------------------------------------------

function connection(id, waypoints) {
  return {
    id,
    type: "bpmn:SequenceFlow",
    waypoints: waypoints.map(([x, y]) => ({ x, y })),
  };
}

test("S1: shape.move — enrichment доснимает инцидентные связи шейпа с актуальными waypoints", () => {
  const flowIn = connection("Flow_in", [[0, 240], [100, 240]]);
  const flowOut = connection("Flow_out", [[220, 240], [400, 240]]);
  const shape = {
    id: "Task_1",
    type: "bpmn:Task",
    x: 100,
    y: 200,
    width: 120,
    height: 80,
    incoming: [flowIn],
    outgoing: [flowOut],
  };
  const snapshot = { element: { id: "Task_1" }, delta: { x: 40, y: 30 } };
  enrichPositionalSnapshot("shape.move", { shape, delta: { x: 40, y: 30 } }, snapshot);
  assert.ok(Array.isArray(snapshot.affectedConnections), "affectedConnections обязан появиться");
  assert.equal(snapshot.affectedConnections.length, 2);
  assert.deepEqual(
    snapshot.affectedConnections.map((c) => c.id).sort(),
    ["Flow_in", "Flow_out"],
  );
  const out = snapshot.affectedConnections.find((c) => c.id === "Flow_out");
  // bpmn-js waypoints — {x, y}; снапшот сериализует в [x, y] (wire-форма маппера).
  assert.deepEqual(out.waypoints, [[220, 240], [400, 240]], "waypoints — актуальные (post-move) точки");
});

test("S1: shape.resize — enrichment доснимает те же инцидентные связи reshaped-шейпа", () => {
  const flowOut = connection("Flow_out", [[300, 250], [420, 250]]);
  const shape = {
    id: "Task_1",
    type: "bpmn:Task",
    x: 100,
    y: 200,
    width: 200,
    height: 100,
    outgoing: [flowOut],
  };
  const snapshot = { element: { id: "Task_1" } };
  enrichPositionalSnapshot("shape.resize", { shape, newBounds: { x: 100, y: 200, width: 200, height: 100 } }, snapshot);
  assert.ok(Array.isArray(snapshot.affectedConnections), "resize обязан нести affectedConnections (F2)");
  assert.equal(snapshot.affectedConnections.length, 1);
  assert.equal(snapshot.affectedConnections[0].id, "Flow_out");
  assert.deepEqual(snapshot.affectedConnections[0].waypoints, [[300, 250], [420, 250]]);
});

test("S1: undo-паритет — captured post-undo waypoints уходят в снапшот как есть", () => {
  // S7-контракт: на undo-changed enrichment снимает post-undo waypoints —
  // инверсия происходит на уровне маппера (delta/bounds), waypoints — как есть.
  const flowOut = connection("Flow_out", [[180, 210], [360, 210]]);
  const shape = { id: "Task_1", type: "bpmn:Task", x: 100, y: 200, width: 120, height: 80, outgoing: [flowOut] };
  const snapshot = {};
  enrichPositionalSnapshot("shape.move", { shape, delta: { x: -40, y: -30 } }, snapshot);
  assert.deepEqual(snapshot.affectedConnections[0].waypoints, [[180, 210], [360, 210]]);
});

test("S1: битый контекст не ломает enrichment — без shape / с невалидными связями affectedConnections не появляется", () => {
  const noShape = { element: { id: "Task_1" } };
  enrichPositionalSnapshot("shape.move", { delta: { x: 1, y: 1 } }, noShape);
  assert.equal(noShape.affectedConnections, undefined, "без shape — enrichment молча пропускается (маппер fail-closed)");

  const garbage = { element: { id: "Task_1" } };
  assert.doesNotThrow(() => {
    enrichPositionalSnapshot("shape.move", { shape: { incoming: "not-an-array", outgoing: null } }, garbage);
    enrichPositionalSnapshot("shape.resize", null, garbage);
    enrichPositionalSnapshot("shape.move", { shape: { id: "Task_1" } }, null);
  });
  assert.equal(garbage.affectedConnections, undefined);

  const noIdConn = { element: { id: "Task_1" } };
  const shape = { id: "Task_1", outgoing: [{ type: "bpmn:SequenceFlow", waypoints: [{ x: 1, y: 2 }] }] };
  enrichPositionalSnapshot("shape.move", { shape }, noIdConn);
  assert.equal(noIdConn.affectedConnections, undefined, "связь без id не попадает в снапшот");
});

test("S1: дедупликация — связь в incoming и одновременно в чужом outgoing снимается один раз", () => {
  const shared = connection("Flow_shared", [[0, 0], [10, 10]]);
  const a = { id: "Task_1", outgoing: [shared] };
  const b = { id: "Task_2", incoming: [shared] };
  const seen = collectIncidentConnections([a, b]);
  assert.equal(seen.length, 1);
  assert.equal(seen[0].id, "Flow_shared");
});

test("S1: регрессия elements.move/spaceTool — enrichment не затронут", () => {
  const flow = connection("Flow_1", [[140, 240], [340, 230]]);
  const moved = {};
  enrichPositionalSnapshot(
    "elements.move",
    { shapes: [{ id: "Task_1", outgoing: [flow] }], delta: { x: 40, y: 30 } },
    moved,
  );
  assert.equal(moved.affectedConnections.length, 1);
  assert.deepEqual(moved.affectedConnections[0].waypoints, [[140, 240], [340, 230]]);

  const spaced = {};
  enrichPositionalSnapshot(
    "spaceTool",
    { movingShapes: [{ id: "Task_8" }], resizingShapes: [{ id: "Task_7", incoming: [flow] }] },
    spaced,
  );
  assert.equal(spaced.affectedConnections.length, 1);
});
