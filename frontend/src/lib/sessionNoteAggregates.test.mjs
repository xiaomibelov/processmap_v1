import test from "node:test";
import assert from "node:assert/strict";

import {
  clearSessionNoteAggregateCache,
  fetchSessionNoteAggregate,
  fetchSessionNoteAggregates,
  invalidateSessionNoteAggregate,
} from "./sessionNoteAggregates.js";

function aggregatePayload(sessionId, count) {
  return {
    scope_type: "session",
    session_id: sessionId,
    open_notes_count: count,
    has_open_notes: count > 0,
    attention_discussions_count: count,
    has_attention_discussions: count > 0,
    personal_discussions_count: count > 1 ? 1 : 0,
    has_personal_discussions: count > 1,
  };
}

async function withFetch(handler, fn) {
  const prevFetch = globalThis.fetch;
  globalThis.fetch = handler;
  clearSessionNoteAggregateCache();
  try {
    return await fn();
  } finally {
    clearSessionNoteAggregateCache();
    globalThis.fetch = prevFetch;
  }
}

test("fetchSessionNoteAggregates batches visible rows and reuses cache for single consumers", async () => {
  const calls = [];
  await withFetch(async (input, init = {}) => {
    calls.push({
      url: String(input || ""),
      method: String(init?.method || "GET"),
      body: init?.body ? JSON.parse(String(init.body)) : null,
    });
    return new Response(JSON.stringify({
      items: [
        aggregatePayload("sess_1", 2),
        aggregatePayload("sess_2", 0),
      ],
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }, async () => {
    const batch = await fetchSessionNoteAggregates(["sess_1", "sess_2", "sess_1"]);
    assert.equal(batch.get("sess_1").open_notes_count, 2);
    assert.equal(batch.get("sess_2").open_notes_count, 0);

    const single = await fetchSessionNoteAggregate("sess_1");
    assert.equal(single.open_notes_count, 2);
  });

  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /\/api\/sessions\/note-aggregates$/);
  assert.deepEqual(calls[0].body, { session_ids: ["sess_1", "sess_2"] });
});

test("fetchSessionNoteAggregate de-dupes concurrent active-session refreshes", async () => {
  const calls = [];
  await withFetch(async (input, init = {}) => {
    calls.push({
      url: String(input || ""),
      method: String(init?.method || "GET"),
    });
    return new Response(JSON.stringify(aggregatePayload("sess_active", 4)), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }, async () => {
    const results = await Promise.all([
      fetchSessionNoteAggregate("sess_active"),
      fetchSessionNoteAggregate("sess_active"),
      fetchSessionNoteAggregate("sess_active"),
    ]);
    assert.deepEqual(results.map((item) => item.open_notes_count), [4, 4, 4]);
  });

  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /\/api\/sessions\/sess_active\/note-aggregate$/);
});

test("invalidateSessionNoteAggregate clears cache and force refreshes still coalesce", async () => {
  const calls = [];
  let count = 1;
  await withFetch(async (input, init = {}) => {
    calls.push({
      url: String(input || ""),
      method: String(init?.method || "GET"),
    });
    return new Response(JSON.stringify(aggregatePayload("sess_mutated", count)), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }, async () => {
    const before = await fetchSessionNoteAggregate("sess_mutated");
    assert.equal(before.open_notes_count, 1);

    count = 5;
    invalidateSessionNoteAggregate("sess_mutated");
    const [afterLeft, afterRight] = await Promise.all([
      fetchSessionNoteAggregate("sess_mutated", { force: true }),
      fetchSessionNoteAggregate("sess_mutated", { force: true }),
    ]);

    assert.equal(afterLeft.open_notes_count, 5);
    assert.equal(afterRight.open_notes_count, 5);
  });

  assert.equal(calls.length, 2);
});
