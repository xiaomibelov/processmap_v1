import test from "node:test";
import assert from "node:assert/strict";

import { apiGetBpmnVersion, apiGetBpmnVersions, apiPutBpmnXml, apiRestoreBpmnVersion } from "./api.js";

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

test("apiPutBpmnXml sends base_diagram_state_version and returns diagramStateVersion from backend ack", async () => {
  const prevFetch = globalThis.fetch;
  const calls = [];
  try {
    globalThis.fetch = async (input, init) => {
      calls.push({ url: String(input || ""), init });
      return new Response(JSON.stringify({
        ok: true,
        version: 5,
        diagram_state_version: 9,
      }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    };

    const out = await apiPutBpmnXml("sess_1", "<bpmn:definitions/>", {
      rev: 5,
      baseDiagramStateVersion: 8,
      reason: "manual_save",
    });

    assert.equal(out.ok, true);
    assert.equal(out.diagramStateVersion, 9);
    const body = JSON.parse(String(calls[0]?.init?.body || "{}"));
    assert.equal(body.base_diagram_state_version, 8);
  } finally {
    globalThis.fetch = prevFetch;
  }
});

test("apiPutBpmnXml normalizes publish/manual save reason prefixes into canonical source_action", async () => {
  const prevFetch = globalThis.fetch;
  const calls = [];
  try {
    globalThis.fetch = async (input, init) => {
      calls.push({ url: String(input || ""), init });
      return new Response(JSON.stringify({ ok: true, version: 9 }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    };

    const publishOut = await apiPutBpmnXml("sess_1", "<bpmn:definitions/>", {
      rev: 9,
      reason: "publish_manual_save:camunda_finalize",
    });
    const manualOut = await apiPutBpmnXml("sess_1", "<bpmn:definitions/>", {
      rev: 10,
      reason: "manual_save:camunda_finalize",
    });
    const publishQueuedOut = await apiPutBpmnXml("sess_1", "<bpmn:definitions/>", {
      rev: 11,
      reason: "publish_manual_save:queued",
    });
    const manualQueuedOut = await apiPutBpmnXml("sess_1", "<bpmn:definitions/>", {
      rev: 12,
      reason: "manual_save:queued",
    });
    const publishConflictReplayOut = await apiPutBpmnXml("sess_1", "<bpmn:definitions/>", {
      rev: 13,
      reason: "publish_manual_save:conflict_replay",
    });
    const manualConflictReplayOut = await apiPutBpmnXml("sess_1", "<bpmn:definitions/>", {
      rev: 14,
      reason: "manual_save:conflict_replay",
    });

    assert.equal(publishOut.ok, true);
    assert.equal(manualOut.ok, true);
    assert.equal(publishQueuedOut.ok, true);
    assert.equal(manualQueuedOut.ok, true);
    assert.equal(publishConflictReplayOut.ok, true);
    assert.equal(manualConflictReplayOut.ok, true);
    const publishBody = JSON.parse(String(calls[0]?.init?.body || "{}"));
    const manualBody = JSON.parse(String(calls[1]?.init?.body || "{}"));
    const publishQueuedBody = JSON.parse(String(calls[2]?.init?.body || "{}"));
    const manualQueuedBody = JSON.parse(String(calls[3]?.init?.body || "{}"));
    const publishConflictReplayBody = JSON.parse(String(calls[4]?.init?.body || "{}"));
    const manualConflictReplayBody = JSON.parse(String(calls[5]?.init?.body || "{}"));
    assert.equal(publishBody.source_action, "publish_manual_save");
    assert.equal(manualBody.source_action, "manual_save");
    assert.equal(publishQueuedBody.source_action, "publish_manual_save");
    assert.equal(manualQueuedBody.source_action, "manual_save");
    assert.equal(publishConflictReplayBody.source_action, "publish_manual_save");
    assert.equal(manualConflictReplayBody.source_action, "manual_save");
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

test("apiGetBpmnVersions defaults to headers-only list without include_xml", async () => {
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
          { id: "v1", version_number: 4, source_action: "import_bpmn" },
        ],
      }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    };

    const out = await apiGetBpmnVersions("sess_1", { limit: 50 });
    assert.equal(out.ok, true);
    assert.equal(out.versions[0]?.bpmn_xml, undefined);
    assert.equal(calls[0], "/api/sessions/sess_1/bpmn/versions?limit=50");
  } finally {
    globalThis.fetch = prevFetch;
  }
});

test("apiGetBpmnVersion lazily reads one version with xml payload", async () => {
  const prevFetch = globalThis.fetch;
  const calls = [];
  try {
    globalThis.fetch = async (input) => {
      calls.push(String(input || ""));
      return new Response(JSON.stringify({
        ok: true,
        session_id: "sess_1",
        item: { id: "ver_2", version_number: 2, bpmn_xml: "<xml/>" },
      }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    };

    const out = await apiGetBpmnVersion("sess_1", "ver_2");
    assert.equal(out.ok, true);
    assert.equal(out.item?.id, "ver_2");
    assert.equal(out.item?.bpmn_xml, "<xml/>");
    assert.equal(calls[0], "/api/sessions/sess_1/bpmn/versions/ver_2");
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
