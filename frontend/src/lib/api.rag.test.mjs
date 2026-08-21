import test from "node:test";
import assert from "node:assert/strict";

import { apiRagSearch, apiRagIndex, apiRagIndexProductActions } from "./api.js";

// -------- apiRagSearch --------

test("apiRagSearch returns error when q is empty", async () => {
  const r = await apiRagSearch({ q: "" });
  assert.equal(r.ok, false);
  assert.equal(r.error, "missing q");
});

test("apiRagSearch GET request to /api/rag/search with q param", async () => {
  const prevFetch = globalThis.fetch;
  const calls = [];
  try {
    globalThis.fetch = async (input, init) => {
      calls.push({ url: String(input || ""), init });
      return new Response(
        JSON.stringify({ ok: true, query: "test", total: 1, results: [{ chunk_id: "c1", score: 1.5, chunk_text: "hello world", source_type: "bpmn_xml", source_id: "sess_1" }] }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    };

    const r = await apiRagSearch({ q: "test" });
    assert.equal(r.ok, true);
    assert.equal(r.total, 1);
    assert.equal(r.results.length, 1);
    assert.match(String(calls[0]?.url || ""), /\/api\/rag\/search/);
    assert.match(String(calls[0]?.url || ""), /q=test/);
  } finally {
    globalThis.fetch = prevFetch;
  }
});

test("apiRagSearch includes source_type and session_id in query string when provided", async () => {
  const prevFetch = globalThis.fetch;
  const calls = [];
  try {
    globalThis.fetch = async (input, init) => {
      calls.push({ url: String(input || ""), init });
      return new Response(
        JSON.stringify({ ok: true, query: "invoice", total: 0, results: [] }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    };

    await apiRagSearch({ q: "invoice", source_type: "bpmn_xml", session_id: "sess_42" });
    const url = String(calls[0]?.url || "");
    assert.match(url, /source_type=bpmn_xml/);
    assert.match(url, /session_id=sess_42/);
  } finally {
    globalThis.fetch = prevFetch;
  }
});

test("apiRagSearch returns empty results array on empty response", async () => {
  const prevFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () => new Response(
      JSON.stringify({ ok: true, query: "noop", total: 0, results: [] }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );

    const r = await apiRagSearch({ q: "noop" });
    assert.equal(r.ok, true);
    assert.equal(r.total, 0);
    assert.deepEqual(r.results, []);
  } finally {
    globalThis.fetch = prevFetch;
  }
});

test("apiRagSearch propagates HTTP error", async () => {
  const prevFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () => new Response(
      JSON.stringify({ error: "unauthorized" }),
      { status: 401, headers: { "Content-Type": "application/json" } },
    );

    const r = await apiRagSearch({ q: "secret" });
    assert.equal(r.ok, false);
    assert.equal(r.status, 401);
  } finally {
    globalThis.fetch = prevFetch;
  }
});

// -------- apiRagIndex --------

test("apiRagIndex returns error when source_type is missing", async () => {
  const r = await apiRagIndex({ session_id: "sess_1" });
  assert.equal(r.ok, false);
  assert.equal(r.error, "missing source_type");
});

test("apiRagIndex returns error when session_id is missing", async () => {
  const r = await apiRagIndex({ source_type: "bpmn_xml" });
  assert.equal(r.ok, false);
  assert.equal(r.error, "missing session_id");
});

test("apiRagIndex POSTs to /api/rag/index with correct body", async () => {
  const prevFetch = globalThis.fetch;
  const calls = [];
  try {
    globalThis.fetch = async (input, init) => {
      calls.push({ url: String(input || ""), init });
      return new Response(
        JSON.stringify({ ok: true, doc_id: "doc_1", chunks_created: 5, was_updated: true }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    };

    const r = await apiRagIndex({ source_type: "bpmn_xml", session_id: "sess_1" });
    assert.equal(r.ok, true);
    assert.equal(r.doc_id, "doc_1");
    assert.equal(r.chunks_created, 5);
    assert.equal(r.was_updated, true);
    assert.match(String(calls[0]?.url || ""), /\/api\/rag\/index$/);
    assert.equal(String(calls[0]?.init?.method || "").toUpperCase(), "POST");
    const body = JSON.parse(String(calls[0]?.init?.body || "{}"));
    assert.equal(body.source_type, "bpmn_xml");
    assert.equal(body.session_id, "sess_1");
    assert.equal(body.force, false);
  } finally {
    globalThis.fetch = prevFetch;
  }
});

test("apiRagIndex sends force=true when specified", async () => {
  const prevFetch = globalThis.fetch;
  const calls = [];
  try {
    globalThis.fetch = async (input, init) => {
      calls.push({ url: String(input || ""), init });
      return new Response(
        JSON.stringify({ ok: true, doc_id: "doc_2", chunks_created: 3, was_updated: true }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    };

    await apiRagIndex({ source_type: "bpmn_xml", session_id: "sess_2", force: true });
    const body = JSON.parse(String(calls[0]?.init?.body || "{}"));
    assert.equal(body.force, true);
  } finally {
    globalThis.fetch = prevFetch;
  }
});

test("apiRagIndex was_updated=false when content hash unchanged", async () => {
  const prevFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () => new Response(
      JSON.stringify({ ok: true, doc_id: "doc_3", chunks_created: 0, was_updated: false }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );

    const r = await apiRagIndex({ source_type: "bpmn_xml", session_id: "sess_3" });
    assert.equal(r.ok, true);
    assert.equal(r.was_updated, false);
  } finally {
    globalThis.fetch = prevFetch;
  }
});

test("apiRagIndex propagates HTTP 400 error", async () => {
  const prevFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () => new Response(
      JSON.stringify({ error: "invalid source_type" }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );

    const r = await apiRagIndex({ source_type: "invalid", session_id: "sess_1" });
    assert.equal(r.ok, false);
    assert.equal(r.status, 400);
  } finally {
    globalThis.fetch = prevFetch;
  }
});

// -------- apiRagIndexProductActions --------

test("apiRagIndexProductActions returns error when session_id is missing", async () => {
  const r = await apiRagIndexProductActions({ action_ids: ["pa1"] });
  assert.equal(r.ok, false);
  assert.equal(r.error, "missing session_id");
});

test("apiRagIndexProductActions POSTs selected ids to product-actions index endpoint", async () => {
  const prevFetch = globalThis.fetch;
  const calls = [];
  try {
    globalThis.fetch = async (input, init) => {
      calls.push({ url: String(input || ""), init });
      return new Response(
        JSON.stringify({ ok: true, requested: 2, indexed: 2, unchanged: 0, skipped: 0, failed: 0, chunks_created: 2, results: [] }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    };

    const r = await apiRagIndexProductActions({ session_id: "sess_1", action_ids: ["pa1", "pa2"] });
    assert.equal(r.ok, true);
    assert.equal(r.indexed, 2);
    assert.match(String(calls[0]?.url || ""), /\/api\/rag\/product-actions\/index$/);
    const body = JSON.parse(String(calls[0]?.init?.body || "{}"));
    assert.equal(body.session_id, "sess_1");
    assert.deepEqual(body.action_ids, ["pa1", "pa2"]);
    assert.equal(body.force, false);
  } finally {
    globalThis.fetch = prevFetch;
  }
});

test("apiRagIndexProductActions can request all durable actions with an empty id list", async () => {
  const prevFetch = globalThis.fetch;
  const calls = [];
  try {
    globalThis.fetch = async (input, init) => {
      calls.push({ url: String(input || ""), init });
      return new Response(
        JSON.stringify({ ok: true, requested: 3, indexed: 1, unchanged: 2, skipped: 0, failed: 0, chunks_created: 1, results: [] }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    };

    const r = await apiRagIndexProductActions({ session_id: "sess_2" });
    assert.equal(r.ok, true);
    assert.equal(r.unchanged, 2);
    const body = JSON.parse(String(calls[0]?.init?.body || "{}"));
    assert.deepEqual(body.action_ids, []);
  } finally {
    globalThis.fetch = prevFetch;
  }
});

// -------- apiRoutes.rag namespace --------

test("apiRoutes.rag.search builds URL with q param", async () => {
  const { apiRoutes } = await import("./apiRoutes.js");
  const url = apiRoutes.rag.search({ q: "hello world" });
  assert.match(url, /\/api\/rag\/search/);
  assert.match(url, /q=hello\+world|q=hello%20world/);
});

test("apiRoutes.rag.search omits empty params", async () => {
  const { apiRoutes } = await import("./apiRoutes.js");
  const url = apiRoutes.rag.search({ q: "test" });
  assert.doesNotMatch(url, /source_type=/);
  assert.doesNotMatch(url, /session_id=/);
});

test("apiRoutes.rag.index returns static path", async () => {
  const { apiRoutes } = await import("./apiRoutes.js");
  assert.equal(apiRoutes.rag.index(), "/api/rag/index");
});

test("apiRoutes.rag.productActionsIndex returns static path", async () => {
  const { apiRoutes } = await import("./apiRoutes.js");
  assert.equal(apiRoutes.rag.productActionsIndex(), "/api/rag/product-actions/index");
});
