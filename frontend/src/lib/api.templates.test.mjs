import test from "node:test";
import assert from "node:assert/strict";

import {
  apiCreateTemplate,
  apiDeleteTemplate,
  apiListTemplates,
  apiPatchTemplate,
} from "./api.js";

test("apiListTemplates: builds query and returns items", async () => {
  const prevFetch = globalThis.fetch;
  const calls = [];
  try {
    globalThis.fetch = async (input) => {
      calls.push(String(input || ""));
      return new Response(JSON.stringify({
        items: [{ id: "tpl_1", name: "T1", scope: "personal" }],
        page: { limit: 50, offset: 0, total: 1 },
      }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    };
    const out = await apiListTemplates({ scope: "personal", q: "T1", limit: 50, offset: 0 });
    assert.equal(out.ok, true);
    assert.equal(out.items.length, 1);
    assert.match(calls[0], /\/api\/templates\?/);
    assert.match(calls[0], /scope=personal/);
    assert.match(calls[0], /q=T1/);
  } finally {
    globalThis.fetch = prevFetch;
  }
});

test("apiCreateTemplate: posts payload", async () => {
  const prevFetch = globalThis.fetch;
  const calls = [];
  try {
    globalThis.fetch = async (input, init) => {
      calls.push({ url: String(input || ""), init });
      return new Response(JSON.stringify({ id: "tpl_1", name: "Selection" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    };
    const out = await apiCreateTemplate({
      scope: "personal",
      name: "Selection",
      payload: { bpmn_element_ids: ["Task_1"] },
    });
    assert.equal(out.ok, true);
    assert.equal(String(out.template?.id || ""), "tpl_1");
    assert.equal(String(calls[0].init?.method || ""), "POST");
    assert.match(calls[0].url, /\/api\/templates$/);
  } finally {
    globalThis.fetch = prevFetch;
  }
});

test("apiPatchTemplate/apiDeleteTemplate: calls by id", async () => {
  const prevFetch = globalThis.fetch;
  const calls = [];
  try {
    globalThis.fetch = async (input, init) => {
      calls.push({ url: String(input || ""), init });
      if (String(init?.method || "") === "PATCH") {
        return new Response(JSON.stringify({ id: "tpl_1", name: "Updated" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      return new Response(null, { status: 204 });
    };
    const patched = await apiPatchTemplate("tpl_1", { name: "Updated" });
    assert.equal(patched.ok, true);
    assert.equal(String(patched.template?.name || ""), "Updated");

    const deleted = await apiDeleteTemplate("tpl_1");
    assert.equal(deleted.ok, true);
    assert.equal(deleted.status, 204);

    assert.match(calls[0].url, /\/api\/templates\/tpl_1$/);
    assert.equal(String(calls[0].init?.method || ""), "PATCH");
    assert.match(calls[1].url, /\/api\/templates\/tpl_1$/);
    assert.equal(String(calls[1].init?.method || ""), "DELETE");
  } finally {
    globalThis.fetch = prevFetch;
  }
});

