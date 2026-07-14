import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";

const jsdom = new JSDOM("<!doctype html><html><body></body></html>");
globalThis.DOMParser = jsdom.window.DOMParser;
globalThis.XMLSerializer = jsdom.window.XMLSerializer;

import { sessionLoader } from "../sessionLoader.js";
import { sessionCache } from "../sessionCache.js";
import { saveCoordinator } from "../saveCoordinator.js";
import { getVersion, clearSession } from "../../../lib/casVersionTracker.js";

const SAMPLE_XML = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:camunda="http://camunda.org/schema/1.0/bpmn" id="Definitions_1">
  <bpmn:process id="Process_1">
    <bpmn:task id="Activity_1" />
  </bpmn:process>
</bpmn:definitions>`;

function resetState() {
  sessionCache.clear();
  clearSession("integ-1");
}

function installMockFetch({ xml = SAMPLE_XML, diagramStateVersion = 7 } = {}) {
  const prevFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url) => {
    calls.push(String(url));
    const u = String(url);
    if (u.includes("/api/sessions/") && u.includes("/bpmn")) {
      return new Response(xml, {
        status: 200,
        headers: { "Content-Type": "application/xml" },
      });
    }
    if (u.includes("/api/sessions/")) {
      return new Response(JSON.stringify({
        ok: true,
        id: "integ-1",
        session_id: "integ-1",
        title: "Integration Session",
        diagram_state_version: diagramStateVersion,
        bpmn_meta: { version: 1 },
      }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    return new Response("not found", { status: 404 });
  };
  return { calls, restore: () => { globalThis.fetch = prevFetch; } };
}

test("saveCoordinator xml success updates cached diagram version", async () => {
  resetState();
  const { restore } = installMockFetch({ diagramStateVersion: 7 });
  try {
    await sessionLoader.load("integ-1");
    assert.equal(sessionCache.get("integ-1").diagramStateVersion, 7);
    assert.equal(getVersion("integ-1"), 7);

    saveCoordinator.emit("success", {
      sessionId: "integ-1",
      pipeline: "xml",
      response: { diagram_state_version: 42, xml: SAMPLE_XML },
    });

    assert.equal(sessionCache.get("integ-1").diagramStateVersion, 42);
  } finally {
    restore();
  }
});

test("saveCoordinator conflict invalidates cache", async () => {
  resetState();
  const { restore } = installMockFetch();
  try {
    await sessionLoader.load("integ-1");
    assert.ok(sessionCache.get("integ-1"));

    saveCoordinator.emit("conflict", { sessionId: "integ-1", pipeline: "xml" });

    assert.equal(sessionCache.get("integ-1"), null);
    assert.equal(sessionCache.get("integ-1", { allowStale: true }).sessionId, "integ-1");
  } finally {
    restore();
  }
});

test("concurrent loads for same session deduplicate fetch", async () => {
  resetState();
  const { calls, restore } = installMockFetch();
  try {
    const [r1, r2, r3] = await Promise.all([
      sessionLoader.load("integ-1"),
      sessionLoader.load("integ-1"),
      sessionLoader.load("integ-1"),
    ]);
    assert.equal(r1.ok && r2.ok && r3.ok, true);
    const sessionCalls = calls.filter((u) => u.includes("/api/sessions/integ-1") && !u.includes("/bpmn"));
    const bpmnCalls = calls.filter((u) => u.includes("/api/sessions/integ-1") && u.includes("/bpmn"));
    assert.equal(sessionCalls.length, 1);
    assert.equal(bpmnCalls.length, 1);
  } finally {
    restore();
  }
});

test("loadBatch fetches each session once", async () => {
  resetState();
  clearSession("integ-a");
  clearSession("integ-b");
  const prevFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url) => {
    calls.push(String(url));
    const u = String(url);
    const sid = u.includes("/api/sessions/integ-a") ? "integ-a" : "integ-b";
    if (u.includes("/bpmn")) {
      return new Response(SAMPLE_XML, { status: 200, headers: { "Content-Type": "application/xml" } });
    }
    return new Response(JSON.stringify({
      ok: true,
      id: sid,
      session_id: sid,
      title: `Session ${sid}`,
      diagram_state_version: 1,
    }), { status: 200, headers: { "Content-Type": "application/json" } });
  };
  try {
    const results = await sessionLoader.loadBatch(["integ-a", "integ-b"]);
    assert.equal(results["integ-a"].ok, true);
    assert.equal(results["integ-b"].ok, true);
    assert.equal(calls.filter((u) => u.includes("/api/sessions/integ-a")).length, 2);
    assert.equal(calls.filter((u) => u.includes("/api/sessions/integ-b")).length, 2);
  } finally {
    globalThis.fetch = prevFetch;
  }
});
