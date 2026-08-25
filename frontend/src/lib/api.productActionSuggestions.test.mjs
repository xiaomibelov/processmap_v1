import test from "node:test";
import assert from "node:assert/strict";

import {
  apiListProductActionSuggestions,
  apiUpdateProductActionSuggestion,
  apiApplyProductActionSuggestions,
  apiGetRagReadiness,
  apiTransitionRagReadiness,
} from "./api.js";

test("apiListProductActionSuggestions GETs suggestions with counts", async () => {
  const prevFetch = globalThis.fetch;
  try {
    globalThis.fetch = async (input) => {
      assert.match(String(input || ""), /\/api\/sessions\/sess_1\/analysis\/product-actions\/suggestions$/);
      return new Response(
        JSON.stringify({
          success: true,
          data: [{ id: "pa_1", status: "pending", action: { product_name: "Сэндвич" } }],
          meta: { counts: { pending: 1, approved: 0, rejected: 0, total: 1 } },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    };

    const out = await apiListProductActionSuggestions("sess_1");
    assert.equal(out.ok, true);
    assert.equal(out.suggestions.length, 1);
    assert.equal(out.counts.total, 1);
  } finally {
    globalThis.fetch = prevFetch;
  }
});

test("apiUpdateProductActionSuggestion POSTs payload and returns suggestion", async () => {
  const prevFetch = globalThis.fetch;
  try {
    globalThis.fetch = async (input, init) => {
      assert.match(String(input || ""), /\/api\/sessions\/sess_1\/analysis\/product-actions\/suggestions$/);
      const body = JSON.parse(String(init?.body || "{}"));
      assert.equal(body.status, "approved");
      return new Response(
        JSON.stringify({ success: true, data: { id: "pa_1", status: "approved" } }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    };

    const out = await apiUpdateProductActionSuggestion("sess_1", { id: "pa_1", status: "approved" });
    assert.equal(out.ok, true);
    assert.equal(out.suggestion.status, "approved");
  } finally {
    globalThis.fetch = prevFetch;
  }
});

test("apiApplyProductActionSuggestions POSTs base diagram state version", async () => {
  const prevFetch = globalThis.fetch;
  try {
    globalThis.fetch = async (input, init) => {
      assert.match(String(input || ""), /\/api\/sessions\/sess_1\/analysis\/product-actions\/suggestions\/apply$/);
      const body = JSON.parse(String(init?.body || "{}"));
      assert.equal(body.base_diagram_state_version, 7);
      return new Response(
        JSON.stringify({ success: true, data: { applied_count: 2, new_diagram_state_version: 8, rag_readiness_status: "ready" } }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    };

    const out = await apiApplyProductActionSuggestions("sess_1", 7);
    assert.equal(out.ok, true);
    assert.equal(out.result.applied_count, 2);
    assert.equal(out.result.rag_readiness_status, "ready");
  } finally {
    globalThis.fetch = prevFetch;
  }
});

test("apiGetRagReadiness GETs readiness status", async () => {
  const prevFetch = globalThis.fetch;
  try {
    globalThis.fetch = async (input) => {
      assert.match(String(input || ""), /\/api\/sessions\/sess_1\/rag-readiness$/);
      return new Response(
        JSON.stringify({ success: true, data: { rag_readiness_status: "ready", has_unindexed_changes: false } }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    };

    const out = await apiGetRagReadiness("sess_1");
    assert.equal(out.ok, true);
    assert.equal(out.readiness.rag_readiness_status, "ready");
  } finally {
    globalThis.fetch = prevFetch;
  }
});

test("apiTransitionRagReadiness PATCHes status", async () => {
  const prevFetch = globalThis.fetch;
  try {
    globalThis.fetch = async (input, init) => {
      assert.match(String(input || ""), /\/api\/sessions\/sess_1\/rag-readiness$/);
      assert.equal(init?.method, "PATCH");
      const body = JSON.parse(String(init?.body || "{}"));
      assert.equal(body.rag_readiness_status, "queued");
      return new Response(
        JSON.stringify({ success: true, data: { rag_readiness_status: "queued" } }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    };

    const out = await apiTransitionRagReadiness("sess_1", "queued");
    assert.equal(out.ok, true);
    assert.equal(out.readiness.rag_readiness_status, "queued");
  } finally {
    globalThis.fetch = prevFetch;
  }
});

test("apiApplyProductActionSuggestions sends null version when version is missing", async () => {
  const prevFetch = globalThis.fetch;
  try {
    globalThis.fetch = async (_input, init) => {
      const body = JSON.parse(String(init?.body || "{}"));
      assert.equal(body.base_diagram_state_version, null);
      return new Response(
        JSON.stringify({ success: true, data: { applied_count: 0, rag_readiness_status: "not_ready" } }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    };

    const out = await apiApplyProductActionSuggestions("sess_1", null);
    assert.equal(out.ok, true);
  } finally {
    globalThis.fetch = prevFetch;
  }
});
