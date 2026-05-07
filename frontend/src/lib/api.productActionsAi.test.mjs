import test from "node:test";
import assert from "node:assert/strict";

import { apiSuggestProductActions } from "./api.js";

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
