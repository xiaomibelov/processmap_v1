import test from "node:test";
import assert from "node:assert/strict";

import { apiPutBpmnXml } from "./api.js";

test("apiPutBpmnXml sends source_action import_bpmn for explicit import reason", async () => {
  const prevFetch = globalThis.fetch;
  const calls = [];
  try {
    globalThis.fetch = async (input, init) => {
      calls.push({ url: String(input || ""), init });
      return new Response(JSON.stringify({ ok: true, version: 7 }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    };

    const out = await apiPutBpmnXml("sess_1", "<bpmn:definitions/>", {
      rev: 7,
      reason: "import_bpmn",
      importNote: "from file",
    });

    assert.equal(out.ok, true);
    assert.match(calls[0]?.url || "", /\/api\/sessions\/sess_1\/bpmn$/);
    const body = JSON.parse(String(calls[0]?.init?.body || "{}"));
    assert.equal(body.source_action, "import_bpmn");
    assert.equal(body.import_note, "from file");
    assert.equal(body.rev, 7);
  } finally {
    globalThis.fetch = prevFetch;
  }
});

test("apiPutBpmnXml does not send source_action for regular save reasons", async () => {
  const prevFetch = globalThis.fetch;
  const calls = [];
  try {
    globalThis.fetch = async (input, init) => {
      calls.push({ url: String(input || ""), init });
      return new Response(JSON.stringify({ ok: true, version: 3 }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    };

    const out = await apiPutBpmnXml("sess_1", "<bpmn:definitions/>", {
      rev: 3,
      reason: "manual_save",
    });

    assert.equal(out.ok, true);
    const body = JSON.parse(String(calls[0]?.init?.body || "{}"));
    assert.equal("source_action" in body, false);
    assert.equal("import_note" in body, false);
    assert.equal(body.rev, 3);
  } finally {
    globalThis.fetch = prevFetch;
  }
});
