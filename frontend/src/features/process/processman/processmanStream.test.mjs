// AGENT-1 — unit-тесты SSE streaming-логики Processman (parser + reader + event mapper).
import test from "node:test";

import assert from "node:assert/strict";

import {
  mapStreamEventToMessage,
  parseSseBuffer,
  readSseEvents,
  SSE_EVENT,
} from "./processmanView.js";

test("parseSseBuffer: разбирает полные блоки, leftover — последний кусок", () => {
  const buffer = "event: start\ndata: {\"turn_id\":\"t1\"}\n\nevent: token\ndata: {\"delta\":\"привет\"}\n\nevent: to";
  const { events, leftover } = parseSseBuffer(buffer);
  assert.equal(events.length, 2);
  assert.equal(events[0].event, "start");
  assert.equal(events[0].data.turn_id, "t1");
  assert.equal(events[1].event, "token");
  assert.equal(events[1].data.delta, "привет");
  assert.equal(leftover, "event: to");
});

test("parseSseBuffer: пустые блоки и data без пробела", () => {
  const buffer = "event:done\ndata:{\"ok\":true}\n\n\nevent:error\ndata:{\"status\":\"no_provider\"}\n\n";
  const { events } = parseSseBuffer(buffer);
  assert.equal(events.length, 2);
  assert.equal(events[0].event, "done");
  assert.equal(events[0].data.ok, true);
  assert.equal(events[1].event, "error");
  assert.equal(events[1].data.status, "no_provider");
});

function makeMockReader(chunks) {
  let i = 0;
  return {
    read: async () => {
      if (i >= chunks.length) return { done: true, value: undefined };
      const value = chunks[i];
      i += 1;
      return { done: false, value: typeof value === "string" ? new TextEncoder().encode(value) : value };
    },
    cancel: async () => {},
  };
}

test("readSseEvents: читает события из reader по частям", async () => {
  const reader = makeMockReader([
    "event: start\ndata: {\"turn_id\":\"t1\"}\n\nevent: token\ndata: {\"delta\":\"при\"}\n\n",
    "event: token\ndata: {\"delta\":\"вет\"}\n\nevent: done\ndata: {\"usage\":{\"tokens\":2}}\n\n",
  ]);
  const events = [];
  for await (const ev of readSseEvents(reader)) events.push(ev);
  assert.equal(events.length, 4);
  assert.deepEqual(events.map((e) => e.event), ["start", "token", "token", "done"]);
  assert.equal(events[3].data.usage.tokens, 2);
});

test("readSseEvents: финализирует незавершённый leftover", async () => {
  const reader = makeMockReader(["event: token\ndata: {\"delta\":\"x\"}\n\nevent: done\ndata: {\"ok\":true}"]);
  const events = [];
  for await (const ev of readSseEvents(reader)) events.push(ev);
  assert.equal(events.length, 2);
  assert.equal(events[1].event, "done");
});

test("mapStreamEventToMessage: token/action/done/error", () => {
  assert.deepEqual(mapStreamEventToMessage(SSE_EVENT.TOKEN, { delta: "x" }), { type: "text", delta: "x" });
  assert.deepEqual(
    mapStreamEventToMessage(SSE_EVENT.ACTION, { action: "suggest", payload: { candidates: [] } }),
    { type: "action", action: "suggest", actionPayload: { candidates: [] } },
  );
  assert.deepEqual(mapStreamEventToMessage(SSE_EVENT.DONE, { usage: { tokens: 1 } }), { type: "done", usage: { tokens: 1 } });
  assert.deepEqual(
    mapStreamEventToMessage(SSE_EVENT.ERROR, { status: "no_provider", error: "no provider" }),
    { type: "error", errorStatus: "no_provider", errorText: "no provider" },
  );
  assert.deepEqual(mapStreamEventToMessage("unknown", {}), { type: "noop" });
});

test("mapStreamEventToMessage: AGENT-3 confirm_required", () => {
  const payload = {
    pending_edit_id: "pe_123",
    edit_plan: { note: "добавить шаг", operations: [] },
    diff: [{ op: "add_node", node_id: "Task_1", title: "Новый шаг" }],
    timeout_sec: 900,
  };
  assert.deepEqual(mapStreamEventToMessage(SSE_EVENT.CONFIRM_REQUIRED, payload), {
    type: "confirm_required",
    pendingEditId: "pe_123",
    editPlan: { note: "добавить шаг", operations: [] },
    diff: [{ op: "add_node", node_id: "Task_1", title: "Новый шаг" }],
    timeoutSec: 900,
  });
});
