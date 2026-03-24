import test from "node:test";
import assert from "node:assert/strict";
import { apiHeartbeatSessionPresence } from "./api.js";

test("apiHeartbeatSessionPresence: validates session id", async () => {
  const out = await apiHeartbeatSessionPresence("");
  assert.equal(out.ok, false);
  assert.equal(out.error, "missing session_id");
});

test("apiHeartbeatSessionPresence: posts to canonical endpoint and normalizes payload", async () => {
  const prevFetch = globalThis.fetch;
  const calls = [];
  try {
    globalThis.fetch = async (input, init) => {
      calls.push({ url: String(input || ""), method: String(init?.method || "GET").toUpperCase() });
      return new Response(JSON.stringify({
        session_id: "sess_1",
        org_id: "org_1",
        active_users_count: 3,
        other_active_users_count: 2,
        current_user_present: true,
        ttl_sec: 75,
        expires_at: 1774229999,
      }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    };
    const out = await apiHeartbeatSessionPresence("sess_1");
    assert.equal(out.ok, true);
    assert.equal(out.presence.other_active_users_count, 2);
    assert.equal(out.presence.active_users_count, 3);
    assert.equal(calls.length, 1);
    assert.match(calls[0].url, /\/api\/sessions\/sess_1\/presence$/);
    assert.equal(calls[0].method, "POST");
  } finally {
    globalThis.fetch = prevFetch;
  }
});

