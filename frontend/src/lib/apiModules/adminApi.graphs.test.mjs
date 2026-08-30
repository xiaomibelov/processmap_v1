import test from "node:test";
import assert from "node:assert/strict";

import {
  apiAdminGraphsListSnapshots,
  apiAdminGraphsGetCurrentSnapshot,
  apiAdminGraphsGetAnalytics,
  apiAdminGraphsRebuild,
  apiAdminGraphsGetRebuildStatus,
} from "./adminApi.js";

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

test("apiAdminGraphsListSnapshots returns items array", async () => {
  const prevFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () => jsonResponse([
      { id: "snap_1", created_at: "2026-08-30T00:00:00+00:00", commit_sha: "abc123", commit_message: "m", is_current: true, html_size: 100, json_size: 50 },
    ]);
    const out = await apiAdminGraphsListSnapshots();
    assert.equal(out.ok, true);
    assert.equal(out.items.length, 1);
    assert.equal(out.items[0].id, "snap_1");
  } finally {
    globalThis.fetch = prevFetch;
  }
});

test("apiAdminGraphsGetCurrentSnapshot returns snapshot data", async () => {
  const prevFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () => jsonResponse({ id: "snap_1", is_current: true });
    const out = await apiAdminGraphsGetCurrentSnapshot();
    assert.equal(out.ok, true);
    assert.equal(out.data.id, "snap_1");
  } finally {
    globalThis.fetch = prevFetch;
  }
});

test("apiAdminGraphsGetAnalytics returns analytics payload", async () => {
  const prevFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () => jsonResponse({
      snapshot_id: "snap_1",
      total_nodes: 100,
      total_edges: 200,
      unclassified_percent: 5,
    });
    const out = await apiAdminGraphsGetAnalytics();
    assert.equal(out.ok, true);
    assert.equal(out.data.snapshot_id, "snap_1");
    assert.equal(out.data.total_nodes, 100);
  } finally {
    globalThis.fetch = prevFetch;
  }
});

test("apiAdminGraphsRebuild posts and returns job id", async () => {
  const prevFetch = globalThis.fetch;
  try {
    globalThis.fetch = async (input, init) => {
      assert.equal(init.method, "POST");
      return jsonResponse({ job_id: "job_1", status: "pending" });
    };
    const out = await apiAdminGraphsRebuild();
    assert.equal(out.ok, true);
    assert.equal(out.data.job_id, "job_1");
  } finally {
    globalThis.fetch = prevFetch;
  }
});

test("apiAdminGraphsGetRebuildStatus requires job_id", async () => {
  const out = await apiAdminGraphsGetRebuildStatus("");
  assert.equal(out.ok, false);
  assert.equal(out.error, "missing job_id");
});
