import test from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import React, { act, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { JSDOM } from "jsdom";

import { createBpmnWiring } from "../stage/wiring/bpmnWiring.js";
import createBpmnStore from "../store/createBpmnStore.js";
import createBpmnCoordinatorReal from "../coordinator/createBpmnCoordinator.js";
import { saveCoordinator } from "../../../session/saveCoordinator.js";
import { __resetForTests as resetCasVersionTracker } from "../../../../lib/casVersionTracker.js";
import { saveBpmnState } from "../../../process/save/saveBpmnState.js";
import {
  asArray,
  asObject,
  interviewHasContent,
  mergeInterviewData,
  sanitizeGraphNodes,
  mergeNodesById,
  mergeEdgesByKey,
  enrichInterviewWithNodeBindings,
  parseBpmnToSessionGraph,
} from "../../lib/processStageDomain.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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

// ---------------------------------------------------------------------------
// Characterization contour canvas-save-pipeline-extraction-v1 (Этап 0).
// Фиксируем эталонные константы четырёх автосохранялок поведением:
//   1) coordinator debounce 10_000 + drag-константы (через createBpmnWiring с
//      перехватом options реального createBpmnCoordinator);
//   2) mutation-queue debounce 350 (через полный React-харнесс
//      useDiagramMutationLifecycle — образец харнесса useAutosaveQueue.test.mjs);
//   3) xml-pipeline конфиг saveCoordinator (debounce 0 / retry 3 /
//      backoff 1s / timeout 10s) — конфиг, реально зарегистрированный
//      saveBpmnState.js на синглтоне saveCoordinator, плюс поведенческая
//      проверка debounce 0 (два быстрых save → два transport-вызова).
// ---------------------------------------------------------------------------

function ref(initial) {
  return { current: initial };
}

function createWiringCtx() {
  const refs = {
    bpmnStoreRef: ref(null),
    bpmnStoreUnsubRef: ref(null),
    bpmnStoreFanoutRef: ref(null),
    lastStoreEventRef: ref({}),
    bpmnPersistenceRef: ref(null),
    bpmnCoordinatorRef: ref(null),
    modelerRuntimeRef: ref(null),
    activeSessionRef: ref("sid_cfg"),
    suppressCommandStackRef: ref(0),
    ensureVisibleCycleRef: ref(0),
    modelerReadyRef: ref(false),
    runtimeTokenRef: ref(0),
    modelerRef: ref(null),
    draftRef: ref({}),
  };
  const values = { xml: "", xmlDraft: "", draft: {}, sessionId: "sid_cfg", activeProjectId: "pid_1" };
  const state = { setXml: () => {}, setXmlDraft: () => {}, setXmlDirty: () => {} };
  const readOnly = { draftRef: refs.draftRef };
  const api = {
    saveBpmnSnapshot: async () => ({ ok: true }),
    getLatestBpmnSnapshot: async () => ({ ok: false }),
    apiGetBpmnXml: async () => ({ ok: true, xml: "" }),
    apiPutBpmnXml: async () => ({ ok: true }),
  };
  const callbacks = {
    localKey: (sid) => `k:${String(sid || "")}`,
    isLocalSessionId: () => false,
    logBpmnTrace: () => {},
    bumpSaveCounter: () => 0,
    onCoordinatorTrace: () => {},
    shouldLogBpmnTrace: () => false,
    probeCanvas: () => {},
    emitDiagramMutation: () => {},
    trackRuntimeStatus: () => {},
    transformPersistedXml: (xml) => String(xml || ""),
    fnv1aHex: () => "hash",
  };
  return { refs, values, state, readOnly, api, callbacks };
}

function createReadyRuntime() {
  return {
    getStatus: () => ({ ready: true, defs: true, token: 7 }),
    getXml: async () => ({ ok: true, xml: "<bpmn:definitions id=\"cfg\"/>", token: 7 }),
    onChange: () => () => {},
    onStatus: () => () => {},
  };
}

test("wiring creates coordinator with debounceMs 10_000 and drag constants 5000/500", () => {
  const ctx = createWiringCtx();
  let capturedOptions = null;
  const deps = {
    createBpmnStore: () => ({
      subscribe: () => () => {},
      getState: () => ({ xml: "", dirty: false, rev: 0 }),
    }),
    createBpmnPersistence: () => ({
      saveRaw: async () => ({ ok: true }),
      loadRaw: async () => ({ ok: true }),
      cacheRaw: () => ({ ok: true }),
    }),
    createBpmnCoordinator: (options) => {
      capturedOptions = options;
      return createBpmnCoordinatorReal(options);
    },
  };

  const wiring = createBpmnWiring(() => ctx, deps);
  const coordinator = wiring.ensureBpmnCoordinator();
  assert.ok(coordinator);
  assert.ok(capturedOptions, "wiring must create the real coordinator with captured options");
  assert.equal(capturedOptions.debounceMs, 10_000, "coordinator autosave debounce (bpmnWiring.js:210)");
  assert.equal(capturedOptions.dragThrottleMs, 5000, "drag throttle (bpmnWiring.js:212)");
  assert.equal(capturedOptions.dragFinalDebounceMs, 500, "drag final debounce (bpmnWiring.js:213)");
});

test("wiring coordinator does not flush autosave earlier than debounceMs 10_000", async () => {
  const ctx = createWiringCtx();
  const persistCalls = [];
  const deps = {
    createBpmnStore: (options) => createBpmnStore({ xml: "", dirty: true, ...options }),
    createBpmnPersistence: () => ({
      saveRaw: async (sid, xml, rev, reason) => {
        persistCalls.push({ sid, reason });
        return { ok: true, storedRev: rev, hash: "hash" };
      },
      loadRaw: async () => ({ ok: true, xml: "", rev: 0 }),
      cacheRaw: () => ({ ok: true }),
    }),
  };

  if (typeof globalThis.window === "undefined") {
    globalThis.window = globalThis;
  }
  const wiring = createBpmnWiring(() => ctx, deps);
  const coordinator = wiring.ensureBpmnCoordinator();
  ctx.refs.modelerRuntimeRef.current = createReadyRuntime();

  coordinator.scheduleSave("autosave");
  await new Promise((resolve) => setTimeout(resolve, 300));
  assert.equal(
    persistCalls.length,
    0,
    "autosave must not flush within 300ms — debounce is 10_000ms",
  );
  coordinator.destroy?.();
  ctx.refs.bpmnStoreUnsubRef.current?.();
});

// --- mutation-queue debounce 350 через реальный useDiagramMutationLifecycle ---

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
  };
  return { root, cleanup, window: dom.window };
}

const MUTATION_XML = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"
  xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI"
  xmlns:dc="http://www.omg.org/spec/DD/20100524/DC"
  xmlns:di="http://www.omg.org/spec/DD/20100524/DI"
  id="Definitions_cfg" targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="Process_cfg" isExecutable="false">
    <bpmn:startEvent id="StartEvent_cfg" name="Старт" />
    <bpmn:task id="Task_cfg" name="Шаг" />
    <bpmn:endEvent id="EndEvent_cfg" name="Финиш" />
    <bpmn:sequenceFlow id="Flow_cfg_1" sourceRef="StartEvent_cfg" targetRef="Task_cfg" />
    <bpmn:sequenceFlow id="Flow_cfg_2" sourceRef="Task_cfg" targetRef="EndEvent_cfg" />
  </bpmn:process>
  <bpmndi:BPMNDiagram id="BPMNDiagram_cfg">
    <bpmndi:BPMNPlane id="BPMNPlane_cfg" bpmnElement="Process_cfg">
      <bpmndi:BPMNShape id="StartEvent_cfg_di" bpmnElement="StartEvent_cfg">
        <dc:Bounds x="180" y="150" width="36" height="36" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Task_cfg_di" bpmnElement="Task_cfg">
        <dc:Bounds x="280" y="128" width="140" height="80" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="EndEvent_cfg_di" bpmnElement="EndEvent_cfg">
        <dc:Bounds x="500" y="150" width="36" height="36" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNEdge id="Flow_cfg_1_di" bpmnElement="Flow_cfg_1">
        <di:waypoint x="216" y="168" />
        <di:waypoint x="280" y="168" />
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_cfg_2_di" bpmnElement="Flow_cfg_2">
        <di:waypoint x="420" y="168" />
        <di:waypoint x="500" y="168" />
      </bpmndi:BPMNEdge>
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>`;

function createLifecycleHarness({ onSaveFromModeler, onSessionSync, onError }) {
  const saveCalls = [];
  const bpmnSync = {
    saveFromModeler: async (...args) => {
      saveCalls.push(["saveFromModeler", args]);
      return onSaveFromModeler();
    },
    saveFromXmlDraft: async (...args) => {
      saveCalls.push(["saveFromXmlDraft", args]);
      return onSaveFromModeler();
    },
  };
  const draft = {
    id: "sid_cfg_mut",
    bpmn_xml: MUTATION_XML,
    interview: { boundaries: { trigger: "", finish_state: "" }, steps: [], transitions: [], subprocesses: [] },
    nodes: [],
    edges: [],
  };
  const options = {
    sid: "sid_cfg_mut",
    isLocal: false,
    draft,
    bpmnSync,
    coordinator: null,
    projectionHelpers: PROJECTION_HELPERS,
    getBaseDiagramStateVersion: () => 6,
    rememberDiagramStateVersion: () => {},
    onSessionSync,
    onError,
  };
  return { options, saveCalls, draft };
}

function LifecycleHarness({ options, expose }) {
  const value = useDiagramMutationLifecycle(options);
  useEffect(() => {
    expose(value);
  }, [value, expose]);
  return null;
}

test("mutation-queue debounce is 350ms: queued diagram mutation does not commit early", async () => {
  const { root, cleanup } = setupDom();
  const syncs = [];
  const errors = [];
  let latest = null;
  const { options, saveCalls } = createLifecycleHarness({
    onSaveFromModeler: async () => ({ ok: true, xml: MUTATION_XML, storedRev: 2, diagramStateVersion: 7 }),
    onSessionSync: (patch) => syncs.push(patch),
    onError: (err) => errors.push(err),
  });

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

    // Раньше 350мс коммита быть не должно.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 150));
    });
    assert.equal(saveCalls.length, 0, "no save before 350ms debounce (useDiagramMutationLifecycle.js:229)");

    // После 350мс коммит отрабатывает ровно один раз.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 700));
    });
    assert.equal(saveCalls.length, 1, "exactly one commit after the 350ms debounce");
    assert.equal(errors.length, 0, `unexpected errors: ${JSON.stringify(errors)}`);
  } finally {
    await cleanup();
  }
});

// --- Этап 1: конфиги централизованы в bpmn/save/autosaveConfig.js -----------

test("autosaveConfig module exports frozen registry with reference values", async () => {
  const { AUTOSAVE_CONFIG } = await import("./autosaveConfig.js");
  assert.ok(AUTOSAVE_CONFIG, "AUTOSAVE_CONFIG must be exported from autosaveConfig.js");
  assert.ok(Object.isFrozen(AUTOSAVE_CONFIG), "registry must be frozen");
  assert.deepEqual(
    AUTOSAVE_CONFIG.coordinator,
    { debounceMs: 10_000, dragThrottleMs: 5000, dragFinalDebounceMs: 500 },
    "coordinator constants (bpmnWiring.js:210-213)",
  );
  assert.deepEqual(
    AUTOSAVE_CONFIG.mutationQueue,
    { debounceMs: 350 },
    "mutation-queue debounce (useDiagramMutationLifecycle.js:229; default useAutosaveQueue.js:9 = 380 НЕ трогаем)",
  );
  assert.deepEqual(
    AUTOSAVE_CONFIG.xmlPipeline,
    {
      debounceMs: 0,
      retryCount: 3,
      retryDelayMs: 1000,
      transportTimeoutMs: 10_000,
      maxRetryDelayMs: 4000,
    },
    "xml-pipeline constants (saveBpmnState.js:113-117)",
  );
});

test("consumers read autosave constants from the registry instead of inline literals", () => {
  const readSource = (relativePath) =>
    fs.readFileSync(path.join(__dirname, relativePath), "utf8");

  const wiringSrc = readSource("../stage/wiring/bpmnWiring.js");
  const mutationSrc = readSource("../../hooks/useDiagramMutationLifecycle.js");
  const saveStateSrc = readSource("../../../process/save/saveBpmnState.js");

  for (const [name, src] of [
    ["bpmnWiring.js", wiringSrc],
    ["useDiagramMutationLifecycle.js", mutationSrc],
    ["saveBpmnState.js", saveStateSrc],
  ]) {
    assert.match(
      src,
      /from\s+["'][^"']*autosaveConfig\.js["']/,
      `${name} must import AUTOSAVE_CONFIG from bpmn/save/autosaveConfig.js`,
    );
  }

  assert.doesNotMatch(wiringSrc, /debounceMs:\s*10_000/, "coordinator debounce must come from the registry");
  assert.doesNotMatch(wiringSrc, /dragThrottleMs:\s*5000/, "drag throttle must come from the registry");
  assert.doesNotMatch(wiringSrc, /dragFinalDebounceMs:\s*500/, "drag final debounce must come from the registry");
  assert.doesNotMatch(mutationSrc, /debounceMs:\s*350/, "mutation-queue debounce must come from the registry");
  assert.doesNotMatch(
    saveStateSrc,
    /debounceMs:\s*0,[\s\S]*?retryCount:\s*3,[\s\S]*?transportTimeoutMs:\s*10000/,
    "xml-pipeline config must come from the registry",
  );
});

// --- xml-pipeline конфиг saveCoordinator (saveBpmnState.js:113-117) ---------

test("xml pipeline registered by saveBpmnState has debounce 0/retry 3/backoff 1s/timeout 10s", () => {
  resetCasVersionTracker();
  const pipeline = saveCoordinator.pipelines.get("xml");
  assert.ok(pipeline, 'saveBpmnState must register the "xml" pipeline on the saveCoordinator singleton');
  assert.equal(pipeline.debounceMs, 0, "xml pipeline debounce (saveBpmnState.js:113)");
  assert.equal(pipeline.retryCount, 3, "xml pipeline retryCount (saveBpmnState.js:114)");
  assert.equal(pipeline.retryDelayMs, 1000, "xml pipeline backoff (saveBpmnState.js:115)");
  assert.equal(pipeline.transportTimeoutMs, 10000, "xml pipeline timeout (saveBpmnState.js:116)");
  assert.equal(pipeline.maxRetryDelayMs, 4000, "xml pipeline backoff cap (saveBpmnState.js:117)");
});

test("xml pipeline debounce 0 behavior: two rapid session saves hit transport twice without waiting", async () => {
  resetCasVersionTracker();
  const transports = [];
  const options = {
    operation: "session_save",
    sessionId: "sid_cfg_xml",
    baseDiagramStateVersion: 6,
    xml: "<bpmn:definitions id=\"one\"/>",
    nextMeta: {},
    apiPutBpmnXml: async (_sid, xml) => {
      transports.push(xml);
      return { ok: true, status: 200, diagramStateVersion: 7, storedRev: 5 };
    },
    onSessionSync: () => {},
  };

  const startedAt = Date.now();
  const first = await saveBpmnState({ ...options, xml: "<bpmn:definitions id=\"one\"/>" });
  const second = await saveBpmnState({ ...options, xml: "<bpmn:definitions id=\"two\"/>" });
  const elapsed = Date.now() - startedAt;

  assert.equal(first?.ok, true);
  assert.equal(second?.ok, true);
  assert.equal(transports.length, 2, "debounce 0: every save reaches transport immediately");
  assert.deepEqual(transports, [
    '<bpmn:definitions id="one"/>',
    '<bpmn:definitions id="two"/>',
  ]);
  assert.ok(elapsed < 1500, `two debounce-0 saves must not wait for a debounce window (elapsed=${elapsed}ms)`);
});
