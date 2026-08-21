import test from "node:test";
import assert from "node:assert/strict";

import { apiBatchSuggestProductActions, apiBulkSuggestProductActions, apiSuggestProductActions } from "./api.js";

test("apiSuggestProductActions posts to product actions AI suggestion route", async () => {
  const prevFetch = globalThis.fetch;
  const calls = [];
  try {
    globalThis.fetch = async (input, init) => {
      calls.push({ url: String(input || ""), init });
      return new Response(
        JSON.stringify({
          ok: true,
          module_id: "ai.product_actions.suggest",
          draft_id: "draft_1",
          suggestions: [{ id: "ai_1", product_name: "Сэндвич" }],
          warnings: [],
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      );
    };

    const out = await apiSuggestProductActions("sess_1", { options: { max_suggestions: 5 } });
    assert.equal(out.ok, true);
    assert.match(String(calls[0]?.url || ""), /\/api\/sessions\/sess_1\/analysis\/product-actions\/suggest$/);
    assert.equal(JSON.parse(String(calls[0]?.init?.body || "{}")).options.max_suggestions, 5);
    assert.equal(out.draft.module_id, "ai.product_actions.suggest");
    assert.equal(out.suggestions.length, 1);
  } finally {
    globalThis.fetch = prevFetch;
  }
});

test("apiSuggestProductActions preserves controlled error payload", async () => {
  const prevFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () => new Response(
      JSON.stringify({
        ok: false,
        error: "AI_PROVIDER_ERROR",
        message: "provider unavailable",
        module_id: "ai.product_actions.suggest",
        input_hash: "sha256:test",
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      },
    );

    const out = await apiSuggestProductActions("sess_1", {});
    assert.equal(out.ok, false);
    assert.equal(out.error, "AI_PROVIDER_ERROR");
    assert.equal(out.draft.message, "provider unavailable");
    assert.equal(out.draft.input_hash, "sha256:test");
  } finally {
    globalThis.fetch = prevFetch;
  }
});

test("apiBulkSuggestProductActions posts bounded session ids to registry bulk route", async () => {
  const prevFetch = globalThis.fetch;
  const calls = [];
  try {
    globalThis.fetch = async (input, init) => {
      calls.push({ url: String(input || ""), init });
      return new Response(
        JSON.stringify({
          ok: true,
          module_id: "ai.product_actions.suggest",
          cap: 10,
          results: [{ session_id: "sess_1", ok: true, suggestions: [{ id: "ai_1" }] }],
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      );
    };

    const out = await apiBulkSuggestProductActions({
      session_ids: ["sess_1", "sess_2"],
      options: { max_suggestions: 20 },
    });
    assert.equal(out.ok, true);
    assert.match(String(calls[0]?.url || ""), /\/api\/analysis\/product-actions\/suggest-bulk$/);
    const body = JSON.parse(String(calls[0]?.init?.body || "{}"));
    assert.deepEqual(body.session_ids, ["sess_1", "sess_2"]);
    assert.equal(body.options.max_suggestions, 20);
    assert.equal(out.results.length, 1);
  } finally {
    globalThis.fetch = prevFetch;
  }
});

test("apiBatchSuggestProductActions posts one backend-owned batch request", async () => {
  const prevFetch = globalThis.fetch;
  const calls = [];
  try {
    globalThis.fetch = async (input, init) => {
      calls.push({ url: String(input || ""), init });
      return new Response(
        JSON.stringify({
          ok: true,
          batch_id: "batch_1",
          status: "completed",
          summary: { total: 2, candidates: 1, processed: 1, ready: 1, skipped_existing_action: 1 },
          items: [{ step_id: "step_2", status: "ready", suggestions: [{ id: "ai_1" }] }],
          draft: { step_2: { status: "ready", rows: [{ id: "ai_1" }], selectedIds: ["ai_1"] } },
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      );
    };

    const out = await apiBatchSuggestProductActions("sess_1", {
      scope: "without_actions",
      options: { max_steps_per_chunk: 10, skip_existing_drafts: true },
    });
    assert.equal(out.ok, true);
    assert.match(String(calls[0]?.url || ""), /\/api\/sessions\/sess_1\/analysis\/product-actions\/batch-suggest$/);
    const body = JSON.parse(String(calls[0]?.init?.body || "{}"));
    assert.equal(body.scope, "without_actions");
    assert.equal(body.options.max_steps_per_chunk, 10);
    assert.equal(body.options.skip_existing_drafts, true);
    assert.equal(out.batch_id, "batch_1");
    assert.equal(out.batch_status, "completed");
    assert.equal(out.summary.ready, 1);
    assert.equal(out.draft.step_2.rows.length, 1);
  } finally {
    globalThis.fetch = prevFetch;
  }
});
