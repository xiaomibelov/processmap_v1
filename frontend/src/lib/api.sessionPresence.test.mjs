import test from "node:test";
import assert from "node:assert/strict";

import { apiTouchSessionPresence } from "./api.js";

test("apiTouchSessionPresence posts client id and normalizes active users", async () => {
  const prevFetch = globalThis.fetch;
  const calls = [];
  try {
    globalThis.fetch = async (input, init) => {
      calls.push({ url: String(input || ""), init });
      return new Response(JSON.stringify({
        ok: true,
        session_id: "sess_1",
        ttl_seconds: 180,
        active_users: [
          { user_id: "user_a", display_name: "Иван", last_seen_at: 123 },
        ],
      }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    };

    const out = await apiTouchSessionPresence("sess_1", {
      clientId: "tab_1",
      surface: "process_stage",
    });

    assert.equal(out.ok, true);
    assert.equal(calls[0]?.url, "/api/sessions/sess_1/presence");
    assert.equal(calls[0]?.init?.method, "POST");
    const body = JSON.parse(String(calls[0]?.init?.body || "{}"));
    assert.deepEqual(body, { client_id: "tab_1", surface: "process_stage" });
    assert.equal(out.ttl_seconds, 180);
    assert.equal(out.active_users[0]?.display_name, "Иван");
    assert.equal(out.activeUsers, out.active_users);
  } finally {
    globalThis.fetch = prevFetch;
  }
});

test("apiTouchSessionPresence rejects missing session or client id locally", async () => {
  assert.equal((await apiTouchSessionPresence("", { clientId: "tab" })).error, "missing session_id");
  assert.equal((await apiTouchSessionPresence("sess", {})).error, "missing client_id");
});
