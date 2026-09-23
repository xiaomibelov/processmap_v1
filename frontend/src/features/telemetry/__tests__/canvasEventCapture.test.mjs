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

// -- subscribeSaveCoordinatorTelemetry: tap ВСЕХ save-путей (F1) -----------------
import {
  resolveSavePipelineLabel,
  subscribeSaveCoordinatorTelemetry,
} from "../canvasEventCapture.js";

function makeFakeCoordinator() {
  const subs = [];
  return {
    subscribe: (cb) => {
      subs.push(cb);
      return () => {
        const i = subs.indexOf(cb);
        if (i >= 0) subs.splice(i, 1);
      };
    },
    emit: (event, data) => {
      for (const cb of [...subs]) cb(event, data);
    },
  };
}

test("resolveSavePipelineLabel: маппинг pipeline/reason → лейбл пути", () => {
  assert.equal(resolveSavePipelineLabel("rawXml", "autosave"), "rawXml");
  assert.equal(resolveSavePipelineLabel("rawXml", "manual_save"), "manual");
  assert.equal(resolveSavePipelineLabel("xml", "property"), "property");
  assert.equal(resolveSavePipelineLabel("meta", "autosave_projection"), "meta");
  assert.equal(resolveSavePipelineLabel("analysis", "interview"), "analysis");
  assert.equal(resolveSavePipelineLabel("unknownPipe", "x"), "unknownPipe");
});

test("subscribeSaveCoordinatorTelemetry: error-ветка координатора → kind:error с pipeline/versions", () => {
  const recorded = [];
  const feed = { record: (ev) => recorded.push(ev) };
  const coordinator = makeFakeCoordinator();
  const detach = subscribeSaveCoordinatorTelemetry(coordinator, feed, { sessionId: "s_1" });
  coordinator.emit("error", {
    pipeline: "rawXml",
    sessionId: "s_1",
    clientBaseVersion: 41,
    reason: "autosave",
    response: { ok: false, status: 500, error: "server boom" },
  });
  assert.equal(recorded.length, 1);
  const ev = recorded[0];
  assert.equal(ev.kind, "error");
  assert.equal(ev.save.pipeline, "rawXml");
  assert.equal(ev.http.status, 500);
  assert.equal(ev.error.code, "http_500");
  assert.equal(ev.versions.clientTracked, 41);
  detach();
  coordinator.emit("error", { pipeline: "rawXml", sessionId: "s_1", response: { status: 500 } });
  assert.equal(recorded.length, 1, "после detach события не пишутся");
});

test("subscribeSaveCoordinatorTelemetry: manual/property/meta лейблы из pipeline+reason", () => {
  const recorded = [];
  const feed = { record: (ev) => recorded.push(ev) };
  const coordinator = makeFakeCoordinator();
  subscribeSaveCoordinatorTelemetry(coordinator, feed, { sessionId: "s_1" });
  coordinator.emit("error", { pipeline: "rawXml", sessionId: "s_1", reason: "manual_save", response: { status: 0, error: "network down" } });
  coordinator.emit("error", { pipeline: "xml", sessionId: "s_1", reason: "property", response: { status: 409, errorCode: "DIAGRAM_STATE_CONFLICT" } });
  coordinator.emit("error", { pipeline: "meta", sessionId: "s_1", reason: "projection", response: { status: 503 } });
  const pipelines = recorded.map((e) => e.save.pipeline);
  assert.deepEqual(pipelines, ["manual", "property", "meta"]);
  assert.equal(recorded[0].error.code, "network");
  assert.equal(recorded[1].error.code, "DIAGRAM_STATE_CONFLICT");
  assert.equal(recorded[1].save.errorClass, "ops_409");
});

test("subscribeSaveCoordinatorTelemetry: conflict-ветка → error с serverCurrent", () => {
  const recorded = [];
  const feed = { record: (ev) => recorded.push(ev) };
  const coordinator = makeFakeCoordinator();
  subscribeSaveCoordinatorTelemetry(coordinator, feed, { sessionId: "s_1" });
  coordinator.emit("conflict", {
    pipeline: "rawXml",
    sessionId: "s_1",
    clientBaseVersion: 36,
    serverVersion: 37,
    reason: "autosave",
    response: { ok: false, status: 409 },
  });
  const ev = recorded.find((e) => e.kind === "error");
  assert.ok(ev, "conflict пишет error-событие в ленту");
  assert.equal(ev.error.code, "DIAGRAM_STATE_CONFLICT");
  assert.equal(ev.versions.clientTracked, 36);
  assert.equal(ev.versions.serverCurrent, 37);
});

test("subscribeSaveCoordinatorTelemetry: success → save_status saved с versions (ack-эквивалент full-save)", () => {
  const recorded = [];
  const feed = { record: (ev) => recorded.push(ev) };
  const coordinator = makeFakeCoordinator();
  subscribeSaveCoordinatorTelemetry(coordinator, feed, { sessionId: "s_1" });
  coordinator.emit("success", {
    pipeline: "rawXml",
    sessionId: "s_1",
    clientBaseVersion: 42,
    version: 42,
    reason: "autosave",
  });
  const ev = recorded.find((e) => e.kind === "save_status");
  assert.ok(ev, "success пишет save_status saved");
  assert.equal(ev.ux.state, "saved");
  assert.equal(ev.save.pipeline, "rawXml");
  assert.deepEqual(ev.versions, { clientTracked: 42, serverAck: 42 });
});

test("subscribeSaveCoordinatorTelemetry: чужая сессия фильтруется, feed не ломается", () => {
  const recorded = [];
  const feed = { record: (ev) => recorded.push(ev) };
  const coordinator = makeFakeCoordinator();
  subscribeSaveCoordinatorTelemetry(coordinator, feed, { sessionId: "s_1" });
  coordinator.emit("error", { pipeline: "rawXml", sessionId: "s_other", response: { status: 500 } });
  assert.equal(recorded.length, 0);
  coordinator.emit("error", { pipeline: "rawXml", sessionId: "s_1", response: null });
  assert.equal(recorded.length, 1, "null-response не рвёт tap");
});

test("wrapOnStatus: versions из status-события (baseVersion/serverVersion) пишутся в payload", () => {
  const recorded = [];
  const feed = { record: (ev) => recorded.push(ev) };
  const cb = wrapOnStatus(() => {}, feed);
  cb({ stage: "ops-saved", baseVersion: 41, serverVersion: 42 });
  assert.equal(recorded.length, 1);
  assert.equal(recorded[0].ux.state, "saved");
  assert.deepEqual(recorded[0].versions, { clientTracked: 41, serverAck: 42 });
  // без версий — ключа versions нет (backwards-compatible)
  cb({ stage: "ops-rebase" });
  assert.equal("versions" in recorded[1], false);
});
