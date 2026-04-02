import test from "node:test";
import assert from "node:assert/strict";

import {
  apiAcceptInviteToken,
  apiCreateOrgInvite,
  apiListOrgInvites,
  apiListOrgAudit,
  apiListOrgMembers,
  apiRevokeOrgInvite,
} from "./api.js";

test("apiListOrgMembers: calls enterprise members endpoint", async () => {
  const prevFetch = globalThis.fetch;
  const calls = [];
  try {
    globalThis.fetch = async (input) => {
      calls.push(String(input || ""));
      return new Response(JSON.stringify({ items: [{ user_id: "u1", role: "editor" }], count: 1 }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    };
    const out = await apiListOrgMembers("org_1");
    assert.equal(out.ok, true);
    assert.equal(out.count, 1);
    assert.match(calls[0], /\/api\/orgs\/org_1\/members$/);
  } finally {
    globalThis.fetch = prevFetch;
  }
});

test("apiCreateOrgInvite: posts payload with regenerate flag", async () => {
  const prevFetch = globalThis.fetch;
  const calls = [];
  try {
    globalThis.fetch = async (input, init) => {
      calls.push({ url: String(input || ""), init });
      return new Response(JSON.stringify({ invite: { id: "inv_1", email: "user@local", role: "viewer" }, invite_token: "tok" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    };
    const out = await apiCreateOrgInvite("org_1", { email: "user@local", role: "viewer", ttl_days: 5, regenerate: true });
    assert.equal(out.ok, true);
    assert.equal(String(out.invite?.id || ""), "inv_1");
    assert.equal(String(out.invite_token || ""), "tok");
    assert.match(calls[0].url, /\/api\/orgs\/org_1\/invites$/);
    assert.equal(String(calls[0].init?.method || ""), "POST");
    const body = JSON.parse(String(calls[0].init?.body || "{}"));
    assert.equal(body.regenerate, true);
  } finally {
    globalThis.fetch = prevFetch;
  }
});

test("apiListOrgInvites: returns current_invite from backend truth", async () => {
  const prevFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () => new Response(
      JSON.stringify({
        items: [{ id: "inv_1", email: "user@local", status: "pending" }],
        count: 1,
        current_invite: { id: "inv_1", invite_key: "tok_1", invite_link: "https://pm.local/accept-invite?token=tok_1" },
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
    const out = await apiListOrgInvites("org_1");
    assert.equal(out.ok, true);
    assert.equal(out.count, 1);
    assert.equal(String(out.current_invite?.id || ""), "inv_1");
    assert.equal(String(out.current_invite?.invite_key || ""), "tok_1");
  } finally {
    globalThis.fetch = prevFetch;
  }
});

test("apiListOrgAudit: builds query params", async () => {
  const prevFetch = globalThis.fetch;
  const calls = [];
  try {
    globalThis.fetch = async (input) => {
      calls.push(String(input || ""));
      return new Response(JSON.stringify({ items: [{ id: "aud_1", action: "report.delete" }], count: 1 }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    };
    const out = await apiListOrgAudit("org_1", { action: "report.delete", status: "ok", limit: 50 });
    assert.equal(out.ok, true);
    assert.equal(out.count, 1);
    assert.match(calls[0], /\/api\/orgs\/org_1\/audit\?/);
    assert.match(calls[0], /action=report.delete/);
    assert.match(calls[0], /status=ok/);
    assert.match(calls[0], /limit=50/);
  } finally {
    globalThis.fetch = prevFetch;
  }
});

test("apiRevokeOrgInvite: calls revoke endpoint", async () => {
  const prevFetch = globalThis.fetch;
  const calls = [];
  try {
    globalThis.fetch = async (input, init) => {
      calls.push({ url: String(input || ""), init });
      return new Response(null, { status: 204 });
    };
    const out = await apiRevokeOrgInvite("org_1", "inv_1");
    assert.equal(out.ok, true);
    assert.equal(out.status, 204);
    assert.match(calls[0].url, /\/api\/orgs\/org_1\/invites\/inv_1\/revoke$/);
    assert.equal(String(calls[0].init?.method || ""), "POST");
  } finally {
    globalThis.fetch = prevFetch;
  }
});

test("apiAcceptInviteToken: posts token to generic endpoint", async () => {
  const prevFetch = globalThis.fetch;
  const calls = [];
  try {
    globalThis.fetch = async (input, init) => {
      calls.push({ url: String(input || ""), init });
      return new Response(JSON.stringify({ invite: { id: "inv_1", org_id: "org_1" }, membership: { org_id: "org_1", user_id: "u_1", role: "viewer" } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    };
    const out = await apiAcceptInviteToken("tok_123");
    assert.equal(out.ok, true);
    assert.equal(String(out.membership?.org_id || ""), "org_1");
    assert.match(calls[0].url, /\/api\/invites\/accept$/);
    assert.equal(String(calls[0].init?.method || ""), "POST");
  } finally {
    globalThis.fetch = prevFetch;
  }
});
