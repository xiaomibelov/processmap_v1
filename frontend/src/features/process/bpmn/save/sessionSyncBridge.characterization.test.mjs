import test from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import React, { act, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { JSDOM } from "jsdom";

import { __resetForTests as resetCasVersionTracker } from "../../../../lib/casVersionTracker.js";

// useDiagramMutationLifecycle тянет lib/api/sessionApi БЕЗ расширения ".js"
// (vite-разрешение, под node ESM не загружается). Регистрируем resolve-hook,
// добивающий ".js" при ERR_MODULE_NOT_FOUND — только для этого тест-процесса.
const resolveHookSource = `
export async function resolve(specifier, context, nextResolve) {
  try {
    return await nextResolve(specifier, context);
  } catch (error) {
    const text = String(specifier || "");
    if (!/\.(?:mjs|cjs|js|jsx|json)$/.test(text)) {
      for (const candidate of [text + ".js", text.replace(/\\/$/, "") + "/index.js"]) {
        try {
          return await nextResolve(candidate, context);
        } catch {
          // try the next candidate
        }
      }
    }
    throw error;
  }
}
`;
register(`data:text/javascript,${encodeURIComponent(resolveHookSource)}`);

const { default: useDiagramMutationLifecycle } = await import("../../hooks/useDiagramMutationLifecycle.js");
const { default: useBpmnSync } = await import("../../hooks/useBpmnSync.js");
const {
  buildOptimisticSyncPayload,
  buildPatchAckPayload,
  buildSyncXmlPayload,
} = await import("./sessionSyncBridge.js");
const {
  asArray,
  asObject,
  interviewHasContent,
  mergeInterviewData,
  sanitizeGraphNodes,
  mergeNodesById,
  mergeEdgesByKey,
  enrichInterviewWithNodeBindings,
  parseBpmnToSessionGraph,
} = await import("../../lib/processStageDomain.js");

const PROJECTION_HELPERS = {
  asArray,
  asObject,
  interviewHasContent,
  mergeInterviewData,
  sanitizeGraphNodes,
  mergeNodesById,
  mergeEdgesByKey,
  enrichInterviewWithNodeBindings,
  parseBpmnToSessionGraph,
};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ---------------------------------------------------------------------------
// Characterization contour canvas-save-pipeline-extraction-v1 (Этап 0 → Этап 1).
//
// sessionSyncBridge: один commitDiagramAutosave в продакшн-сборке порождает
// РОВНО 3 вызова onSessionSync:
//   1) useBpmnSync.syncXmlToSession (useBpmnSync.js:226) внутри saveFromModeler;
//   2) optimistic session sync (useDiagramMutationLifecycle.js:145);
//   3) patch-ack sync (useDiagramMutationLifecycle.js:205).
// Этап 1 вынес пейлоады каскада в bpmn/save/sessionSyncBridge.js; хуки вызывают
// builders вместо инлайн-литералов. Харнесс полного коммита с реальным
// bpmnSync слишком тяжёл (требует полный BPMN-стек ProcessStage), поэтому,
// как разрешено планом, фиксируем мост двумя разрезами:
//   A) mutation-lifecycle разрез: ровно 2 sync (optimistic + ack) за один
//      commitDiagramAutosave (через queueDiagramMutation + 350мс debounce);
//   B) bpmnSync разрез: saveFromModeler дёргает syncXmlToSession → 1 sync.
// Сумма 2 + 1 = 3 — эталон модуля. Плюс байтовая эквивалентность builders.
// ---------------------------------------------------------------------------

const BRIDGE_XML = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"
  xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI"
  xmlns:dc="http://www.omg.org/spec/DD/20100524/DC"
  xmlns:di="http://www.omg.org/spec/DD/20100524/DI"
  id="Definitions_bridge" targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="Process_bridge" isExecutable="false" name="Мост">
    <bpmn:startEvent id="StartEvent_bridge" name="Старт" />
    <bpmn:task id="Task_bridge" name="Опишите первый шаг процесса" />
    <bpmn:endEvent id="EndEvent_bridge" name="Финиш" />
    <bpmn:sequenceFlow id="Flow_bridge_1" sourceRef="StartEvent_bridge" targetRef="Task_bridge" />
    <bpmn:sequenceFlow id="Flow_bridge_2" sourceRef="Task_bridge" targetRef="EndEvent_bridge" />
  </bpmn:process>
  <bpmndi:BPMNDiagram id="BPMNDiagram_bridge">
    <bpmndi:BPMNPlane id="BPMNPlane_bridge" bpmnElement="Process_bridge">
      <bpmndi:BPMNShape id="StartEvent_bridge_di" bpmnElement="StartEvent_bridge">
        <dc:Bounds x="180" y="150" width="36" height="36" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Task_bridge_di" bpmnElement="Task_bridge">
        <dc:Bounds x="280" y="128" width="140" height="80" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="EndEvent_bridge_di" bpmnElement="EndEvent_bridge">
        <dc:Bounds x="500" y="150" width="36" height="36" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNEdge id="Flow_bridge_1_di" bpmnElement="Flow_bridge_1">
        <di:waypoint x="216" y="168" />
        <di:waypoint x="280" y="168" />
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_bridge_2_di" bpmnElement="Flow_bridge_2">
        <di:waypoint x="420" y="168" />
        <di:waypoint x="500" y="168" />
      </bpmndi:BPMNEdge>
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>`;

function setupDom() {
  const dom = new JSDOM("<!doctype html><html><body></body></html>", { pretendToBeVisual: true });
  const previous = {
    window: globalThis.window,
    document: globalThis.document,
    Event: globalThis.Event,
    Element: globalThis.Element,
    HTMLElement: globalThis.HTMLElement,
    Node: globalThis.Node,
    DOMParser: globalThis.DOMParser,
    requestAnimationFrame: globalThis.requestAnimationFrame,
    cancelAnimationFrame: globalThis.cancelAnimationFrame,
    reactActEnv: globalThis.IS_REACT_ACT_ENVIRONMENT,
    fetch: globalThis.fetch,
  };
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.Event = dom.window.Event;
  globalThis.Element = dom.window.Element;
  globalThis.HTMLElement = dom.window.HTMLElement;
  globalThis.Node = dom.window.Node;
  globalThis.DOMParser = dom.window.DOMParser;
  globalThis.requestAnimationFrame = dom.window.requestAnimationFrame.bind(dom.window);
  globalThis.cancelAnimationFrame = dom.window.cancelAnimationFrame.bind(dom.window);
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const container = dom.window.document.createElement("div");
  dom.window.document.body.appendChild(container);
  const root = createRoot(container);
  const cleanup = async () => {
    await act(async () => {
      root.unmount();
    });
    dom.window.close();
    globalThis.window = previous.window;
    globalThis.document = previous.document;
    globalThis.Event = previous.Event;
    globalThis.Element = previous.Element;
    globalThis.HTMLElement = previous.HTMLElement;
    globalThis.Node = previous.Node;
    globalThis.DOMParser = previous.DOMParser;
    globalThis.requestAnimationFrame = previous.requestAnimationFrame;
    globalThis.cancelAnimationFrame = previous.cancelAnimationFrame;
    globalThis.IS_REACT_ACT_ENVIRONMENT = previous.reactActEnv;
    globalThis.fetch = previous.fetch;
  };
  return { root, cleanup, window: dom.window };
}

function createPatchFetchStub(fetchCalls) {
  return async (url, init = {}) => {
    fetchCalls.push({ url: String(url), method: String(init?.method || "GET") });
    return {
      ok: true,
      status: 200,
      headers: { get: (name) => (String(name).toLowerCase() === "content-type" ? "application/json" : "") },
      json: async () => ({
        id: "sid_bridge",
        session_id: "sid_bridge",
        diagram_state_version: 8,
      }),
      text: async () => "",
    };
  };
}

function LifecycleHarness({ options, expose }) {
  const value = useDiagramMutationLifecycle(options);
  useEffect(() => {
    expose(value);
  }, [value, expose]);
  return null;
}

test("mutation-lifecycle slice: one commitDiagramAutosave emits exactly 2 onSessionSync (optimistic + patch ack)", async () => {
  resetCasVersionTracker();
  const { root, cleanup } = setupDom();
  const syncs = [];
  const errors = [];
  const fetchCalls = [];
  globalThis.fetch = createPatchFetchStub(fetchCalls);
  let latest = null;

  const bpmnSync = {
    saveFromModeler: async () => ({ ok: true, xml: BRIDGE_XML, storedRev: 2, diagramStateVersion: 7 }),
    saveFromXmlDraft: async () => ({ ok: true, xml: BRIDGE_XML, storedRev: 2, diagramStateVersion: 7 }),
  };
  const options = {
    sid: "sid_bridge",
    isLocal: false,
    draft: {
      id: "sid_bridge",
      bpmn_xml: BRIDGE_XML,
      interview: { boundaries: { trigger: "", finish_state: "" }, steps: [], transitions: [], subprocesses: [] },
      nodes: [],
      edges: [],
    },
    bpmnSync,
    coordinator: null,
    projectionHelpers: PROJECTION_HELPERS,
    getBaseDiagramStateVersion: () => 6,
    rememberDiagramStateVersion: () => {},
    onSessionSync: (patch) => syncs.push(patch),
    onError: (err) => errors.push(err),
  };

  try {
    await act(async () => {
      root.render(React.createElement(LifecycleHarness, { options, expose: (v) => { latest = v; } }));
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 16));
    });

    await act(async () => {
      latest.queueDiagramMutation({ kind: "diagram.change" });
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 900));
    });

    assert.equal(errors.length, 0, `unexpected errors: ${JSON.stringify(errors)}`);
    assert.equal(
      syncs.length,
      2,
      `one commitDiagramAutosave must emit exactly 2 syncs in the mutation-lifecycle slice (optimistic + ack), got ${syncs.length}`,
    );

    const [optimistic, ack] = syncs;
    assert.equal(optimistic?._sync_source, undefined, "first sync is the optimistic session (no _sync_source)");
    assert.equal(optimistic?.id, "sid_bridge");
    assert.equal(optimistic?.bpmn_xml, BRIDGE_XML, "optimistic sync carries saved XML");
    assert.ok(Array.isArray(optimistic?.actors_derived), "optimistic sync carries derived actors");
    assert.ok(optimistic?.interview && typeof optimistic.interview === "object", "optimistic sync carries projected interview");

    assert.equal(ack?._sync_source, "diagram.autosave_patch_ack", "second sync is the patch ack (useDiagramMutationLifecycle.js:200)");
    assert.equal(ack?.id, "sid_bridge");

    // PATCH backend подтверждение реально ушло через fetch (meta pipeline).
    const patchCall = fetchCalls.find((c) => c.method === "PATCH");
    assert.ok(patchCall, "secondary session patch must reach the backend PATCH endpoint");
  } finally {
    await cleanup();
  }
});

function BpmnSyncHarness({ options, expose }) {
  const value = useBpmnSync(options);
  useEffect(() => {
    expose(value);
  }, [value, expose]);
  return null;
}

test("bpmnSync slice: saveFromModeler triggers syncXmlToSession → 1 onSessionSync with autosave source", async () => {
  const { root, cleanup } = setupDom();
  const syncs = [];
  let latest = null;

  const bpmnRef = {
    current: {
      saveLocal: async () => ({ ok: true, xml: BRIDGE_XML }),
      isFlushing: () => false,
    },
  };
  const options = {
    sessionId: "sid_bridge",
    isLocal: false,
    draft: { id: "sid_bridge", bpmn_xml: BRIDGE_XML },
    bpmnRef,
    onSessionSync: (patch) => syncs.push(patch),
    apiGetBpmnXml: async () => ({ ok: true, xml: BRIDGE_XML }),
  };

  try {
    await act(async () => {
      root.render(React.createElement(BpmnSyncHarness, { options, expose: (v) => { latest = v; } }));
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 16));
    });
    assert.ok(latest?.saveFromModeler, "useBpmnSync exposes saveFromModeler");

    let result = null;
    await act(async () => {
      result = await latest.saveFromModeler({ source: "autosave" });
    });

    assert.equal(result?.ok, true);
    assert.equal(
      syncs.length,
      1,
      `saveFromModeler must emit exactly 1 sync via syncXmlToSession (useBpmnSync.js:226), got ${syncs.length}`,
    );
    assert.equal(syncs[0]?._sync_source, "autosave", "sync source is the saveFromModeler source");
    assert.equal(syncs[0]?.bpmn_xml, BRIDGE_XML);
    assert.equal(syncs[0]?.session_id, "sid_bridge");
    assert.ok(Array.isArray(syncs[0]?.actors_derived), "syncXmlToSession derives actors from BPMN");
  } finally {
    await cleanup();
  }
});

test("bridge total: mutation-lifecycle (2) + bpmnSync syncXmlToSession (1) = 3 syncs per commit", () => {
  // Документирующий тест-инвариант модуля sessionSyncBridge.
  // Значения зафиксированы двумя behavioral тестами выше.
  assert.equal(2 + 1, 3);
});

// --- Этап 1: байтовая эквивалентность builders sessionSyncBridge.js ---------

test("buildSyncXmlPayload mirrors useBpmnSync.syncXmlToSession payload verbatim", () => {
  const payload = buildSyncXmlPayload({
    sid: "sid_1",
    xml: "<bpmn:definitions id=\"x\"/>",
    source: "autosave",
    derivedActors: ["Актер А"],
  });

  assert.deepEqual(
    Object.keys(payload),
    ["id", "session_id", "bpmn_xml", "actors_derived", "_sync_source"],
    "syncXml payload key order must match the original useBpmnSync.js literal",
  );
  assert.deepEqual(payload, {
    id: "sid_1",
    session_id: "sid_1",
    bpmn_xml: "<bpmn:definitions id=\"x\"/>",
    actors_derived: ["Актер А"],
    _sync_source: "autosave",
  });
});

test("buildOptimisticSyncPayload with xml carries projected interview/nodes/edges and patch", () => {
  const draft = {
    id: "sid_bridge",
    bpmn_xml: BRIDGE_XML,
    interview: { boundaries: { trigger: "", finish_state: "" }, steps: [], transitions: [], subprocesses: [] },
    nodes: [],
    edges: [],
  };
  const { optimisticSession, patch } = buildOptimisticSyncPayload({
    sid: "sid_bridge",
    draft,
    xml: BRIDGE_XML,
    projectionHelpers: PROJECTION_HELPERS,
  });

  assert.equal(optimisticSession.id, "sid_bridge");
  assert.equal(optimisticSession.session_id, "sid_bridge");
  assert.equal(optimisticSession.bpmn_xml, BRIDGE_XML);
  assert.ok(optimisticSession.interview && typeof optimisticSession.interview === "object", "projected interview is embedded");
  assert.ok(Array.isArray(optimisticSession.nodes), "projected nodes are embedded");
  assert.ok(Array.isArray(optimisticSession.edges), "projected edges are embedded");
  assert.ok(Array.isArray(optimisticSession.actors_derived), "derived actors are embedded");
  assert.equal(optimisticSession._sync_source, undefined, "optimistic sync carries no _sync_source");
  assert.ok(patch && typeof patch === "object", "patch by-product for the caller's PATCH stage");
});

test("buildOptimisticSyncPayload with empty xml keeps draft, empty actors and empty patch", () => {
  const draft = { id: "sid_1", bpmn_xml: "", title: "Черновик" };
  const { optimisticSession, patch } = buildOptimisticSyncPayload({
    sid: "sid_1",
    draft,
    xml: "   ",
    projectionHelpers: PROJECTION_HELPERS,
  });

  assert.equal(optimisticSession.title, "Черновик", "draft fields are preserved via spread");
  assert.equal(optimisticSession.bpmn_xml, "   ");
  assert.deepEqual(optimisticSession.actors_derived, []);
  assert.deepEqual(patch, {});
});

test("buildPatchAckPayload mirrors patch-ack literal: version rounding, camel fallback, actors passthrough", () => {
  const withVersion = buildPatchAckPayload({
    sid: "sid_1",
    patchSession: { diagram_state_version: 8.4 },
    optimisticSession: { actors_derived: ["А", "Б"] },
  });
  assert.deepEqual(
    Object.keys(withVersion),
    ["id", "session_id", "actors_derived", "_sync_source", "diagram_state_version"],
    "patch-ack payload key order must match the original useDiagramMutationLifecycle.js literal",
  );
  assert.equal(withVersion.diagram_state_version, 8, "version is rounded via Math.round");
  assert.deepEqual(withVersion.actors_derived, ["А", "Б"]);

  const camelCase = buildPatchAckPayload({
    sid: "sid_1",
    patchSession: { diagramStateVersion: 3 },
    optimisticSession: {},
  });
  assert.equal(camelCase.diagram_state_version, 3, "camelCase diagramStateVersion fallback is preserved");

  const withoutVersion = buildPatchAckPayload({
    sid: "sid_1",
    patchSession: {},
    optimisticSession: null,
  });
  assert.equal("diagram_state_version" in withoutVersion, false, "no version key when ack carries none");
  assert.deepEqual(withoutVersion.actors_derived, [], "actors fall back to empty array via asArray");
  assert.equal(withoutVersion._sync_source, "diagram.autosave_patch_ack");
});

test("hooks consume sessionSyncBridge builders instead of inline payload literals", () => {
  const readSource = (relativePath) =>
    fs.readFileSync(path.join(__dirname, relativePath), "utf8");

  const bpmnSyncSrc = readSource("../../hooks/useBpmnSync.js");
  const mutationSrc = readSource("../../hooks/useDiagramMutationLifecycle.js");

  for (const [name, src] of [
    ["useBpmnSync.js", bpmnSyncSrc],
    ["useDiagramMutationLifecycle.js", mutationSrc],
  ]) {
    assert.match(
      src,
      /from\s+["'][^"']*sessionSyncBridge\.js["']/,
      `${name} must import payload builders from bpmn/save/sessionSyncBridge.js`,
    );
  }
  assert.doesNotMatch(
    mutationSrc,
    /_sync_source:\s*"diagram\.autosave_patch_ack"/,
    "patch-ack _sync_source literal must live in sessionSyncBridge.js",
  );
  assert.doesNotMatch(
    bpmnSyncSrc,
    /onSessionSync\?\.\(\{\s*id: sid,[\s\S]*?_sync_source: source/,
    "syncXml payload literal must live in sessionSyncBridge.js",
  );
});
