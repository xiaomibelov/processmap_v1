import assert from "node:assert/strict";
import test from "node:test";

import {
  EXECUTION_CLASSIFICATION,
  buildExecutionBridgeSummaryV1,
  buildExecutionBridgeProjectionV1,
  classifyExecutionNodeV1,
} from "./executionBridgeV1.js";

function machineReadyRobotMeta() {
  return {
    robot_meta_version: "v1",
    exec: {
      mode: "machine",
      executor: "node_red",
      action_key: "prep.mix",
      timeout_sec: 120,
      retry: { max_attempts: 1, backoff_sec: 0 },
    },
    mat: {
      from_zone: null,
      to_zone: null,
      inputs: [{ key: "ingredient", type: "string" }],
      outputs: [{ key: "container", type: "string" }],
    },
    qc: {
      critical: false,
      checks: [],
    },
  };
}

test("machine-ready task is classified as robot_ready", () => {
  const result = classifyExecutionNodeV1({
    nodeRaw: {
      id: "Task_A",
      label: "Смешивание",
      bpmn_type: "task",
      outgoing_ids: [],
      has_condition_expression: false,
      event_definitions: [],
    },
    robotMetaRaw: machineReadyRobotMeta(),
    camundaExtensionStateRaw: {
      properties: {
        extensionProperties: [{ id: "p1", name: "temperature", value: "65" }],
        extensionListeners: [],
      },
      preservedExtensionElements: [],
    },
  });

  assert.equal(result.classification, EXECUTION_CLASSIFICATION.ROBOT_READY);
  assert.deepEqual(result.blockers, []);
});

test("machine task without action/system/io contracts is blocked with explicit blocker list", () => {
  const result = classifyExecutionNodeV1({
    nodeRaw: {
      id: "Task_B",
      label: "Упаковка",
      bpmn_type: "task",
      outgoing_ids: [],
      has_condition_expression: false,
      event_definitions: [],
    },
    robotMetaRaw: {
      robot_meta_version: "v1",
      exec: {
        mode: "machine",
        executor: "manual_ui",
        action_key: "",
      },
      mat: {
        inputs: [],
        outputs: [],
      },
      qc: {},
    },
    camundaExtensionStateRaw: null,
  });

  assert.equal(result.classification, EXECUTION_CLASSIFICATION.BLOCKED);
  assert.ok(result.blockers.includes("missing_system_binding"));
  assert.ok(result.blockers.includes("missing_machine_readable_parameters"));
  assert.ok(result.blockers.includes("missing_input_contract"));
  assert.ok(result.blockers.includes("missing_output_contract"));
});

test("event with message/signal/timer definition is classified as system_triggered", () => {
  const result = classifyExecutionNodeV1({
    nodeRaw: {
      id: "Event_1",
      label: "Старт по сообщению",
      bpmn_type: "startevent",
      outgoing_ids: [],
      has_condition_expression: false,
      event_definitions: ["messageeventdefinition"],
    },
    robotMetaRaw: null,
    camundaExtensionStateRaw: null,
  });

  assert.equal(result.classification, EXECUTION_CLASSIFICATION.SYSTEM_TRIGGERED);
});

test("gateway without explicit control signal is blocked by control/validation blocker", () => {
  const result = classifyExecutionNodeV1({
    nodeRaw: {
      id: "Gateway_1",
      label: "Проверка",
      bpmn_type: "exclusivegateway",
      outgoing_ids: ["Flow_1"],
      default_flow: "",
      has_condition_expression: false,
      event_definitions: [],
    },
    robotMetaRaw: null,
    camundaExtensionStateRaw: null,
  });

  assert.equal(result.classification, EXECUTION_CLASSIFICATION.BLOCKED);
  assert.ok(result.blockers.includes("missing_control_validation_point"));
});

test("summary aggregates classes and top blockers from node decisions", () => {
  const summary = buildExecutionBridgeSummaryV1([
    { execution_classification: "robot_ready", blockers: [] },
    { execution_classification: "assisted", blockers: [] },
    { execution_classification: "blocked", blockers: ["missing_input_contract", "missing_output_contract"] },
    { execution_classification: "blocked", blockers: ["missing_input_contract"] },
  ]);

  assert.equal(summary.total_nodes, 4);
  assert.equal(summary.robot_ready, 1);
  assert.equal(summary.assisted, 1);
  assert.equal(summary.blocked, 2);
  assert.equal(summary.overall_handoff_verdict, "blocked_by_contracts");
  assert.equal(summary.top_blockers[0].code, "missing_input_contract");
  assert.equal(summary.top_blockers[0].count, 2);
});

test("projection remains machine-readable even without DOMParser runtime", () => {
  const originalDOMParser = globalThis.DOMParser;
  try {
    globalThis.DOMParser = undefined;
    const projection = buildExecutionBridgeProjectionV1({
      sessionId: "sess-1",
      projectId: "proj-1",
      bpmnXml: "<bpmn:definitions/>",
      bpmnMeta: {},
    });
    assert.equal(projection.version, "v1");
    assert.equal(projection.source.session_id, "sess-1");
    assert.equal(projection.source.project_id, "proj-1");
    assert.ok(typeof projection.generated_at === "string" && projection.generated_at.length > 0);
    assert.deepEqual(projection.nodes, []);
    assert.equal(projection.summary.total_nodes, 0);
    assert.equal(projection.summary.overall_handoff_verdict, "not_ready");
  } finally {
    globalThis.DOMParser = originalDOMParser;
  }
});
