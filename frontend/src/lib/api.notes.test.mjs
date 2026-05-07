import test from "node:test";
import assert from "node:assert/strict";

import { apiPostNote, apiPreviewNotesExtraction } from "./api.js";

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
