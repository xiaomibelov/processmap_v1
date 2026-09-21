import test from "node:test";
import assert from "node:assert/strict";

import { createXmlPipelineConfig } from "./saveBpmnState.js";
import {
  getSaveDiagnosticsTrail,
  __resetSaveDiagnosticsForTests,
} from "../../session/saveDiagnosticsTrail.js";

// ---------------------------------------------------------------------------
// Контур fix/canvas-nan-di-stuck-drag, P0-2 (transport gate): прямой путь
// apiPutBpmnXml (фолбэк xml pipeline без flushSave) обязан так же fail-closed
// блокировать нефинитные DI-координаты — запись "NaN" в PUT запрещена.
// ---------------------------------------------------------------------------

const NAN_XML =
  '<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" ' +
  'xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" ' +
  'xmlns:di="http://www.omg.org/spec/DD/20100524/DI">' +
  '<bpmndi:BPMNDiagram id="D1"><bpmndi:BPMNPlane id="P1" bpmnElement="Process_1">' +
  '<bpmndi:BPMNEdge id="Flow_1_di" bpmnElement="Flow_1">' +
  '<di:waypoint x="Infinity" y="140"/><di:waypoint x="380" y="140"/>' +
  '</bpmndi:BPMNEdge>' +
  '</bpmndi:BPMNPlane></bpmndi:BPMNDiagram></bpmn:definitions>';

const HEALTHY_XML = NAN_XML.replace('x="Infinity"', 'x="200"');

test("P0-2: transport apiPutBpmnXml с нефинитным DI — заблокирован, PUT не вызван", async () => {
  __resetSaveDiagnosticsForTests();
  const putCalls = [];
  const config = createXmlPipelineConfig();
  const result = await config.transport("sid_t", {
    xml: NAN_XML,
    sourceAction: "manual",
    apiPutBpmnXml: async (...args) => {
      putCalls.push(args);
      return { ok: true };
    },
  });
  assert.equal(result.ok, false);
  assert.equal(result.errorCode, "non_finite_di_blocked");
  assert.equal(putCalls.length, 0);
  const trail = getSaveDiagnosticsTrail();
  assert.ok(trail.some((e) => e.type === "non_finite_di_blocked"));
});

test("P0-2: transport apiPutBpmnXml со здоровым XML — проходит", async () => {
  __resetSaveDiagnosticsForTests();
  const putCalls = [];
  const config = createXmlPipelineConfig();
  const result = await config.transport("sid_t", {
    xml: HEALTHY_XML,
    sourceAction: "manual",
    apiPutBpmnXml: async (...args) => {
      putCalls.push(args);
      return { ok: true };
    },
  });
  assert.equal(result.ok, true);
  assert.equal(putCalls.length, 1);
});
