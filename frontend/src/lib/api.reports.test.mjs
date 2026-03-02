import test from "node:test";
import assert from "node:assert/strict";

import {
  apiCreatePathReportVersion,
  apiDeleteReportVersion,
  apiGetReportVersion,
  apiListPathReportVersions,
} from "./api.js";

test("apiListPathReportVersions: returns 404 when path reports endpoint is unavailable", async () => {
  const prevFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () => new Response(JSON.stringify({ detail: "Not Found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
    const out = await apiListPathReportVersions("sess_1", "primary");
    assert.equal(out.ok, false);
    assert.equal(out.status, 404);
  } finally {
    globalThis.fetch = prevFetch;
  }
});

test("apiListPathReportVersions: passes steps_hash query and returns list", async () => {
  const prevFetch = globalThis.fetch;
  const calls = [];
  try {
    globalThis.fetch = async (input) => {
      calls.push(String(input || ""));
      return new Response(JSON.stringify([{ id: "rpt_1", status: "ok", steps_hash: "abc" }]), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    };
    const out = await apiListPathReportVersions("sess_1", "primary", { stepsHash: "abc" });
    assert.equal(out.ok, true);
    assert.equal(out.items.length, 1);
    assert.match(calls[0], /\/api\/sessions\/sess_1\/paths\/primary\/reports\?steps_hash=abc$/);
  } finally {
    globalThis.fetch = prevFetch;
  }
});

test("apiCreatePathReportVersion: retries next alias when first endpoint returns 504", async () => {
  const prevFetch = globalThis.fetch;
  const calls = [];
  try {
    globalThis.fetch = async (input) => {
      const url = String(input || "");
      calls.push(url);
      if (calls.length === 1) {
        return new Response("<html>504 Gateway Time-out</html>", {
          status: 504,
          headers: { "Content-Type": "text/html" },
        });
      }
      return new Response(JSON.stringify({ report: { id: "rpt_1", status: "running" } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    };
    const out = await apiCreatePathReportVersion("sess_1", "primary", { steps_hash: "h1" });
    assert.equal(out.ok, true);
    assert.equal((out.report || {}).id, "rpt_1");
    assert.equal(calls.length >= 2, true);
  } finally {
    globalThis.fetch = prevFetch;
  }
});

test("apiCreatePathReportVersion: treats 200 error payload as failure", async () => {
  const prevFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () => new Response(JSON.stringify({ error: "not found" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
    const out = await apiCreatePathReportVersion("sess_404", "primary", { steps_hash: "h1" });
    assert.equal(out.ok, false);
    assert.equal(out.status, 404);
  } finally {
    globalThis.fetch = prevFetch;
  }
});

test("apiListPathReportVersions: retries aliases when first endpoint returns 504", async () => {
  const prevFetch = globalThis.fetch;
  const calls = [];
  try {
    globalThis.fetch = async (input) => {
      const url = String(input || "");
      calls.push(url);
      if (calls.length === 1) {
        return new Response("<html>504 Gateway Time-out</html>", {
          status: 504,
          headers: { "Content-Type": "text/html" },
        });
      }
      return new Response(JSON.stringify([{ id: "rpt_2", status: "running", steps_hash: "h2" }]), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    };
    const out = await apiListPathReportVersions("sess_1", "primary");
    assert.equal(out.ok, true);
    assert.equal(out.items.length, 1);
    assert.equal((out.items[0] || {}).id, "rpt_2");
    assert.equal(calls.length >= 2, true);
  } finally {
    globalThis.fetch = prevFetch;
  }
});

test("apiListPathReportVersions: treats 200 error payload as failure", async () => {
  const prevFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () => new Response(JSON.stringify({ detail: "not found" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
    const out = await apiListPathReportVersions("sess_404", "primary");
    assert.equal(out.ok, false);
    assert.equal(out.status, 404);
  } finally {
    globalThis.fetch = prevFetch;
  }
});

test("apiGetReportVersion: uses /api/reports aliases and stops on 404", async () => {
  const prevFetch = globalThis.fetch;
  const calls = [];
  try {
    globalThis.fetch = async (input) => {
      calls.push(String(input || ""));
      return new Response(JSON.stringify({ detail: "Not Found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    };
    const out = await apiGetReportVersion("rpt_404");
    assert.equal(out.ok, false);
    assert.equal(out.status, 404);
    assert.equal(calls.length, 2);
    assert.match(calls[0], /\/api\/reports\/rpt_404$/);
    assert.match(calls[1], /\/api\/reports\/rpt_404\/$/);
  } finally {
    globalThis.fetch = prevFetch;
  }
});

test("apiGetReportVersion: treats ok+not found payload as 404", async () => {
  const prevFetch = globalThis.fetch;
  const calls = [];
  try {
    globalThis.fetch = async (input) => {
      calls.push(String(input || ""));
      return new Response(JSON.stringify({ error: "not found" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    };
    const out = await apiGetReportVersion("rpt_nf", { sessionId: "sess_1", pathId: "primary" });
    assert.equal(out.ok, false);
    assert.equal(out.status, 404);
    assert.equal(calls.length, 1);
    assert.match(calls[0], /\/api\/sessions\/sess_1\/paths\/primary\/reports\/rpt_nf$/);
  } finally {
    globalThis.fetch = prevFetch;
  }
});

test("apiGetReportVersion: uses scoped endpoint first and falls back to /api/reports", async () => {
  const prevFetch = globalThis.fetch;
  const calls = [];
  try {
    globalThis.fetch = async (input) => {
      const url = String(input || "");
      calls.push(url);
      if (calls.length < 5) {
        return new Response(JSON.stringify({ detail: "Not Found" }), {
          status: 404,
          headers: { "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ id: "rpt_scoped", status: "ok" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    };
    const out = await apiGetReportVersion("rpt_scoped", { sessionId: "sess_1", pathId: "primary" });
    assert.equal(out.ok, true);
    assert.equal((out.report || {}).id, "rpt_scoped");
    assert.match(calls[0], /\/api\/sessions\/sess_1\/paths\/primary\/reports\/rpt_scoped$/);
    assert.match(calls[4], /\/api\/reports\/rpt_scoped$/);
  } finally {
    globalThis.fetch = prevFetch;
  }
});

test("apiDeleteReportVersion: uses scoped endpoint first and succeeds", async () => {
  const prevFetch = globalThis.fetch;
  const calls = [];
  try {
    globalThis.fetch = async (input) => {
      calls.push(String(input || ""));
      return new Response(null, { status: 204 });
    };
    const out = await apiDeleteReportVersion("rpt_1", { sessionId: "sess_1", pathId: "primary" });
    assert.equal(out.ok, true);
    assert.equal(out.status, 204);
    assert.match(calls[0], /\/api\/sessions\/sess_1\/paths\/primary\/reports\/rpt_1$/);
  } finally {
    globalThis.fetch = prevFetch;
  }
});

test("apiDeleteReportVersion: falls back to /api/reports on scoped 404", async () => {
  const prevFetch = globalThis.fetch;
  const calls = [];
  try {
    globalThis.fetch = async (input) => {
      calls.push(String(input || ""));
      if (calls.length < 3) {
        return new Response(JSON.stringify({ detail: "Not Found" }), {
          status: 404,
          headers: { "Content-Type": "application/json" },
        });
      }
      return new Response(null, { status: 204 });
    };
    const out = await apiDeleteReportVersion("rpt_2", { sessionId: "sess_1", pathId: "primary" });
    assert.equal(out.ok, true);
    assert.equal(out.status, 204);
    assert.match(calls[2], /\/api\/reports\/rpt_2$/);
  } finally {
    globalThis.fetch = prevFetch;
  }
});

test("apiDeleteReportVersion: returns unsupported_endpoint on 405", async () => {
  const prevFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () => new Response(JSON.stringify({ detail: "Method Not Allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
    const out = await apiDeleteReportVersion("rpt_3", { sessionId: "sess_1", pathId: "primary" });
    assert.equal(out.ok, false);
    assert.equal(out.status, 405);
    assert.equal(out.unsupported_endpoint, true);
  } finally {
    globalThis.fetch = prevFetch;
  }
});
