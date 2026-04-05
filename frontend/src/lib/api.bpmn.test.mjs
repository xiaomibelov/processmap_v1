import test from "node:test";
import assert from "node:assert/strict";

import { apiGetBpmnVersions, apiPutBpmnXml, apiRestoreBpmnVersion } from "./api.js";

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

test("apiPutBpmnXml does not send source_action for generic save reasons outside snapshot whitelist", async () => {
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
      reason: "save",
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

test("apiPutBpmnXml exposes backend bpmn version snapshot as canonical publish truth", async () => {
  const prevFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () => new Response(JSON.stringify({
      ok: true,
      version: 8,
      bpmn_version_snapshot: {
        id: "ver_8",
        version_number: 8,
        source_action: "publish_manual_save",
      },
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });

    const out = await apiPutBpmnXml("sess_1", "<bpmn:definitions/>", {
      rev: 8,
      reason: "publish_manual_save",
    });

    assert.equal(out.ok, true);
    assert.equal(out.bpmnVersionSnapshot?.id, "ver_8");
    assert.equal(out.bpmnVersionSnapshot?.version_number, 8);
    assert.equal(out.bpmnVersionSnapshot?.source_action, "publish_manual_save");
  } finally {
    globalThis.fetch = prevFetch;
  }
});

test("apiGetBpmnVersions reads backend list and include_xml query", async () => {
  const prevFetch = globalThis.fetch;
  const calls = [];
  try {
    globalThis.fetch = async (input) => {
      calls.push(String(input || ""));
      return new Response(JSON.stringify({
        ok: true,
        session_id: "sess_1",
        count: 1,
        items: [
          { id: "v1", version_number: 4, source_action: "import_bpmn", bpmn_xml: "<xml/>" },
        ],
      }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    };

    const out = await apiGetBpmnVersions("sess_1", { includeXml: true, limit: 20 });
    assert.equal(out.ok, true);
    assert.equal(out.count, 1);
    assert.equal(out.versions[0]?.id, "v1");
    assert.match(calls[0], /\/api\/sessions\/sess_1\/bpmn\/versions\?limit=20&include_xml=1$/);
  } finally {
    globalThis.fetch = prevFetch;
  }
});

test("apiRestoreBpmnVersion posts restore and returns xml payload", async () => {
  const prevFetch = globalThis.fetch;
  const calls = [];
  try {
    globalThis.fetch = async (input, init) => {
      calls.push({ url: String(input || ""), init });
      return new Response(JSON.stringify({
        ok: true,
        session_id: "sess_1",
        bpmn_xml: "<bpmn:definitions id=\"R\"/>",
        restored_version: { id: "ver_2", version_number: 2 },
      }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    };

    const out = await apiRestoreBpmnVersion("sess_1", "ver_2");
    assert.equal(out.ok, true);
    assert.equal(out.bpmn_xml, "<bpmn:definitions id=\"R\"/>");
    assert.equal(out.restored_version?.id, "ver_2");
    assert.match(calls[0]?.url || "", /\/api\/sessions\/sess_1\/bpmn\/restore\/ver_2$/);
    assert.equal(String(calls[0]?.init?.method || "GET").toUpperCase(), "POST");
  } finally {
    globalThis.fetch = prevFetch;
  }
});
