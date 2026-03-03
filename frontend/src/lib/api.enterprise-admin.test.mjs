import test from "node:test";
import assert from "node:assert/strict";

import {
  apiCreateOrgInvite,
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

test("apiCreateOrgInvite: posts payload", async () => {
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
    const out = await apiCreateOrgInvite("org_1", { email: "user@local", role: "viewer", ttl_days: 5 });
    assert.equal(out.ok, true);
    assert.equal(String(out.invite?.id || ""), "inv_1");
    assert.equal(String(out.invite_token || ""), "tok");
    assert.match(calls[0].url, /\/api\/orgs\/org_1\/invites$/);
    assert.equal(String(calls[0].init?.method || ""), "POST");
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
