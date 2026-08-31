import test from "node:test";
import assert from "node:assert/strict";

import { apiGetSessionAssignees, apiReplaceSessionAssignees } from "./api.js";

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

test("apiGetSessionAssignees: calls GET /sessions/{id}/assignees and normalizes items", async () => {
  const prevFetch = globalThis.fetch;
  const calls = [];
  try {
    globalThis.fetch = async (input) => {
      calls.push(String(input || ""));
      return jsonResponse({
        items: [
          { user_id: "u_1", full_name: "Анна", email: "anna@local", job_title: "Аналитик" },
          { user_id: "u_2", full_name: "Борис", email: "boris@local" },
        ],
        count: 2,
      });
    };

    const out = await apiGetSessionAssignees("sess_1");

    assert.equal(out.ok, true);
    assert.equal(out.count, 2);
    assert.equal(out.items.length, 2);
    assert.match(calls[0], /\/api\/sessions\/sess_1\/assignees$/);
  } finally {
    globalThis.fetch = prevFetch;
  }
});

test("apiGetSessionAssignees: accepts plain array response", async () => {
  const prevFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () => jsonResponse([{ user_id: "u_1" }]);

    const out = await apiGetSessionAssignees("sess_1");

    assert.equal(out.ok, true);
    assert.equal(out.items.length, 1);
    assert.equal(out.items[0].user_id, "u_1");
  } finally {
    globalThis.fetch = prevFetch;
  }
});

test("apiReplaceSessionAssignees: PUTs idempotent user_ids list and returns normalized ids", async () => {
  const prevFetch = globalThis.fetch;
  const calls = [];
  try {
    globalThis.fetch = async (input, init) => {
      calls.push({ url: String(input || ""), init });
      return jsonResponse({ user_ids: ["u_2", "u_1"] });
    };

    const out = await apiReplaceSessionAssignees("sess_1", ["u_1", "u_2", ""]);

    assert.equal(out.ok, true);
    assert.deepEqual(out.user_ids, ["u_2", "u_1"]);
    assert.match(calls[0].url, /\/api\/sessions\/sess_1\/assignees$/);
    assert.equal(calls[0].init.method, "PUT");
    const body = JSON.parse(calls[0].init.body);
    assert.deepEqual(body.user_ids, ["u_1", "u_2"]);
  } finally {
    globalThis.fetch = prevFetch;
  }
});

test("apiReplaceSessionAssignees: clears assignees when empty list passed", async () => {
  const prevFetch = globalThis.fetch;
  const calls = [];
  try {
    globalThis.fetch = async (input, init) => {
      calls.push({ url: String(input || ""), init });
      return jsonResponse({ user_ids: [] });
    };

    const out = await apiReplaceSessionAssignees("sess_1", []);

    assert.equal(out.ok, true);
    assert.deepEqual(out.user_ids, []);
    const body = JSON.parse(calls[0].init.body);
    assert.deepEqual(body.user_ids, []);
  } finally {
    globalThis.fetch = prevFetch;
  }
});

test("apiGetSessionAssignees and apiReplaceSessionAssignees: reject missing session id", async () => {
  const getOut = await apiGetSessionAssignees("");
  assert.equal(getOut.ok, false);
  assert.match(getOut.error, /missing session_id/i);

  const putOut = await apiReplaceSessionAssignees("", ["u_1"]);
  assert.equal(putOut.ok, false);
  assert.match(putOut.error, /missing session_id/i);
});
