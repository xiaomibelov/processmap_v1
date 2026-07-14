import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";

// jsdom must be available for XML parsing in the loader and camundaExtensions.
const jsdom = new JSDOM("<!doctype html><html><body></body></html>");
globalThis.DOMParser = jsdom.window.DOMParser;
globalThis.XMLSerializer = jsdom.window.XMLSerializer;

import { sessionLoader } from "../sessionLoader.js";
import { sessionCache } from "../sessionCache.js";
import { getVersion, clearSession } from "../../../lib/casVersionTracker.js";

const SAMPLE_XML = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:camunda="http://camunda.org/schema/1.0/bpmn" id="Definitions_1">
  <bpmn:process id="Process_1">
    <bpmn:task id="Activity_1">
      <bpmn:extensionElements>
        <camunda:properties>
          <camunda:property name="ee_time" value="10" />
        </camunda:properties>
      </bpmn:extensionElements>
    </bpmn:task>
  </bpmn:process>
</bpmn:definitions>`;

function resetState() {
  sessionCache.clear();
  clearSession("sess-loader-1");
  clearSession("sess-loader-2");
  clearSession("local_123");
}

function installMockFetch({ sessionXml = SAMPLE_XML, sessionData = {} } = {}) {
  const prevFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url) => {
    calls.push(String(url));
    const u = String(url);
    if (u.includes("/api/sessions/") && u.includes("/bpmn")) {
      return new Response(sessionXml, {
        status: 200,
        headers: { "Content-Type": "application/xml" },
      });
    }
    if (u.includes("/api/sessions/")) {
      return new Response(JSON.stringify({
        ok: true,
        id: "sess-loader-1",
        session_id: "sess-loader-1",
        title: "Test Session",
        diagram_state_version: 7,
        bpmn_meta: { version: 1 },
        ...sessionData,
      }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    return new Response("not found", { status: 404 });
  };
  return { calls, restore: () => { globalThis.fetch = prevFetch; } };
}

test("load fetches session and XML, populates cache, syncs CAS version", async () => {
  resetState();
  const { calls, restore } = installMockFetch();
  try {
    const result = await sessionLoader.load("sess-loader-1");
    assert.equal(result.ok, true);
    assert.equal(result.source, "backend");
    assert.equal(result.data.sessionId, "sess-loader-1");
    assert.equal(result.data.session.title, "Test Session");
    assert.ok(result.data.xml.includes("Activity_1"));
    assert.equal(result.data.diagramStateVersion, 7);
    assert.equal(result.data.extensions.Activity_1.properties.extensionProperties[0].name, "ee_time");

    assert.equal(calls.length, 2);
    assert.ok(getVersion("sess-loader-1"), 7);

    const cached = sessionCache.get("sess-loader-1");
    assert.equal(cached.sessionId, "sess-loader-1");
  } finally {
    restore();
  }
});

test("second load returns cached data without fetch", async () => {
  resetState();
  const { calls, restore } = installMockFetch();
  try {
    await sessionLoader.load("sess-loader-1");
    const result2 = await sessionLoader.load("sess-loader-1");
    assert.equal(result2.source, "cache");
    assert.equal(calls.length, 2);
  } finally {
    restore();
  }
});

test("parallel loads deduplicate to a single fetch", async () => {
  resetState();
  const { calls, restore } = installMockFetch();
  try {
    const [r1, r2] = await Promise.all([
      sessionLoader.load("sess-loader-1"),
      sessionLoader.load("sess-loader-1"),
    ]);
    assert.equal(r1.ok && r2.ok, true);
    assert.equal(calls.length, 2);
  } finally {
    restore();
  }
});

test("reload invalidates cache and fetches again", async () => {
  resetState();
  const { calls, restore } = installMockFetch();
  try {
    await sessionLoader.load("sess-loader-1");
    await sessionLoader.reload("sess-loader-1");
    assert.equal(calls.length, 4);
  } finally {
    restore();
  }
});

test("loadBatch fetches multiple sessions", async () => {
  resetState();
  const { calls, restore } = installMockFetch();
  try {
    const results = await sessionLoader.loadBatch(["sess-loader-1", "sess-loader-2"]);
    assert.equal(results["sess-loader-1"].ok, true);
    assert.equal(results["sess-loader-2"].ok, true);
    // Each session triggers 2 calls (session + bpmn)
    assert.equal(calls.length, 4);
  } finally {
    restore();
  }
});

test("load returns error when session endpoint fails", async () => {
  resetState();
  const prevFetch = globalThis.fetch;
  globalThis.fetch = async (url) => new Response(JSON.stringify({ error: "not found" }), {
    status: 404,
    headers: { "Content-Type": "application/json" },
  });
  try {
    const result = await sessionLoader.load("sess-loader-missing");
    assert.equal(result.ok, false);
    assert.equal(result.status, 404);
  } finally {
    globalThis.fetch = prevFetch;
  }
});

test("local session loads XML from localStorage", async () => {
  resetState();
  const prevFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response("should not be called", { status: 500 });
  const prevLocalStorage = globalThis.localStorage;
  globalThis.localStorage = {
    getItem: (key) => (key === "fpc_bpmn_xml_local_123" ? SAMPLE_XML : null),
  };
  try {
    const result = await sessionLoader.load("local_123");
    assert.equal(result.ok, true);
    assert.equal(result.source, "local");
    assert.ok(result.data.xml.includes("Activity_1"));
  } finally {
    globalThis.fetch = prevFetch;
    globalThis.localStorage = prevLocalStorage;
  }
});
