import test from "node:test";
import assert from "node:assert/strict";

import {
  apiAddNoteThreadComment,
  apiCreateNoteThread,
  apiGetFolderNoteAggregate,
  apiGetProjectNoteAggregate,
  apiGetSessionNoteAggregate,
  apiListNoteThreads,
  apiPatchNoteThread,
} from "./api.js";

function withFetch(handler, fn) {
  const prevFetch = globalThis.fetch;
  globalThis.fetch = handler;
  return Promise.resolve()
    .then(fn)
    .finally(() => {
      globalThis.fetch = prevFetch;
    });
}

test("note threads API helpers use MVP-1 endpoints and payload contract", async () => {
  const calls = [];
  await withFetch(async (input, init = {}) => {
    calls.push({
      url: String(input || ""),
      method: String(init?.method || "GET"),
      body: init?.body ? JSON.parse(String(init.body)) : null,
    });
    return new Response(JSON.stringify({
      items: [{ id: "thread_1", scope_type: "diagram_element", comments: [] }],
      count: 1,
      thread: { id: "thread_1", status: "open", comments: [] },
    }), {
      status: init?.method === "POST" ? 201 : 200,
      headers: { "Content-Type": "application/json" },
    });
  }, async () => {
    const list = await apiListNoteThreads("sess_1", {
      status: "open",
      scopeType: "diagram_element",
      elementId: "Task_1",
    });
    const created = await apiCreateNoteThread("sess_1", {
      scope_type: "diagram_element",
      scope_ref: { element_id: "Task_1" },
      body: "Проверить шаг",
    });
    const commented = await apiAddNoteThreadComment("thread_1", { body: "Комментарий" });
    const patched = await apiPatchNoteThread("thread_1", { status: "resolved" });

    assert.equal(list.ok, true);
    assert.equal(list.count, 1);
    assert.equal(created.thread.id, "thread_1");
    assert.equal(commented.thread.id, "thread_1");
    assert.equal(patched.thread.status, "open");
  });

  assert.match(calls[0].url, /\/api\/sessions\/sess_1\/note-threads\?status=open&scope_type=diagram_element&element_id=Task_1$/);
  assert.equal(calls[0].method, "GET");
  assert.match(calls[1].url, /\/api\/sessions\/sess_1\/note-threads$/);
  assert.equal(calls[1].method, "POST");
  assert.deepEqual(Object.keys(calls[1].body).sort(), ["body", "scope_ref", "scope_type"]);
  assert.match(calls[2].url, /\/api\/note-threads\/thread_1\/comments$/);
  assert.equal(calls[2].method, "POST");
  assert.match(calls[3].url, /\/api\/note-threads\/thread_1$/);
  assert.equal(calls[3].method, "PATCH");
  assert.deepEqual(calls[3].body, { status: "resolved" });
});

test("note aggregate API helpers use MVP-1 aggregate endpoints", async () => {
  const calls = [];
  await withFetch(async (input, init = {}) => {
    calls.push({
      url: String(input || ""),
      method: String(init?.method || "GET"),
    });
    return new Response(JSON.stringify({
      open_notes_count: 2,
      has_open_notes: true,
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }, async () => {
    const session = await apiGetSessionNoteAggregate("sess_1");
    const project = await apiGetProjectNoteAggregate("proj_1");
    const folder = await apiGetFolderNoteAggregate("folder_1", "workspace_1");

    assert.equal(session.ok, true);
    assert.equal(session.aggregate.open_notes_count, 2);
    assert.equal(project.aggregate.scope_type, "project");
    assert.equal(folder.aggregate.has_open_notes, true);
  });

  assert.match(calls[0].url, /\/api\/sessions\/sess_1\/note-aggregate$/);
  assert.match(calls[1].url, /\/api\/projects\/proj_1\/note-aggregate$/);
  assert.match(calls[2].url, /\/api\/folders\/folder_1\/note-aggregate\?workspace_id=workspace_1$/);
  assert.deepEqual(calls.map((call) => call.method), ["GET", "GET", "GET"]);
});
