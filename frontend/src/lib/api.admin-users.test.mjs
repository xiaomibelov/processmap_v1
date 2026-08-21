import test from "node:test";
import assert from "node:assert/strict";

import { apiAdminCreateUser, apiAdminListUsers, apiAdminPatchUser } from "./api.js";

test("apiAdminListUsers exposes profile fields from backend payload", async () => {
  const prevFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () => new Response(JSON.stringify({
      items: [
        {
          id: "u1",
          email: "user@local",
          full_name: "User Name",
          job_title: "Technologist",
        },
      ],
      count: 1,
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });

    const out = await apiAdminListUsers();

    assert.equal(out.ok, true);
    assert.equal(out.data.items[0].full_name, "User Name");
    assert.equal(out.data.items[0].job_title, "Technologist");
  } finally {
    globalThis.fetch = prevFetch;
  }
});

test("apiAdminCreateUser posts profile fields when provided", async () => {
  const prevFetch = globalThis.fetch;
  const calls = [];
  try {
    globalThis.fetch = async (input, init) => {
      calls.push({ url: String(input || ""), init });
      return new Response(JSON.stringify({ item: { id: "u1", email: "user@local" } }), {
        status: 201,
        headers: { "Content-Type": "application/json" },
      });
    };

    const out = await apiAdminCreateUser({
      email: "user@local",
      password: "strongpass1",
      full_name: "User Name",
      job_title: "Technologist",
    });

    assert.equal(out.ok, true);
    assert.match(calls[0].url, /\/api\/admin\/users$/);
    const body = JSON.parse(String(calls[0].init?.body || "{}"));
    assert.equal(body.full_name, "User Name");
    assert.equal(body.job_title, "Technologist");
  } finally {
    globalThis.fetch = prevFetch;
  }
});

test("apiAdminPatchUser accepts camelCase profile fields", async () => {
  const prevFetch = globalThis.fetch;
  const calls = [];
  try {
    globalThis.fetch = async (input, init) => {
      calls.push({ url: String(input || ""), init });
      return new Response(JSON.stringify({ item: { id: "u1", email: "user@local" } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    };

    const out = await apiAdminPatchUser("u1", {
      fullName: "Updated User",
      jobTitle: "Lead",
    });

    assert.equal(out.ok, true);
    assert.match(calls[0].url, /\/api\/admin\/users\/u1$/);
    const body = JSON.parse(String(calls[0].init?.body || "{}"));
    assert.equal(body.full_name, "Updated User");
    assert.equal(body.job_title, "Lead");
  } finally {
    globalThis.fetch = prevFetch;
  }
});
