import test from "node:test";
import assert from "node:assert/strict";

import {
  buildCommandEvent,
  wrapOpsTransport,
  wrapOnStatus,
  installPageErrorListeners,
} from "../canvasEventCapture.js";

// -- buildCommandEvent: только id/типы из снапшота runtime ---------------------
test("buildCommandEvent: id/типы элементов, без свойств/имен/координат", () => {
  const ev = buildCommandEvent({
    command: "shape.move",
    action: "execute",
    commandContext: {
      element: { id: "Task_1", type: "bpmn:Task" },
      elements: [{ id: "Task_2", type: "bpmn:Task" }],
      source: { id: "Flow_1", type: "bpmn:SequenceFlow" },
      target: { id: "Gateway_1", type: "bpmn:ExclusiveGateway" },
      properties: { name: "Секрет" },
      newLabel: "Секретный лейбл",
      delta: { x: 10, y: 20 },
      newBounds: { x: 1, y: 2, width: 3, height: 4 },
      newWaypoints: [{ x: 1, y: 2 }],
    },
  });
  assert.equal(ev.kind, "command");
  assert.equal(ev.command.type, "shape.move");
  assert.deepEqual(ev.command.elementIds.sort(), ["Gateway_1", "Task_1", "Task_2"]);
  assert.deepEqual(ev.command.connectionIds, ["Flow_1"]);
  const raw = JSON.stringify(ev);
  assert.ok(!raw.includes("Секрет"));
  assert.ok(!raw.includes("newBounds"));
  assert.ok(!raw.includes("waypoint") || !raw.includes('"x"'));
});

test("buildCommandEvent: undo-экшн пробрасывается", () => {
  const ev = buildCommandEvent({ command: "shape.delete", action: "undo", commandContext: null });
  assert.equal(ev.command.action, "undo");
});

// -- wrapOpsTransport: latency/status записываются, результат пробрасывается ----
test("wrapOpsTransport: меряет latency, статус, не ломает результат", async () => {
  const recorded = [];
  const feed = { record: (ev) => recorded.push(ev) };
  const wrapped = wrapOpsTransport(
    async (sid, body) => ({ ok: false, status: 422, error: "OPERATION_UNSUPPORTED", data: { detail: { code: "OPERATION_UNSUPPORTED", opId: "op_1", type: "move", reason: "bpmn_xml_parse_error" } } }),
    feed,
    { endpoint: "/api/sessions/s_1/operations" },
  );
  const result = await wrapped("s_1", { operations: [{ opId: "op_1", type: "move" }], baseVersion: 41 });
  assert.equal(result.status, 422);
  const opEvent = recorded.find((e) => e.kind === "op");
  assert.ok(opEvent, "op-событие записано");
  assert.equal(opEvent.op.count, 1);
  assert.equal(recorded.filter((e) => e.kind === "error").length, 1);
  const ev = recorded.find((e) => e.kind === "error");
  assert.equal(ev.kind, "error");
  assert.equal(ev.http.status, 422);
  assert.equal(ev.error.code, "OPERATION_UNSUPPORTED");
  assert.equal(ev.error.opId, "op_1");
  assert.equal(ev.versions.clientBase, 41);
  assert.ok(ev.http.latencyMs >= 0);
});

test("wrapOpsTransport: 200 ack с версиями из тела ответа", async () => {
  const recorded = [];
  const feed = { record: (ev) => recorded.push(ev) };
  const wrapped = wrapOpsTransport(
    async () => ({ ok: true, status: 200, data: { version: 42 } }),
    feed,
    {},
  );
  const result = await wrapped("s_1", { baseVersion: 41 });
  assert.equal(result.ok, true);
  const ack = recorded.find((e) => e.kind === "ack");
  assert.ok(ack, "ack-событие записано");
  assert.equal(ack.http.status, 200);
  assert.equal(ack.versions.serverAck, 42);
  assert.equal(ack.versions.clientBase, 41);
});

test("wrapOpsTransport: ошибка маппинга/бросок транспорта не рвёт вызывающего", async () => {
  const feed = { record: () => { throw new Error("feed boom"); } };
  const wrapped = wrapOpsTransport(async () => ({ ok: true, status: 200, data: {} }), feed, {});
  const result = await wrapped("s_1", {});
  assert.equal(result.ok, true, "результат транспорта сохранён несмотря на сбой записи");
});

// -- wrapOnStatus: UX-переходы ---------------------------------------------------
test("wrapOnStatus: событие save_status с opsStage", () => {
  const recorded = [];
  const feed = { record: (ev) => recorded.push(ev) };
  const cb = wrapOnStatus((event) => { throw new Error("cb boom"); }, feed);
  cb({ stage: "ops-unsupported", reason: "bpmn_xml_parse_error" });
  assert.equal(recorded.length, 1);
  assert.equal(recorded[0].kind, "save_status");
  assert.equal(recorded[0].ux.opsStage, "ops-unsupported");
  assert.equal(recorded[0].ux.state, "failed");
});

// -- pageerror listeners ----------------------------------------------------------
test("installPageErrorListeners: window error → pageerror событие", () => {
  const recorded = [];
  const feed = { record: (ev) => recorded.push(ev) };
  const listeners = {};
  const fakeWindow = {
    addEventListener(type, cb) { listeners[type] = cb; },
    removeEventListener(type) { delete listeners[type]; },
  };
  const un = installPageErrorListeners(feed, { win: fakeWindow });
  listeners.error({ message: "boom", filename: "app.js", lineno: 5, error: { stack: "s" } });
  assert.equal(recorded.length, 1);
  assert.equal(recorded[0].kind, "pageerror");
  assert.equal(recorded[0].error.message, "boom");
  un();
  assert.equal(listeners.error, undefined);
});
