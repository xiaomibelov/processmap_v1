import test from "node:test";
import assert from "node:assert/strict";

import {
  apiExportProductActionRegistryCsv,
  apiExportProductActionRegistryXlsx,
  apiQueryProductActionRegistry,
} from "./api.js";

test("apiQueryProductActionRegistry preserves backend view-model fields", async () => {
  const prevFetch = globalThis.fetch;
  const calls = [];
  try {
    globalThis.fetch = async (input, init) => {
      calls.push({ url: String(input || ""), init });
      return new Response(
        JSON.stringify({
          ok: true,
          scope: "project",
          rows: [{ registry_id: "s1::a1", product_name: "Карта" }],
          sessions: [{ session_id: "s1", actions_total: 1 }],
          session_summary: { sessions_total: 1 },
          summary: { rows: 1, complete: 1, incomplete: 0 },
          page: { limit: 25, offset: 0, total: 1, has_more: false },
          filter_options: { products: ["Карта"], completeness: ["all", "complete", "incomplete"] },
          applied_filters: { products: ["Карта"], completeness: "complete" },
          metrics: { total_rows: 3, filtered_rows: 1, page_rows: 1, complete: 1, incomplete: 0 },
          empty_state: { kind: "not_empty", scope: "project", message_key: "registry.empty.not_empty" },
          source_state: { namespace: "/api/analysis/product-actions/registry", mutation_allowed: false },
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      );
    };

    const out = await apiQueryProductActionRegistry({
      scope: "project",
      project_id: "p1",
      filters: { products: ["Карта"], completeness: "complete" },
      limit: 25,
      offset: 0,
    });

    assert.equal(out.ok, true);
    assert.match(String(calls[0]?.url || ""), /\/api\/analysis\/product-actions\/registry\/query$/);
    assert.equal(JSON.parse(String(calls[0]?.init?.body || "{}")).project_id, "p1");
    assert.deepEqual(out.filter_options.products, ["Карта"]);
    assert.deepEqual(out.applied_filters.products, ["Карта"]);
    assert.equal(out.metrics.total_rows, 3);
    assert.equal(out.empty_state.kind, "not_empty");
    assert.equal(out.source_state.mutation_allowed, false);
  } finally {
    globalThis.fetch = prevFetch;
  }
});

test("apiQueryProductActionRegistry keeps older response shape compatible", async () => {
  const prevFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () => new Response(
      JSON.stringify({
        ok: true,
        scope: "session",
        rows: [],
        sessions: [],
        session_summary: {},
        summary: { rows: 0 },
        page: { limit: 25, offset: 0, total: 0 },
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      },
    );

    const out = await apiQueryProductActionRegistry({ scope: "session", session_id: "s1" });
    assert.equal(out.ok, true);
    assert.deepEqual(out.rows, []);
    assert.equal(out.filter_options, null);
    assert.equal(out.applied_filters, null);
    assert.equal(out.metrics, null);
    assert.equal(out.empty_state, null);
    assert.equal(out.source_state, null);
  } finally {
    globalThis.fetch = prevFetch;
  }
});

test("product action registry export helpers keep canonical namespace", async () => {
  const prevFetch = globalThis.fetch;
  const calls = [];
  try {
    globalThis.fetch = async (input, init) => {
      calls.push({ url: String(input || ""), init });
      return new Response("id\n1\n", {
        status: 200,
        headers: {
          "Content-Type": "text/csv",
          "Content-Disposition": "attachment; filename=\"registry.csv\"",
        },
      });
    };

    await apiExportProductActionRegistryCsv({ scope: "workspace" });
    await apiExportProductActionRegistryXlsx({ scope: "workspace" });
    assert.match(String(calls[0]?.url || ""), /\/api\/analysis\/product-actions\/registry\/export\.csv$/);
    assert.match(String(calls[1]?.url || ""), /\/api\/analysis\/product-actions\/registry\/export\.xlsx$/);
    assert.doesNotMatch(String(calls[0]?.url || ""), /\/api\/analytics\//);
    assert.doesNotMatch(String(calls[1]?.url || ""), /\/api\/analytics\//);
  } finally {
    globalThis.fetch = prevFetch;
  }
});
