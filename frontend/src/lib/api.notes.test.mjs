import test from "node:test";
import assert from "node:assert/strict";

import { apiPostNote, apiPreviewNotesExtraction, apiApplyNotesExtraction } from "./api.js";

test("apiPostNote: normalizes successful response notes without runtime ReferenceError", async () => {
  const prevFetch = globalThis.fetch;
  const calls = [];
  try {
    globalThis.fetch = async (input, init) => {
      calls.push({ url: String(input || ""), init });
      return new Response(
        JSON.stringify({
          id: "sess_1",
          notes: "Готово к выдаче",
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      );
    };

    const out = await apiPostNote("sess_1", { notes: "Готово к выдаче" });
    assert.equal(out.ok, true);
    assert.match(String(calls[0]?.url || ""), /\/api\/sessions\/sess_1\/notes$/);
    assert.equal(Array.isArray(out?.session?.notes), true);
    assert.equal(String(out?.session?.notes?.[0]?.text || ""), "Готово к выдаче");
  } finally {
    globalThis.fetch = prevFetch;
  }
});

test("apiPreviewNotesExtraction: posts to preview route and preserves draft payload", async () => {
  const prevFetch = globalThis.fetch;
  const calls = [];
  try {
    globalThis.fetch = async (input, init) => {
      calls.push({ url: String(input || ""), init });
      return new Response(
        JSON.stringify({
          ok: true,
          module_id: "ai.process.extract_from_notes",
          source: "fallback",
          input_hash: "hash_1",
          candidate_roles: ["actor_1"],
          candidate_nodes: [{ id: "n1", title: "Task" }],
          warnings: [{ code: "deepseek_failed", message: "Fallback parser used" }],
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      );
    };

    const out = await apiPreviewNotesExtraction("sess_1", {
      notes: "actor_1: Task",
      base_diagram_state_version: 7,
      options: { ui_source: "notes_panel" },
    });

    assert.equal(out.ok, true);
    assert.match(String(calls[0]?.url || ""), /\/api\/sessions\/sess_1\/notes\/extraction-preview$/);
    assert.equal(JSON.parse(String(calls[0]?.init?.body || "{}")).notes, "actor_1: Task");
    assert.equal(out.preview.module_id, "ai.process.extract_from_notes");
    assert.equal(out.preview.source, "fallback");
    assert.equal(out.preview.input_hash, "hash_1");
  } finally {
    globalThis.fetch = prevFetch;
  }
});

test("apiApplyNotesExtraction: posts selected candidates to apply route and returns session", async () => {
  const prevFetch = globalThis.fetch;
  const calls = [];
  try {
    globalThis.fetch = async (input, init) => {
      calls.push({ url: String(input || ""), init });
      return new Response(
        JSON.stringify({
          ok: true,
          status: "applied",
          module_id: "ai.process.extract_from_notes",
          changed_keys: ["nodes", "edges"],
          diagram_state_version: 8,
          session: { id: "sess_1", diagram_state_version: 8, nodes: [{ id: "n1", title: "Task" }] },
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      );
    };

    const out = await apiApplyNotesExtraction("sess_1", {
      base_diagram_state_version: 7,
      input_hash: "hash_1",
      nodes: [{ id: "n1", title: "Task" }],
      edges: [],
      apply_notes: false,
      apply_roles: false,
      apply_nodes_edges: true,
      apply_questions: false,
    });

    const body = JSON.parse(String(calls[0]?.init?.body || "{}"));
    assert.equal(out.ok, true);
    assert.match(String(calls[0]?.url || ""), /\/api\/sessions\/sess_1\/notes\/extraction-apply$/);
    assert.equal(body.base_diagram_state_version, 7);
    assert.equal(body.apply_nodes_edges, true);
    assert.equal(body.input_hash, "hash_1");
    assert.deepEqual(out.changed_keys, ["nodes", "edges"]);
    assert.equal(out.session.id, "sess_1");
    assert.equal(out.diagram_state_version, 8);
  } finally {
    globalThis.fetch = prevFetch;
  }
});
