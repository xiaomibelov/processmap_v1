import test from "node:test";
import assert from "node:assert/strict";

import createBpmnCoordinator from "./createBpmnCoordinator.js";
import {
  getSaveDiagnosticsTrail,
  __resetSaveDiagnosticsForTests,
} from "../../../session/saveDiagnosticsTrail.js";

// ---------------------------------------------------------------------------
// Контур fix/canvas-nan-di-stuck-drag, P0-2 (full-save gate): запись "NaN"
// в PUT /bpmn запрещена (RC3 аудита canvas-drag-stuck-after-1008 — durable
// XML сессии 2ce69bd74c содержит di:waypoint x="NaN"). Choke point всех
// full-save — doFlush: нефинитные DI-координаты → fail-closed
// (ok:false, errorCode "non_finite_di_blocked"), persistRaw НЕ вызывается,
// событие фиксируется в saveDiagnosticsTrail.
// ---------------------------------------------------------------------------

if (typeof globalThis.window === "undefined") {
  globalThis.window = globalThis;
}

const NAN_XML =
  '<?xml version="1.0" encoding="UTF-8"?>' +
  '<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" ' +
  'xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" ' +
  'xmlns:di="http://www.omg.org/spec/DD/20100524/DI" id="Defs_1" targetNamespace="http://bpmn.io/schema/bpmn">' +
  '<bpmn:process id="Process_1"><bpmn:task id="Task_1"/></bpmn:process>' +
  '<bpmndi:BPMNDiagram id="D1"><bpmndi:BPMNPlane id="P1" bpmnElement="Process_1">' +
  '<bpmndi:BPMNShape id="Task_1_di" bpmnElement="Task_1">' +
  '<di:Bounds x="100" y="100" width="100" height="80"/></bpmndi:BPMNShape>' +
  '<bpmndi:BPMNEdge id="Flow_1_di" bpmnElement="Flow_1">' +
  '<di:waypoint x="NaN" y="NaN"/><di:waypoint x="380" y="140"/>' +
  '</bpmndi:BPMNEdge>' +
  '</bpmndi:BPMNPlane></bpmndi:BPMNDiagram></bpmn:definitions>';

const HEALTHY_XML = NAN_XML.replace('x="NaN" y="NaN"', 'x="200" y="140"');

function createStore(initial = {}) {
  let state = {
    xml: "<bpmn:definitions/>",
    rev: 1,
    dirty: true,
    lastSavedRev: 0,
    lastHash: "",
    ...initial,
  };
  return {
    getState: () => state,
    setXml: (xml, source, options = {}) => {
      state = {
        ...state,
        xml,
        dirty: options?.dirty !== false,
        rev: options?.bumpRev === false ? state.rev : state.rev + 1,
      };
      return state;
    },
    markSaved: (rev, hash) => {
      state = { ...state, lastSavedRev: rev, lastHash: hash, dirty: false };
    },
  };
}

function createRuntime(xml = HEALTHY_XML) {
  let token = 1;
  return {
    getStatus: () => ({ ready: true, defs: true, token }),
    getXml: async () => ({ ok: true, xml, token }),
    onChange: () => () => {},
    onStatus: () => () => {},
  };
}

function createPersistence(persistCalls) {
  return {
    saveRaw: async (sid, xml, rev, reason) => {
      persistCalls.push({ sid, xml, rev, reason });
      return { ok: true, storedRev: rev, hash: "hash" };
    },
    cacheRaw: () => ({ ok: true }),
    loadRaw: async () => ({ ok: true, xml: "", rev: 0 }),
  };
}

test("P0-2: flushSave с NaN-waypoint в xmlOverride — PUT заблокирован, persistRaw не вызван", async () => {
  __resetSaveDiagnosticsForTests();
  const persistCalls = [];
  const coordinator = createBpmnCoordinator({
    store: createStore(),
    getRuntime: () => createRuntime(),
    getSessionId: () => "sid_nan",
    debounceMs: 10_000,
    persistence: createPersistence(persistCalls),
  });

  const result = await coordinator.flushSave("manual", { xmlOverride: NAN_XML });

  assert.equal(result.ok, false);
  assert.equal(result.errorCode, "non_finite_di_blocked");
  assert.equal(persistCalls.length, 0);
  const trail = getSaveDiagnosticsTrail();
  assert.ok(
    trail.some((e) => e.type === "non_finite_di_blocked"),
    "ожидалась запись non_finite_di_blocked в diagnostics trail",
  );
  coordinator.destroy();
});

test("P0-2: flushSave с NaN-waypoint из runtime.getXml — PUT заблокирован", async () => {
  __resetSaveDiagnosticsForTests();
  const persistCalls = [];
  const coordinator = createBpmnCoordinator({
    store: createStore(),
    getRuntime: () => createRuntime(NAN_XML),
    getSessionId: () => "sid_nan_runtime",
    debounceMs: 10_000,
    persistence: createPersistence(persistCalls),
  });

  const result = await coordinator.flushSave("autosave");

  assert.equal(result.ok, false);
  assert.equal(result.errorCode, "non_finite_di_blocked");
  assert.equal(persistCalls.length, 0);
  coordinator.destroy();
});

test("P0-2: здоровый XML проходит gate и сохраняется (regression sanity)", async () => {
  __resetSaveDiagnosticsForTests();
  const persistCalls = [];
  const coordinator = createBpmnCoordinator({
    store: createStore(),
    getRuntime: () => createRuntime(),
    getSessionId: () => "sid_healthy",
    debounceMs: 10_000,
    persistence: createPersistence(persistCalls),
  });

  const result = await coordinator.flushSave("manual", { xmlOverride: HEALTHY_XML });

  assert.equal(result.ok, true);
  assert.equal(persistCalls.length, 1);
  const trail = getSaveDiagnosticsTrail();
  assert.equal(trail.filter((e) => e.type === "non_finite_di_blocked").length, 0);
  coordinator.destroy();
});
