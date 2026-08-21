import test from "node:test";
import assert from "node:assert/strict";

import { setActiveOrgId } from "./apiCore.js";
import { apiAgentStream, apiAgentResume } from "./api.js";

function makeStreamResponse() {
  return new Response(
    new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode("event: done\ndata: {}\n\n"));
        controller.close();
      },
    }),
    { status: 200, headers: { "Content-Type": "text/event-stream" } },
  );
}

test("apiAgentStream sends X-Org-Id header", async () => {
  setActiveOrgId("org_agent_test");
  const prevFetch = globalThis.fetch;
  const calls = [];
  try {
    globalThis.fetch = async (input, init) => {
      calls.push({ url: String(input || ""), init });
      return makeStreamResponse();
    };
    const out = await apiAgentStream("sess_1", { message: "hello" });
    assert.equal(out.ok, true);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].init.headers.get("X-Org-Id"), "org_agent_test");
  } finally {
    globalThis.fetch = prevFetch;
    setActiveOrgId("");
  }
});

test("apiAgentResume sends X-Org-Id header", async () => {
  setActiveOrgId("org_agent_test");
  const prevFetch = globalThis.fetch;
  const calls = [];
  try {
    globalThis.fetch = async (input, init) => {
      calls.push({ url: String(input || ""), init });
      return makeStreamResponse();
    };
    const out = await apiAgentResume("sess_1", { pending_edit_id: "pe_1", decision: "confirm" });
    assert.equal(out.ok, true);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].init.headers.get("X-Org-Id"), "org_agent_test");
  } finally {
    globalThis.fetch = prevFetch;
    setActiveOrgId("");
  }
});
