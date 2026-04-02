import {
  getRobotMetaStatus,
  normalizeRobotMetaMap,
  robotMetaMissingFields,
} from "../process/robotmeta/robotMeta.js";
import { normalizeCamundaExtensionState, normalizeCamundaExtensionsMap } from "../process/camunda/camundaExtensions.js";

export const EXECUTION_BRIDGE_V1_VERSION = "v1";

export const EXECUTION_CLASSIFICATION = Object.freeze({
  HUMAN_ONLY: "human_only",
  ASSISTED: "assisted",
  ROBOT_READY: "robot_ready",
  SYSTEM_TRIGGERED: "system_triggered",
  BLOCKED: "blocked",
});

export const EXECUTION_BLOCKER_META = Object.freeze({
  missing_input_contract: "Не задан входной контракт шага.",
  missing_output_contract: "Не задан выходной контракт шага.",
  missing_system_binding: "Нет системной привязки для исполнения.",
  missing_trigger: "Не задан триггер/условие запуска.",
  missing_machine_readable_parameters: "Не заданы machine-readable параметры (action_key и т.п.).",
  missing_control_validation_point: "Не определена контрольная логика ветвления.",
  ambiguous_step_semantics: "Семантика шага слишком неоднозначна.",
  unsupported_bpmn_type: "BPMN-тип пока не поддержан в handoff-модели.",
});

const SUPPORTED_BPMN_TYPES = new Set([
  "task",
  "usertask",
  "servicetask",
  "manualtask",
  "scripttask",
  "businessruletask",
  "sendtask",
  "receivetask",
  "callactivity",
  "subprocess",
  "adhocsubprocess",
  "exclusivegateway",
  "inclusivegateway",
  "parallelgateway",
  "eventbasedgateway",
  "startevent",
  "intermediatecatchevent",
  "intermediatethrowevent",
  "boundaryevent",
  "endevent",
  "sequenceflow",
]);

const TASK_TYPES = new Set([
  "task",
  "usertask",
  "servicetask",
  "manualtask",
  "scripttask",
  "businessruletask",
  "sendtask",
  "receivetask",
  "callactivity",
  "subprocess",
  "adhocsubprocess",
]);

const GATEWAY_TYPES = new Set([
  "exclusivegateway",
  "inclusivegateway",
  "parallelgateway",
  "eventbasedgateway",
]);

const EVENT_TYPES = new Set([
  "startevent",
  "intermediatecatchevent",
  "intermediatethrowevent",
  "boundaryevent",
  "endevent",
]);

function asObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function asText(value) {
  return String(value || "").trim();
}

function shortText(value, limit = 160) {
  const text = asText(value);
  if (text.length <= limit) return text;
  return `${text.slice(0, Math.max(24, limit - 1)).trimEnd()}…`;
}

function localName(node) {
  return asText(node?.localName || "").toLowerCase();
}

function parseBpmnExecutionNodes(xmlTextRaw = "") {
  const xmlText = String(xmlTextRaw || "");
  const empty = { nodes: [], byId: {} };
  if (!xmlText.trim() || typeof DOMParser === "undefined") return empty;
  try {
    const doc = new DOMParser().parseFromString(xmlText, "application/xml");
    if (!doc || doc.getElementsByTagName("parsererror").length > 0) return empty;
    const all = asArray(doc.getElementsByTagName("*"));
    const byId = {};

    all.forEach((node) => {
      const type = localName(node);
      const id = asText(node?.getAttribute?.("id"));
      if (!id) return;
      if (!SUPPORTED_BPMN_TYPES.has(type)) return;
      const label = asText(node?.getAttribute?.("name")) || id;
      const outgoingIds = asArray(node?.getElementsByTagName?.("bpmn:outgoing"))
        .map((item) => asText(item?.textContent))
        .filter(Boolean);
      const eventDefinitions = asArray(node?.childNodes)
        .filter((item) => item?.nodeType === 1)
        .map((item) => localName(item))
        .filter((item) => item.endsWith("eventdefinition"));
      const conditionExpression = asArray(node?.childNodes)
        .find((item) => item?.nodeType === 1 && localName(item) === "conditionexpression");
      byId[id] = {
        id,
        label,
        bpmn_type: type,
        source_ref: asText(node?.getAttribute?.("sourceRef")),
        target_ref: asText(node?.getAttribute?.("targetRef")),
        default_flow: asText(node?.getAttribute?.("default")),
        outgoing_ids: outgoingIds,
        has_condition_expression: !!conditionExpression,
        event_definitions: eventDefinitions,
      };
    });

    return {
      nodes: Object.values(byId),
      byId,
    };
  } catch {
    return empty;
  }
}

function buildCamundaContractSignals(extensionStateRaw) {
  const state = normalizeCamundaExtensionState(extensionStateRaw);
  const properties = asArray(state?.properties?.extensionProperties);
  const listeners = asArray(state?.properties?.extensionListeners);
  const preserved = asArray(state?.preservedExtensionElements);
  const ioLike = preserved.filter((row) => asText(row?.type || "").toLowerCase().includes("inputoutput"));
  return {
    properties_count: properties.length,
    listeners_count: listeners.length,
    io_nodes_count: ioLike.length,
    has_contract_signal: properties.length > 0 || listeners.length > 0 || ioLike.length > 0,
  };
}

function toBlockerList(rawList = []) {
  const seen = new Set();
  return rawList
    .map((item) => asText(item))
    .filter((item) => {
      if (!item) return false;
      if (seen.has(item)) return false;
      seen.add(item);
      return true;
    });
}

export function classifyExecutionNodeV1({
  nodeRaw,
  robotMetaRaw = null,
  camundaExtensionStateRaw = null,
} = {}) {
  const node = asObject(nodeRaw);
  const bpmnType = asText(node.bpmn_type).toLowerCase();
  const blockers = [];
  const robotMeta = robotMetaRaw && typeof robotMetaRaw === "object" ? robotMetaRaw : null;
  const robotStatus = getRobotMetaStatus(robotMeta);
  const robotMissing = robotMeta ? robotMetaMissingFields(robotMeta) : [];
  const exec = asObject(robotMeta?.exec);
  const mat = asObject(robotMeta?.mat);
  const mode = asText(exec.mode).toLowerCase() || "human";
  const executor = asText(exec.executor).toLowerCase();
  const actionKey = asText(exec.action_key);
  const inputsCount = asArray(mat.inputs).length;
  const outputsCount = asArray(mat.outputs).length;
  const camundaSignals = buildCamundaContractSignals(camundaExtensionStateRaw);
  const hasSystemBinding = !!executor && executor !== "manual_ui";
  const hasSystemTrigger = EVENT_TYPES.has(bpmnType)
    && asArray(node.event_definitions).some((item) => (
      item.includes("message")
      || item.includes("signal")
      || item.includes("timer")
      || item.includes("conditional")
    ));

  if (!SUPPORTED_BPMN_TYPES.has(bpmnType)) {
    blockers.push("unsupported_bpmn_type");
  }

  if (TASK_TYPES.has(bpmnType) && !asText(node.label)) {
    blockers.push("ambiguous_step_semantics");
  }

  if (hasSystemTrigger) {
    return {
      classification: EXECUTION_CLASSIFICATION.SYSTEM_TRIGGERED,
      blockers: toBlockerList(blockers),
      rationale: "Событие привязано к системному trigger/event-definition.",
      contracts: {
        robot_status: robotStatus,
        robot_mode: mode,
        executor: executor || null,
        action_key: actionKey || null,
        inputs_count: inputsCount,
        outputs_count: outputsCount,
        camunda_contract_signal: camundaSignals.has_contract_signal,
      },
    };
  }

  if (bpmnType === "sequenceflow") {
    if (node.has_condition_expression) {
      return {
        classification: EXECUTION_CLASSIFICATION.SYSTEM_TRIGGERED,
        blockers: toBlockerList(blockers),
        rationale: "Sequence Flow управляется conditionExpression.",
        contracts: {
          robot_status: robotStatus,
          robot_mode: mode,
          executor: executor || null,
          action_key: actionKey || null,
          inputs_count: inputsCount,
          outputs_count: outputsCount,
          camunda_contract_signal: camundaSignals.has_contract_signal,
        },
      };
    }
    return {
      classification: blockers.length ? EXECUTION_CLASSIFICATION.BLOCKED : EXECUTION_CLASSIFICATION.HUMAN_ONLY,
      blockers: toBlockerList(blockers),
      rationale: blockers.length
        ? "Flow заблокирован до устранения blocker-условий."
        : "Sequence Flow без условий трактуется как ручная/визуальная связка.",
      contracts: {
        robot_status: robotStatus,
        robot_mode: mode,
        executor: executor || null,
        action_key: actionKey || null,
        inputs_count: inputsCount,
        outputs_count: outputsCount,
        camunda_contract_signal: camundaSignals.has_contract_signal,
      },
    };
  }

  if (GATEWAY_TYPES.has(bpmnType)) {
    const outgoingCount = asArray(node.outgoing_ids).length;
    const hasDefault = !!asText(node.default_flow);
    if (outgoingCount < 2 && !hasDefault) {
      blockers.push("missing_control_validation_point");
    }
    return {
      classification: blockers.length ? EXECUTION_CLASSIFICATION.BLOCKED : EXECUTION_CLASSIFICATION.ASSISTED,
      blockers: toBlockerList(blockers),
      rationale: blockers.length
        ? "Gateway не готов к handoff из-за неявной контрольной логики."
        : "Gateway требует контекстной логики, классифицирован как assisted.",
      contracts: {
        robot_status: robotStatus,
        robot_mode: mode,
        executor: executor || null,
        action_key: actionKey || null,
        inputs_count: inputsCount,
        outputs_count: outputsCount,
        camunda_contract_signal: camundaSignals.has_contract_signal,
      },
    };
  }

  if (TASK_TYPES.has(bpmnType)) {
    const modeIsMachineLike = mode === "machine" || mode === "hybrid";
    if (modeIsMachineLike && !hasSystemBinding) blockers.push("missing_system_binding");
    if (modeIsMachineLike && !actionKey) blockers.push("missing_machine_readable_parameters");
    if (modeIsMachineLike && (inputsCount <= 0)) blockers.push("missing_input_contract");
    if (modeIsMachineLike && (outputsCount <= 0)) blockers.push("missing_output_contract");

    const blockersList = toBlockerList([...blockers, ...robotMissing
      .filter((field) => field === "action_key" || field === "executor")
      .map((field) => (field === "action_key" ? "missing_machine_readable_parameters" : "missing_system_binding"))]);

    if (blockersList.length) {
      return {
        classification: EXECUTION_CLASSIFICATION.BLOCKED,
        blockers: blockersList,
        rationale: "Шаг ориентирован на robotization, но контракт неполный.",
        contracts: {
          robot_status: robotStatus,
          robot_mode: mode,
          executor: executor || null,
          action_key: actionKey || null,
          inputs_count: inputsCount,
          outputs_count: outputsCount,
          camunda_contract_signal: camundaSignals.has_contract_signal,
        },
      };
    }

    if (mode === "machine" && robotStatus === "ready") {
      return {
        classification: EXECUTION_CLASSIFICATION.ROBOT_READY,
        blockers: [],
        rationale: "Шаг имеет machine-mode с полным robot-meta контрактом.",
        contracts: {
          robot_status: robotStatus,
          robot_mode: mode,
          executor: executor || null,
          action_key: actionKey || null,
          inputs_count: inputsCount,
          outputs_count: outputsCount,
          camunda_contract_signal: camundaSignals.has_contract_signal,
        },
      };
    }

    if (mode === "hybrid" || camundaSignals.has_contract_signal) {
      return {
        classification: EXECUTION_CLASSIFICATION.ASSISTED,
        blockers: [],
        rationale: "Шаг имеет системные сигналы/гибридный режим и классифицирован как assisted.",
        contracts: {
          robot_status: robotStatus,
          robot_mode: mode,
          executor: executor || null,
          action_key: actionKey || null,
          inputs_count: inputsCount,
          outputs_count: outputsCount,
          camunda_contract_signal: camundaSignals.has_contract_signal,
        },
      };
    }

    return {
      classification: EXECUTION_CLASSIFICATION.HUMAN_ONLY,
      blockers: [],
      rationale: "Шаг остаётся human_only: системного execution-контракта недостаточно.",
      contracts: {
        robot_status: robotStatus,
        robot_mode: mode,
        executor: executor || null,
        action_key: actionKey || null,
        inputs_count: inputsCount,
        outputs_count: outputsCount,
        camunda_contract_signal: camundaSignals.has_contract_signal,
      },
    };
  }

  if (EVENT_TYPES.has(bpmnType)) {
    if (bpmnType === "startevent" && !hasSystemTrigger) {
      return {
        classification: EXECUTION_CLASSIFICATION.HUMAN_ONLY,
        blockers: toBlockerList(blockers),
        rationale: "Start Event без системного trigger трактуется как human_only.",
        contracts: {
          robot_status: robotStatus,
          robot_mode: mode,
          executor: executor || null,
          action_key: actionKey || null,
          inputs_count: inputsCount,
          outputs_count: outputsCount,
          camunda_contract_signal: camundaSignals.has_contract_signal,
        },
      };
    }
    return {
      classification: blockers.length ? EXECUTION_CLASSIFICATION.BLOCKED : EXECUTION_CLASSIFICATION.ASSISTED,
      blockers: toBlockerList(blockers),
      rationale: blockers.length
        ? "Событие заблокировано до устранения blocker-условий."
        : "Событие требует контекстной обработки и классифицировано как assisted.",
      contracts: {
        robot_status: robotStatus,
        robot_mode: mode,
        executor: executor || null,
        action_key: actionKey || null,
        inputs_count: inputsCount,
        outputs_count: outputsCount,
        camunda_contract_signal: camundaSignals.has_contract_signal,
      },
    };
  }

  return {
    classification: EXECUTION_CLASSIFICATION.BLOCKED,
    blockers: toBlockerList([...blockers, "unsupported_bpmn_type"]),
    rationale: "Тип BPMN пока не поддержан execution bridge v1.",
    contracts: {
      robot_status: robotStatus,
      robot_mode: mode,
      executor: executor || null,
      action_key: actionKey || null,
      inputs_count: inputsCount,
      outputs_count: outputsCount,
      camunda_contract_signal: camundaSignals.has_contract_signal,
    },
  };
}

export function buildExecutionBridgeSummaryV1(nodeEntriesRaw = []) {
  const entries = asArray(nodeEntriesRaw);
  const counts = {
    total_nodes: entries.length,
    human_only: 0,
    assisted: 0,
    robot_ready: 0,
    system_triggered: 0,
    blocked: 0,
  };
  const blockerStats = {};
  entries.forEach((entry) => {
    const cls = asText(entry?.execution_classification);
    if (Object.prototype.hasOwnProperty.call(counts, cls)) {
      counts[cls] += 1;
    }
    asArray(entry?.blockers).forEach((code) => {
      const key = asText(code);
      if (!key) return;
      blockerStats[key] = Number(blockerStats[key] || 0) + 1;
    });
  });
  const topBlockers = Object.keys(blockerStats)
    .sort((a, b) => Number(blockerStats[b] || 0) - Number(blockerStats[a] || 0) || a.localeCompare(b, "en"))
    .map((code) => ({
      code,
      count: Number(blockerStats[code] || 0),
      message: EXECUTION_BLOCKER_META[code] || code,
    }));
  const overall = counts.blocked > 0
    ? "blocked_by_contracts"
    : (counts.robot_ready > 0 ? "ready_with_scope" : "not_ready");
  return {
    ...counts,
    top_blockers: topBlockers,
    overall_handoff_verdict: overall,
  };
}

export function buildExecutionBridgeProjectionV1({
  sessionId = "",
  projectId = "",
  bpmnXml = "",
  bpmnMeta = {},
} = {}) {
  const parsed = parseBpmnExecutionNodes(bpmnXml);
  const robotMetaByElementId = normalizeRobotMetaMap(asObject(asObject(bpmnMeta).robot_meta_by_element_id));
  const camundaMap = normalizeCamundaExtensionsMap(asObject(asObject(bpmnMeta).camunda_extensions_by_element_id));
  const generatedAt = new Date().toISOString();
  const nodeEntries = parsed.nodes.map((node) => {
    const robotMeta = robotMetaByElementId[node.id] || null;
    const camundaState = camundaMap[node.id] || null;
    const decision = classifyExecutionNodeV1({
      nodeRaw: node,
      robotMetaRaw: robotMeta,
      camundaExtensionStateRaw: camundaState,
    });
    return {
      node_id: node.id,
      node_label: shortText(node.label || node.id, 220),
      bpmn_type: node.bpmn_type,
      execution_classification: decision.classification,
      blockers: asArray(decision.blockers),
      blocker_messages: asArray(decision.blockers).map((code) => EXECUTION_BLOCKER_META[code] || code),
      rationale: shortText(decision.rationale, 240),
      contracts: asObject(decision.contracts),
      refs: {
        source_ref: asText(node.source_ref),
        target_ref: asText(node.target_ref),
        default_flow: asText(node.default_flow),
      },
    };
  });

  const summary = buildExecutionBridgeSummaryV1(nodeEntries);
  const nodesById = {};
  nodeEntries.forEach((entry) => {
    nodesById[String(entry.node_id || "")] = entry;
  });

  return {
    version: EXECUTION_BRIDGE_V1_VERSION,
    generated_at: generatedAt,
    source: {
      session_id: asText(sessionId),
      project_id: asText(projectId),
      bpmn_xml_length: String(bpmnXml || "").length,
    },
    summary,
    blocker_catalog: EXECUTION_BLOCKER_META,
    nodes: nodeEntries,
    nodes_by_id: nodesById,
  };
}
