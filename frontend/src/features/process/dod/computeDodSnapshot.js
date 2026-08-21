import { normalizeElementNotesMap } from "../../notes/elementNotes";
import { buildInterviewGraphModel } from "../../../components/process/interview/graph/buildGraphModel";
import { buildInterviewModel } from "../../../components/process/interview/model/buildInterviewModel";
import { buildTimelineView } from "../../../components/process/interview/timelineViewModel";
import { normalizeAiQuestionsByElementMap } from "../../../components/process/interview/utils";
import { parseStepTimeModel, formatTimeModelLabel } from "../lib/timeModel";
import { buildRVariants } from "../rtiers/buildRVariants";

const BPMN_NODE_LOCAL_NAMES = new Set([
  "task",
  "usertask",
  "servicetask",
  "sendtask",
  "receivetask",
  "manualtask",
  "scripttask",
  "businessruletask",
  "callactivity",
  "subprocess",
  "adhocsubprocess",
  "startevent",
  "endevent",
  "intermediatecatchevent",
  "intermediatethrowevent",
  "boundaryevent",
  "exclusivegateway",
  "parallelgateway",
  "inclusivegateway",
  "eventbasedgateway",
  "complexgateway",
]);

const LANE_ELEMENT_TYPES = new Set([
  "task",
  "usertask",
  "servicetask",
  "sendtask",
  "receivetask",
  "manualtask",
  "scripttask",
  "businessruletask",
  "callactivity",
  "subprocess",
  "adhocsubprocess",
  "startevent",
  "endevent",
  "intermediatecatchevent",
  "intermediatethrowevent",
  "boundaryevent",
  "exclusivegateway",
  "parallelgateway",
  "inclusivegateway",
  "eventbasedgateway",
  "complexgateway",
]);

function toText(value) {
  return String(value || "").trim();
}

function toArray(value) {
  return Array.isArray(value) ? value : [];
}

function asObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function normalizeLoose(value) {
  return toText(value).toLowerCase().replace(/\s+/g, " ").trim();
}

function toPositiveInt(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.round(n);
}

function toNonNegativeInt(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.round(n);
}

function hasFilledValue(value) {
  return value !== null && value !== undefined && toText(value) !== "";
}

function pickPositiveInt(...values) {
  for (let i = 0; i < values.length; i += 1) {
    const n = toPositiveInt(values[i]);
    if (n > 0) return n;
  }
  return 0;
}

function normalizeFlowTier(raw) {
  const tier = toText(raw).toUpperCase();
  if (tier === "P0" || tier === "P1" || tier === "P2") return tier;
  return "";
}

function normalizeRFlowTier(raw) {
  const tier = toText(raw).toUpperCase();
  if (tier === "R0" || tier === "R1" || tier === "R2") return tier;
  return "";
}

function normalizeFlowMetaMap(rawFlowMeta) {
  const source = asObject(rawFlowMeta);
  const out = {};
  Object.keys(source).forEach((flowIdRaw) => {
    const flowId = toText(flowIdRaw);
    if (!flowId) return;
    const row = asObject(source[flowIdRaw]);
    const tier = normalizeFlowTier(row?.tier || (row?.happy ? "P0" : ""));
    const rtier = normalizeRFlowTier(row?.rtier);
    if (!tier && !rtier) return;
    const next = {};
    if (tier) next.tier = tier;
    if (rtier) next.rtier = rtier;
    const sourceTag = toText(row?.source).toLowerCase();
    if (rtier && (sourceTag === "manual" || sourceTag === "inferred")) next.source = sourceTag;
    if (rtier) {
      const scopeStartId = toText(row?.scopeStartId || row?.scope_start_id);
      const algoVersion = toText(row?.algoVersion || row?.algo_version);
      const computedAtIso = toText(row?.computedAtIso || row?.computed_at_iso);
      const reason = toText(row?.reason);
      if (scopeStartId) next.scopeStartId = scopeStartId;
      if (algoVersion) next.algoVersion = algoVersion;
      if (computedAtIso) next.computedAtIso = computedAtIso;
      if (reason) next.reason = reason;
    }
    out[flowId] = next;
  });
  return out;
}

function resolveFlowTier(flowIdRaw, flowMetaMap) {
  const flowId = toText(flowIdRaw);
  if (!flowId) return "None";
  const tier = normalizeFlowTier(asObject(flowMetaMap)[flowId]?.tier);
  return tier || "None";
}

function resolveFlowRtier(flowIdRaw, flowMetaMap) {
  const flowId = toText(flowIdRaw);
  if (!flowId) return "";
  return normalizeRFlowTier(asObject(flowMetaMap)[flowId]?.rtier);
}

function readNodeStepTimeSeconds(nodeRaw) {
  const node = asObject(nodeRaw);
  const params = asObject(node?.parameters);
  const explicitSeconds = pickPositiveInt(
    node?.step_time_sec,
    node?.stepTimeSec,
    node?.duration_sec,
    node?.durationSec,
    params?.step_time_sec,
    params?.stepTimeSec,
    params?.duration_sec,
    params?.durationSec,
  );
  if (explicitSeconds > 0) return explicitSeconds;
  const minutes = pickPositiveInt(
    node?.step_time_min,
    node?.stepTimeMin,
    node?.duration_min,
    node?.durationMin,
    params?.step_time_min,
    params?.stepTimeMin,
    params?.duration_min,
    params?.durationMin,
    params?.duration,
  );
  if (minutes <= 0) return 0;
  return Math.round(minutes * 60);
}

function buildNodeStepTimeSecByNodeId(draftRaw) {
  const out = {};
  toArray(asObject(draftRaw)?.nodes).forEach((nodeRaw) => {
    const node = asObject(nodeRaw);
    const nodeId = toText(node?.id);
    if (!nodeId) return;
    const params = asObject(node?.parameters);
    const hasTime = [
      node?.step_time_sec,
      node?.stepTimeSec,
      node?.duration_sec,
      node?.durationSec,
      node?.step_time_min,
      node?.stepTimeMin,
      node?.duration_min,
      node?.durationMin,
      params?.step_time_sec,
      params?.stepTimeSec,
      params?.duration_sec,
      params?.durationSec,
      params?.step_time_min,
      params?.stepTimeMin,
      params?.duration_min,
      params?.durationMin,
      params?.duration,
    ].some(hasFilledValue);
    if (!hasTime) return;
    out[nodeId] = readNodeStepTimeSeconds(node);
  });
  return out;
}

function xmlLocalName(node) {
  const localName = toText(node?.localName);
  if (localName) return localName.toLowerCase();
  const nodeName = toText(node?.nodeName);
  if (!nodeName) return "";
  return nodeName.split(":").pop().toLowerCase();
}

function collectElementsByLocalNames(root, names) {
  if (!root || typeof root.getElementsByTagName !== "function") return [];
  const allowed = new Set(toArray(names).map((name) => normalizeLoose(name)));
  return Array.from(root.getElementsByTagName("*")).filter((node) => allowed.has(xmlLocalName(node)));
}

function findAncestorLocalName(node, targetLocalName) {
  const target = normalizeLoose(targetLocalName);
  let cur = node?.parentNode || null;
  while (cur) {
    if (normalizeLoose(xmlLocalName(cur)) === target) return cur;
    cur = cur.parentNode || null;
  }
  return null;
}

function fnv1aHex(input) {
  const src = String(input || "");
  let hash = 0x811c9dc5;
  for (let i = 0; i < src.length; i += 1) {
    hash ^= src.charCodeAt(i);
    hash = Math.imul(hash >>> 0, 0x01000193) >>> 0;
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function parseBpmnFacts(xmlText) {
  const raw = String(xmlText || "").trim();
  const empty = {
    nodes: [],
    nodeById: {},
    flows: [],
    lanes: [],
    pools: [],
    annotationsCount: 0,
    laneByNodeId: {},
    linkEvents: [],
  };
  if (!raw || typeof DOMParser === "undefined") return empty;

  let doc;
  try {
    doc = new DOMParser().parseFromString(raw, "application/xml");
  } catch {
    return empty;
  }
  if (!doc || doc.getElementsByTagName("parsererror").length > 0) return empty;

  const pools = collectElementsByLocalNames(doc, ["participant"]).map((el, idx) => ({
    poolId: toText(el.getAttribute("id")) || `pool_${idx + 1}`,
    poolName: toText(el.getAttribute("name")) || toText(el.getAttribute("processRef")) || `Pool ${idx + 1}`,
    processRef: toText(el.getAttribute("processRef")),
    order: idx + 1,
  }));
  const poolByProcessRef = {};
  pools.forEach((pool) => {
    const processRef = toText(pool?.processRef);
    if (!processRef || poolByProcessRef[processRef]) return;
    poolByProcessRef[processRef] = pool;
  });

  const nodes = [];
  const nodeById = {};
  const nodeOrder = {};
  const linkEvents = [];
  let nodeCursor = 0;
  collectElementsByLocalNames(doc, Array.from(BPMN_NODE_LOCAL_NAMES)).forEach((nodeEl) => {
    const nodeId = toText(nodeEl.getAttribute("id"));
    if (!nodeId || nodeById[nodeId]) return;
    const localType = xmlLocalName(nodeEl);
    const processEl = findAncestorLocalName(nodeEl, "process");
    const processId = toText(processEl?.getAttribute?.("id"));
    const pool = processId ? poolByProcessRef[processId] : null;
    nodeCursor += 1;
    const row = {
      id: nodeId,
      name: toText(nodeEl.getAttribute("name")) || nodeId,
      type: localType,
      processId,
      poolId: toText(pool?.poolId),
      poolName: toText(pool?.poolName),
      order: nodeCursor,
    };
    const linkEventDefinition = collectElementsByLocalNames(nodeEl, ["linkeventdefinition"])[0];
    if (linkEventDefinition && (localType === "intermediatethrowevent" || localType === "intermediatecatchevent")) {
      const linkName = toText(linkEventDefinition.getAttribute("name")) || toText(nodeEl.getAttribute("name")) || nodeId;
      linkEvents.push({
        nodeId,
        nodeType: localType,
        role: localType === "intermediatethrowevent" ? "throw" : "catch",
        linkName,
      });
    }
    nodes.push(row);
    nodeById[nodeId] = row;
    nodeOrder[nodeId] = nodeCursor;
  });

  const lanes = [];
  const laneByNodeId = {};
  collectElementsByLocalNames(doc, ["lane"]).forEach((laneEl, idx) => {
    const laneId = toText(laneEl.getAttribute("id")) || `lane_${idx + 1}`;
    const laneName = toText(laneEl.getAttribute("name")) || laneId;
    const processEl = findAncestorLocalName(laneEl, "process");
    const processId = toText(processEl?.getAttribute?.("id"));
    const pool = processId ? poolByProcessRef[processId] : null;
    const nodeIds = collectElementsByLocalNames(laneEl, ["flowNodeRef"])
      .map((ref) => toText(ref.textContent))
      .filter(Boolean);
    const lane = {
      laneId,
      laneName,
      poolId: toText(pool?.poolId),
      poolName: toText(pool?.poolName),
      processId,
      order: idx + 1,
      nodeIds,
    };
    lanes.push(lane);
    nodeIds.forEach((nodeId) => {
      if (!laneByNodeId[nodeId]) {
        laneByNodeId[nodeId] = {
          laneId,
          laneName,
          poolId: toText(pool?.poolId),
          poolName: toText(pool?.poolName),
          processId,
          laneOrder: idx + 1,
        };
      }
    });
  });

  const flows = [];
  const flowSeen = new Set();
  collectElementsByLocalNames(doc, ["sequenceflow"]).forEach((flowEl, idx) => {
    const flowId = toText(flowEl.getAttribute("id")) || `Flow_${idx + 1}`;
    if (flowSeen.has(flowId)) return;
    flowSeen.add(flowId);
    const sourceRef = toText(flowEl.getAttribute("sourceRef"));
    const targetRef = toText(flowEl.getAttribute("targetRef"));
    if (!sourceRef || !targetRef) return;
    const conditionExpression = collectElementsByLocalNames(flowEl, ["conditionExpression"])[0];
    const condition = toText(conditionExpression?.textContent);
    const label = toText(flowEl.getAttribute("name"));
    flows.push({
      id: flowId,
      sourceRef,
      targetRef,
      label,
      condition,
      sourceOrder: Number(nodeOrder[sourceRef] || Number.MAX_SAFE_INTEGER),
      targetOrder: Number(nodeOrder[targetRef] || Number.MAX_SAFE_INTEGER),
      order: idx + 1,
    });
  });

  const annotationsCount = collectElementsByLocalNames(doc, ["textannotation"]).length;

  return {
    nodes,
    nodeById,
    flows,
    lanes,
    pools,
    annotationsCount,
    laneByNodeId,
    linkEvents,
  };
}

function parseStepNodeId(stepRaw) {
  const step = asObject(stepRaw);
  return toText(step.bpmn_ref || step.bpmnRef || step.node_bind_id || step.node_id || step.nodeId || step.nodeBindId);
}

function collectInterviewSteps(draft) {
  const interview = asObject(draft?.interview);
  const rawSteps = toArray(interview.steps).map((step, idx) => {
    const row = asObject(step);
    const orderIndex = Number(row?.order_index || row?.order || idx + 1);
    const stepId = toText(row.id) || `step_${idx + 1}`;
    const nodeId = parseStepNodeId(row);
    return {
      ...row,
      __idx: idx,
      __order_index: Number.isFinite(orderIndex) && orderIndex > 0 ? Math.floor(orderIndex) : idx + 1,
      id: stepId,
      nodeId,
      title: toText(row.action || row.title || row.name) || `Шаг ${idx + 1}`,
      laneName: toText(row.lane_name || row.lane || row.role || row.area),
      subprocess: toText(row.subprocess),
    };
  });
  rawSteps.sort((a, b) => Number(a?.__order_index || 0) - Number(b?.__order_index || 0) || Number(a?.__idx || 0) - Number(b?.__idx || 0));
  return rawSteps.map((step, idx) => ({
    ...step,
    order_index: idx + 1,
  }));
}

function computeGraphNodeRank(facts) {
  const rank = {};
  toArray(facts?.nodes).forEach((node, idx) => {
    const nodeId = toText(node?.id);
    if (!nodeId) return;
    rank[nodeId] = Number(node?.order || idx + 1);
  });
  return rank;
}

function buildModelsFromDraft({ draft, bpmnXml, graphModel, interviewModel }) {
  if (graphModel && interviewModel) {
    return {
      graphModel,
      interviewModel,
    };
  }

  const facts = parseBpmnFacts(bpmnXml);
  const graphNodeRank = computeGraphNodeRank(facts);
  const flowMetaMap = normalizeFlowMetaMap(asObject(asObject(draft?.bpmn_meta).flow_meta));
  const transitionLabelByKey = {};
  toArray(facts?.flows).forEach((flow) => {
    const source = toText(flow?.sourceRef);
    const target = toText(flow?.targetRef);
    if (!source || !target) return;
    transitionLabelByKey[`${source}__${target}`] = toText(flow?.condition || flow?.label);
  });

  const backendNodes = toArray(facts?.nodes).map((node) => {
    const nodeId = toText(node?.id);
    const laneHit = asObject(facts?.laneByNodeId?.[nodeId]);
    return {
      id: nodeId,
      title: toText(node?.name),
      actorRole: toText(laneHit?.laneName),
      nodeType: toText(node?.type),
      bpmnKind: toText(node?.type),
      parameters: {},
    };
  });

  const backendEdges = toArray(facts?.flows).map((flow) => ({
    id: toText(flow?.id),
    from_id: toText(flow?.sourceRef),
    to_id: toText(flow?.targetRef),
    when: toText(flow?.condition || flow?.label),
  }));

  const laneMetaByNode = {};
  Object.keys(asObject(facts?.laneByNodeId)).forEach((nodeId) => {
    const lane = asObject(facts?.laneByNodeId[nodeId]);
    laneMetaByNode[nodeId] = {
      id: toText(lane?.laneId),
      key: toText(lane?.laneId),
      name: toText(lane?.laneName),
      label: toText(lane?.laneName),
    };
  });

  const nodeKindById = {};
  toArray(facts?.nodes).forEach((node) => {
    const nodeId = toText(node?.id);
    if (!nodeId) return;
    nodeKindById[nodeId] = toText(node?.type);
  });

  const graph = graphModel || buildInterviewGraphModel({
    bpmnXml,
    backendNodes,
    backendEdges,
    transitionLabelByKey,
    flowMetaById: flowMetaMap,
    nodeKindById,
    laneMetaByNode,
    subprocessMetaByNode: {},
    graphNodeRank,
  });

  const draftSteps = collectInterviewSteps(draft);
  const timelineBaseView = buildTimelineView({
    steps: draftSteps,
    backendNodes,
    graphNodeRank,
    laneMetaByNode,
    subprocessMetaByNode: {},
    preferGraphOrder: false,
  });

  const nodeMetaById = {};
  toArray(backendNodes).forEach((node) => {
    const nodeId = toText(node?.id);
    if (!nodeId) return;
    nodeMetaById[nodeId] = {
      title: toText(node?.title) || nodeId,
      lane: toText(node?.actorRole),
      kind: toText(node?.bpmnKind).toLowerCase(),
    };
  });

  const model = interviewModel || buildInterviewModel({
    timelineBaseView,
    graph,
    nodeMetaById,
    graphOrderLocked: true,
    graphNodeRank,
    includeBetweenBranches: true,
    enableTimeModel: true,
  });

  return {
    graphModel: graph,
    interviewModel: model,
  };
}

function aiItemsFromValue(rawValue, scope = "") {
  return toArray(rawValue).map((item, idx) => {
    const row = asObject(item);
    const qid = toText(row.qid || row.id || row.question_id || row.questionId) || `${scope}_q_${idx + 1}`;
    const text = toText(row.text || row.question || row.label);
    const statusRaw = toText(row.status || row.state);
    const statusNorm = normalizeLoose(statusRaw);
    const done = statusNorm === "done"
      || statusNorm === "closed"
      || statusNorm === "resolved"
      || statusNorm === "подтверждено"
      || statusNorm === "ok";
    return {
      key: `${scope}_${qid}_${normalizeLoose(text)}`,
      qid,
      text,
      status: done ? "done" : "open",
    };
  }).filter((row) => !!row.text || !!row.qid);
}

function collectQualityItems(qualityReport, draft) {
  const out = [];

  function add(rowRaw) {
    const row = asObject(rowRaw);
    const message = toText(row.message || row.title || row.text || row.reason || row.problem);
    if (!message) return;
    const levelRaw = normalizeLoose(row.level || row.severity || row.type);
    const level = levelRaw.includes("error") || levelRaw.includes("critical") || levelRaw.includes("fatal")
      ? "error"
      : (levelRaw.includes("warn") ? "warn" : "info");
    out.push({
      level,
      message,
      fix: toText(row.fix || row.hint || row.recommendation || row.action || row.actions),
      nodeId: toText(row.nodeId || row.node_id || row.elementId || row.element_id),
    });
  }

  const report = asObject(qualityReport);
  toArray(report?.items).forEach(add);
  toArray(report?.issues).forEach(add);

  const draftObj = asObject(draft);
  toArray(draftObj?.quality_issues).forEach(add);
  toArray(draftObj?.qualityIssues).forEach(add);
  toArray(asObject(draftObj?.quality).issues).forEach(add);
  toArray(asObject(draftObj?.lint).issues).forEach(add);

  const unique = [];
  const seen = new Set();
  out.forEach((item) => {
    const key = `${item.level}::${normalizeLoose(item.message)}::${normalizeLoose(item.fix)}::${item.nodeId}`;
    if (seen.has(key)) return;
    seen.add(key);
    unique.push(item);
  });
  return unique;
}

function collectNotesGlobalCount(draft) {
  const directString = toText(draft?.notes);
  if (directString) return 1;
  const asList = toArray(draft?.notes);
  if (asList.length) {
    return asList.filter((item) => {
      if (typeof item === "string") return !!toText(item);
      return !!toText(asObject(item).text || asObject(item).note);
    }).length;
  }
  const interviewNotes = toArray(asObject(draft?.interview).notes);
  return interviewNotes.filter((item) => {
    if (typeof item === "string") return !!toText(item);
    return !!toText(asObject(item).text || asObject(item).note);
  }).length;
}

function collectStepDodChecks({ title, laneName, incomingCount, outgoingCount, nodeType, durationSec, notesCount, aiCount }) {
  const kind = normalizeLoose(nodeType);
  const isStart = kind === "startevent";
  const isEnd = kind === "endevent" || kind.includes("terminate") || kind.includes("endeventdefinition");
  const isGateway = kind.includes("gateway");
  const isSubprocess = kind === "subprocess" || kind === "adhocsubprocess";
  const isTask = kind.includes("task") || kind.includes("activity") || isSubprocess;
  const isEvent = kind.includes("event");
  const isLinkEvent = kind.includes("intermediatecatchevent") || kind.includes("intermediatethrowevent");
  const checks = [];
  const hasTitle = !!toText(title);
  const hasLane = !!toText(laneName);
  const hasIncoming = isStart ? true : incomingCount > 0;
  const hasOutgoing = isEnd ? true : outgoingCount > 0;
  const hasDuration = Number(durationSec) > 0;
  const hasNotesOrAi = Number(notesCount) > 0 || Number(aiCount) > 0;
  checks.push({ key: "hasTitle", pass: hasTitle, required: true });
  if (isTask) {
    checks.push({ key: "hasIncoming", pass: hasIncoming, required: true });
    checks.push({ key: "hasOutgoing", pass: hasOutgoing, required: true });
    checks.push({ key: "hasLane", pass: hasLane, required: false });
    checks.push({ key: "hasDuration", pass: hasDuration, required: true });
    checks.push({ key: "hasNotesOrAi", pass: hasNotesOrAi, required: false });
  } else if (isGateway) {
    checks.push({ key: "hasIncoming", pass: hasIncoming, required: true });
    checks.push({ key: "hasOutgoing", pass: outgoingCount >= 2, required: true });
    checks.push({ key: "hasConditionOnOutgoing", pass: outgoingCount >= 2, required: false });
  } else if (isEvent) {
    checks.push({ key: "hasIncoming", pass: hasIncoming, required: !isStart });
    checks.push({ key: "hasOutgoing", pass: hasOutgoing, required: !isEnd });
    if (isLinkEvent) {
      checks.push({ key: "inLinkGroup", pass: true, required: true });
      checks.push({ key: "pairedIntegrity", pass: true, required: true });
    }
  } else {
    checks.push({ key: "hasIncoming", pass: hasIncoming, required: !isStart });
    checks.push({ key: "hasOutgoing", pass: hasOutgoing, required: !isEnd });
    checks.push({ key: "hasNotesOrAi", pass: hasNotesOrAi, required: false });
  }
  const checksMap = {};
  checks.forEach((item) => {
    checksMap[item.key] = !!item.pass;
  });
  const done = checks.filter((item) => item.pass).length;
  const total = checks.length;
  const missingKeys = checks.filter((item) => !item.pass).map((item) => item.key);
  const requiredMissingKeys = checks.filter((item) => !item.pass && item.required).map((item) => item.key);
  return {
    score: total > 0 ? Math.round((done / total) * 100) : 0,
    done,
    total,
    missingKeys,
    requiredMissingKeys,
    checks: checksMap,
  };
}

function tierClassOrder(tierRaw) {
  const tier = normalizeFlowTier(tierRaw);
  if (tier === "P0") return 1;
  if (tier === "P1") return 2;
  if (tier === "P2") return 3;
  return 4;
}

function buildBranchPathMeta(interviewModel) {
  const pathByNode = {};
  const timeline = toArray(asObject(interviewModel).timelineView);

  function visitNodes(nodesRaw, prefix) {
    toArray(nodesRaw).forEach((node, idx) => {
      const kind = normalizeLoose(node?.kind);
      const path = `${prefix}.${idx + 1}`;
      const nodeId = toText(node?.nodeId || node?.targetNodeId);
      if (nodeId && (kind === "step" || kind === "terminal" || kind === "decision" || kind === "parallel")) {
        if (!pathByNode[nodeId] || path.localeCompare(pathByNode[nodeId], "ru") < 0) {
          pathByNode[nodeId] = path;
        }
      }
      if (kind === "decision" || kind === "parallel") {
        toArray(node?.branches).forEach((branch, branchIdx) => {
          const key = toText(branch?.key) || String.fromCharCode(65 + branchIdx);
          visitNodes(branch?.children, `${path}.${key}`);
        });
      }
    });
  }

  timeline.forEach((step) => {
    const nodeId = toText(step?.node_bind_id || step?.node_id);
    const graphNo = toText(step?.seq_label || step?.seq || asObject(interviewModel).graphNoByNodeId?.[nodeId]);
    const between = asObject(step?.between_branches_item);
    if (!nodeId || !graphNo || normalizeLoose(between?.kind) !== "between_branches") return;
    toArray(between?.branches).forEach((branch, branchIdx) => {
      const key = toText(branch?.key) || String.fromCharCode(65 + branchIdx);
      visitNodes(branch?.children, `${graphNo}.${key}`);
    });
  });

  return pathByNode;
}

function classifyNode(nodeId, graphModel, mainlineSet, reachableSet) {
  const id = toText(nodeId);
  if (!id) return "detached";
  if (!reachableSet.has(id)) return "detached";
  if (mainlineSet.has(id)) return "mainline";
  return "branch";
}

function flowOutcomeFromBranchChildren(childrenRaw) {
  let hasContinue = false;
  let hasLoop = false;
  let hasTerminal = false;
  let stepCount = 0;

  function walk(nodesRaw) {
    toArray(nodesRaw).forEach((node) => {
      const kind = normalizeLoose(node?.kind);
      if (kind === "step") stepCount += 1;
      if (kind === "continue") hasContinue = true;
      if (kind === "loop") hasLoop = true;
      if (kind === "terminal") hasTerminal = true;
      if (kind === "decision" || kind === "parallel") {
        toArray(node?.branches).forEach((branch) => walk(branch?.children));
      }
    });
  }
  walk(childrenRaw);

  if (hasLoop) return { outcome: "Loop", stepCount };
  if (hasContinue) return { outcome: "Continue", stepCount };
  if (hasTerminal) return { outcome: "End", stepCount };
  return { outcome: stepCount > 0 ? "Steps" : "—", stepCount };
}

function flowSortByGraphPath(a, b) {
  const ap = toText(a?.sourcePath || "ZZZ");
  const bp = toText(b?.sourcePath || "ZZZ");
  if (ap !== bp) return ap.localeCompare(bp, "ru", { numeric: true, sensitivity: "base" });
  const at = toText(a?.targetPath || "ZZZ");
  const bt = toText(b?.targetPath || "ZZZ");
  if (at !== bt) return at.localeCompare(bt, "ru", { numeric: true, sensitivity: "base" });
  return toText(a?.flowId).localeCompare(toText(b?.flowId), "ru");
}

function isEndLike(nodeTypeRaw) {
  const kind = normalizeLoose(nodeTypeRaw);
  return kind === "endevent" || kind.includes("terminate");
}

function isGatewayKind(nodeTypeRaw) {
  return normalizeLoose(nodeTypeRaw).includes("gateway");
}

function normalizeLinkKey(raw) {
  return toText(raw).replace(/\s+/g, " ").trim();
}

function tierPriority(tierRaw) {
  const tier = normalizeFlowTier(tierRaw);
  if (tier === "P0") return 1;
  if (tier === "P1") return 2;
  if (tier === "P2") return 3;
  return 99;
}

function minTier(tierValues) {
  const list = toArray(tierValues).map((tier) => normalizeFlowTier(tier) || "None");
  if (!list.length) return "None";
  const sorted = [...list].sort((a, b) => tierPriority(a) - tierPriority(b));
  return sorted[0] || "None";
}

function buildBpmnAdjacency(facts) {
  const incomingByNodeId = {};
  const outgoingByNodeId = {};
  toArray(facts?.nodes).forEach((node) => {
    const nodeId = toText(node?.id);
    if (!nodeId) return;
    incomingByNodeId[nodeId] = [];
    outgoingByNodeId[nodeId] = [];
  });
  toArray(facts?.flows).forEach((flow) => {
    const sourceId = toText(flow?.sourceRef);
    const targetId = toText(flow?.targetRef);
    if (!sourceId || !targetId) return;
    if (!incomingByNodeId[targetId]) incomingByNodeId[targetId] = [];
    if (!outgoingByNodeId[sourceId]) outgoingByNodeId[sourceId] = [];
    incomingByNodeId[targetId].push(flow);
    outgoingByNodeId[sourceId].push(flow);
  });
  return { incomingByNodeId, outgoingByNodeId };
}

function computeReachableNodeIds({ facts, incomingByNodeId, outgoingByNodeId }) {
  const starts = toArray(facts?.nodes).filter((node) => normalizeLoose(node?.type) === "startevent");
  let seed = starts.map((node) => toText(node?.id)).filter(Boolean);
  if (!seed.length) {
    seed = toArray(facts?.nodes)
      .filter((node) => toArray(incomingByNodeId[toText(node?.id)]).length === 0)
      .map((node) => toText(node?.id))
      .filter(Boolean);
  }
  const queue = [...seed];
  const reachable = new Set();
  while (queue.length) {
    const nodeId = toText(queue.shift());
    if (!nodeId || reachable.has(nodeId)) continue;
    reachable.add(nodeId);
    toArray(outgoingByNodeId[nodeId]).forEach((flow) => {
      const targetId = toText(flow?.targetRef);
      if (!targetId || reachable.has(targetId)) return;
      queue.push(targetId);
    });
  }
  return reachable;
}

function hasGatewayJoinPath({ splitNodeId, gatewayType, outgoingByNodeId, incomingByNodeId, nodeTypeById, maxDepth = 260 }) {
  const queue = [{ nodeId: splitNodeId, depth: 0 }];
  const seen = new Set([toText(splitNodeId)]);
  while (queue.length) {
    const { nodeId, depth } = queue.shift();
    if (depth > maxDepth) break;
    const outgoing = toArray(outgoingByNodeId[nodeId]);
    for (let i = 0; i < outgoing.length; i += 1) {
      const targetId = toText(outgoing[i]?.targetRef);
      if (!targetId || seen.has(targetId)) continue;
      seen.add(targetId);
      const incomingCount = toArray(incomingByNodeId[targetId]).length;
      const targetType = normalizeLoose(nodeTypeById?.[targetId] || outgoing[i]?.targetType || "");
      if (targetType === gatewayType && incomingCount > 1) return true;
      queue.push({ nodeId: targetId, depth: depth + 1 });
    }
  }
  return false;
}

function buildLinkGroups({ facts }) {
  const groupsByKey = {};
  toArray(facts?.linkEvents).forEach((row) => {
    const nodeId = toText(row?.nodeId);
    const role = toText(row?.role).toLowerCase();
    if (!nodeId || (role !== "throw" && role !== "catch")) return;
    const linkKey = normalizeLinkKey(row?.linkName || nodeId);
    if (!linkKey) return;
    if (!groupsByKey[linkKey]) {
      groupsByKey[linkKey] = {
        link_key: linkKey,
        throw_ids: [],
        catch_ids: [],
        color_key: fnv1aHex(linkKey).slice(0, 6),
      };
    }
    const target = role === "throw" ? groupsByKey[linkKey].throw_ids : groupsByKey[linkKey].catch_ids;
    if (!target.includes(nodeId)) target.push(nodeId);
  });
  const groups = Object.values(groupsByKey).map((group) => {
    let integrity = "ok";
    let details = "Link throw/catch paired.";
    if (!group.throw_ids.length || !group.catch_ids.length) {
      integrity = "error";
      details = !group.throw_ids.length
        ? "No throw event for this link group."
        : "No catch event for this link group.";
    } else if (group.throw_ids.length > 1 || group.catch_ids.length > 1) {
      integrity = "warn";
      details = "Multiple throw/catch events mapped to the same link group.";
    }
    return {
      ...group,
      integrity,
      details,
    };
  });
  groups.sort((a, b) => toText(a?.link_key).localeCompare(toText(b?.link_key), "ru"));
  const linkIntegrity = groups.map((group) => ({
    link_key: toText(group?.link_key),
    integrity: toText(group?.integrity),
    details: toText(group?.details),
    throw_ids: toArray(group?.throw_ids),
    catch_ids: toArray(group?.catch_ids),
  }));
  return {
    groups,
    linkIntegrity,
  };
}

function computeBpmnQuality({
  facts,
  incomingByNodeId,
  outgoingByNodeId,
  reachableNodeIds,
  linkIntegrity,
}) {
  const items = [];
  const orphanNodeIds = [];
  const deadEndNodeIds = [];
  const gatewayUnjoinedNodeIds = [];
  const linkNodeIds = new Set(
    toArray(facts?.linkEvents).map((row) => toText(row?.nodeId)).filter(Boolean),
  );
  const nodeTypeById = {};
  toArray(facts?.nodes).forEach((node) => {
    const nodeId = toText(node?.id);
    if (!nodeId) return;
    nodeTypeById[nodeId] = normalizeLoose(node?.type);
  });

  toArray(facts?.nodes).forEach((node) => {
    const nodeId = toText(node?.id);
    if (!nodeId) return;
    const nodeType = normalizeLoose(node?.type);
    const incomingCount = toArray(incomingByNodeId[nodeId]).length;
    const outgoingCount = toArray(outgoingByNodeId[nodeId]).length;
    const reachable = reachableNodeIds.has(nodeId);
    if (!reachable) orphanNodeIds.push(nodeId);
    if (reachable && outgoingCount === 0 && !isEndLike(nodeType) && !linkNodeIds.has(nodeId)) {
      deadEndNodeIds.push(nodeId);
    }
    if (reachable && isGatewayKind(nodeType) && outgoingCount > 1) {
      const hasJoin = hasGatewayJoinPath({
        splitNodeId: nodeId,
        gatewayType: nodeType,
        outgoingByNodeId,
        incomingByNodeId,
        nodeTypeById,
      });
      if (!hasJoin) gatewayUnjoinedNodeIds.push(nodeId);
    }
    void incomingCount;
  });

  orphanNodeIds.forEach((nodeId) => {
    items.push({
      level: "warn",
      code: "orphan_bpmn_node",
      message: `Node ${nodeId} is unreachable from StartEvent.`,
      fix: "Connect the node to the main process flow.",
      nodeId,
    });
  });
  deadEndNodeIds.forEach((nodeId) => {
    items.push({
      level: "error",
      code: "dead_end_bpmn_node",
      message: `Node ${nodeId} has no outgoing sequenceFlow.`,
      fix: "Add outgoing flow or convert node to EndEvent.",
      nodeId,
    });
  });
  gatewayUnjoinedNodeIds.forEach((nodeId) => {
    items.push({
      level: "warn",
      code: "gateway_split_without_join",
      message: `Gateway ${nodeId} splits flow but join was not detected.`,
      fix: "Add a matching join gateway or explicit termination for each branch.",
      nodeId,
    });
  });

  const linkWarnCount = toArray(linkIntegrity).filter((row) => toText(row?.integrity) === "warn").length;
  const linkErrorCount = toArray(linkIntegrity).filter((row) => toText(row?.integrity) === "error").length;

  const errorsTotal = items.filter((item) => item.level === "error").length;
  const warningsTotal = items.filter((item) => item.level === "warn").length;
  return {
    errorsTotal,
    warningsTotal,
    items,
    orphan_bpmn_nodes: orphanNodeIds,
    dead_end_bpmn_nodes: deadEndNodeIds,
    gateway_unjoined: gatewayUnjoinedNodeIds,
    link_integrity: linkIntegrity,
    link_integrity_summary: {
      errors: linkErrorCount,
      warns: linkWarnCount,
      total: toArray(linkIntegrity).length,
    },
  };
}

function buildPrimaryFlowIdSet({ facts, interviewModel, mainlineNodeIds }) {
  const set = new Set();
  const timelineRows = toArray(asObject(interviewModel).timelineView);
  timelineRows.forEach((row) => {
    const between = asObject(row?.between_branches_item);
    if (normalizeLoose(between?.kind) !== "between_branches") return;
    const primaryBranch = toArray(between?.branches).find((branch) => !!branch?.isPrimary) || null;
    const flowId = toText(primaryBranch?.flowId);
    if (flowId) set.add(flowId);
  });
  const pairToFlowId = {};
  toArray(facts?.flows).forEach((flow) => {
    const sourceId = toText(flow?.sourceRef);
    const targetId = toText(flow?.targetRef);
    if (!sourceId || !targetId) return;
    const key = `${sourceId}__${targetId}`;
    if (!pairToFlowId[key]) pairToFlowId[key] = toText(flow?.id);
  });
  for (let i = 0; i < toArray(mainlineNodeIds).length - 1; i += 1) {
    const sourceId = toText(mainlineNodeIds[i]);
    const targetId = toText(mainlineNodeIds[i + 1]);
    const flowId = toText(pairToFlowId[`${sourceId}__${targetId}`]);
    if (flowId) set.add(flowId);
  }
  return set;
}

function nodeTierFromIncoming({ nodeId, incomingByNodeId, flowMetaMap, nodeType }) {
  const incomingFlowIds = toArray(incomingByNodeId[nodeId]).map((flow) => toText(flow?.id)).filter(Boolean);
  if (!incomingFlowIds.length) {
    return normalizeLoose(nodeType) === "startevent" ? "P0" : "None";
  }
  const incomingTiers = incomingFlowIds.map((flowId) => resolveFlowTier(flowId, flowMetaMap));
  return minTier(incomingTiers);
}

export function computeDodSnapshot({
  draft,
  bpmnXml,
  graphModel,
  interviewModel,
  qualityReport,
  uiState,
}) {
  const safeDraft = asObject(draft);
  const xmlText = toText(bpmnXml || safeDraft?.bpmn_xml || safeDraft?.bpmnXml);
  const facts = parseBpmnFacts(xmlText);
  const flowMetaMap = normalizeFlowMetaMap(asObject(asObject(safeDraft?.bpmn_meta).flow_meta));
  const { incomingByNodeId: factsIncomingByNodeId, outgoingByNodeId: factsOutgoingByNodeId } = buildBpmnAdjacency(facts);
  const factsReachableNodeIds = computeReachableNodeIds({
    facts,
    incomingByNodeId: factsIncomingByNodeId,
    outgoingByNodeId: factsOutgoingByNodeId,
  });
  const { groups: linkGroups, linkIntegrity } = buildLinkGroups({ facts });

  const { graphModel: graphRef, interviewModel: interviewRef } = buildModelsFromDraft({
    draft: safeDraft,
    bpmnXml: xmlText,
    graphModel,
    interviewModel,
  });

  const graph = asObject(graphRef);
  const model = asObject(interviewRef);
  const graphNodesById = asObject(graph?.nodesById);
  const graphFlowsById = asObject(graph?.flowsById);
  const outgoingByNode = asObject(graph?.outgoingByNode);
  const incomingByNode = asObject(graph?.incomingByNode);
  const mainlineNodeIds = toArray(model?.mainlineNodeIds).map((id) => toText(id)).filter(Boolean);
  const mainlineSet = new Set(mainlineNodeIds);
  const reachableSet = new Set(toArray(graph?.reachableNodeIds).map((id) => toText(id)).filter(Boolean));
  const graphNoByNodeId = asObject(model?.graphNoByNodeId);
  const branchPathByNodeId = buildBranchPathMeta(model);
  const primaryFlowIdSet = buildPrimaryFlowIdSet({
    facts,
    interviewModel: model,
    mainlineNodeIds,
  });

  const interviewStepsRaw = collectInterviewSteps(safeDraft);
  const stepRawById = {};
  const stepRawByNodeId = {};
  const nodeStepTimeSecByNodeId = buildNodeStepTimeSecByNodeId(safeDraft);
  interviewStepsRaw.forEach((step) => {
    const stepId = toText(step?.id);
    const nodeId = toText(step?.nodeId);
    if (stepId) stepRawById[stepId] = step;
    if (nodeId && !stepRawByNodeId[nodeId]) stepRawByNodeId[nodeId] = step;
  });

  const notesByElement = normalizeElementNotesMap(safeDraft?.notes_by_element || safeDraft?.notesByElementId);
  const notesGlobalTotal = collectNotesGlobalCount(safeDraft);
  const notesByElementTotal = Object.values(notesByElement).reduce((sum, entry) => sum + toArray(asObject(entry).items).length, 0);

  const aiByElement = normalizeAiQuestionsByElementMap(
    asObject(safeDraft?.interview).ai_questions_by_element
      || asObject(safeDraft?.interview).aiQuestionsByElementId,
  );
  const aiByStep = asObject(asObject(safeDraft?.interview).ai_questions);

  const allAiItems = [];
  Object.keys(aiByElement).forEach((elementId) => {
    allAiItems.push(...aiItemsFromValue(aiByElement[elementId], `el_${elementId}`));
  });
  Object.keys(aiByStep).forEach((stepId) => {
    allAiItems.push(...aiItemsFromValue(aiByStep[stepId], `step_${stepId}`));
  });
  const aiSeen = new Set();
  const uniqueAiItems = allAiItems.filter((item) => {
    const key = `${toText(item?.qid)}::${normalizeLoose(item?.text)}::${toText(item?.status)}`;
    if (aiSeen.has(key)) return false;
    aiSeen.add(key);
    return true;
  });
  const aiQuestionsTotal = uniqueAiItems.length;
  const aiQuestionsDoneTotal = uniqueAiItems.filter((item) => item.status === "done").length;
  const aiQuestionsOpenTotal = Math.max(0, aiQuestionsTotal - aiQuestionsDoneTotal);

  const timelineRows = toArray(model?.timelineView).filter((row) => !!toText(row?.node_bind_id || row?.node_id));
  const stepRows = [];
  let cumulativeSec = 0;

  timelineRows.forEach((row, index) => {
    const stepId = toText(row?.id);
    const nodeId = toText(row?.node_bind_id || row?.node_id);
    const graphNode = asObject(graphNodesById[nodeId]);
    const rawStep = asObject(stepRawById[stepId] || stepRawByNodeId[nodeId]);

    const incoming = toArray(incomingByNode[nodeId]);
    const outgoing = toArray(outgoingByNode[nodeId]);

    const incomingFlowIds = incoming.map((flow) => toText(flow?.id)).filter(Boolean);
    const outgoingFlowIds = outgoing.map((flow) => toText(flow?.id)).filter(Boolean);

    const laneMeta = asObject(facts?.laneByNodeId?.[nodeId]);
    const laneName = toText(
      row?.lane_name
        || rawStep?.lane_name
        || rawStep?.lane
        || rawStep?.role
        || rawStep?.area
        || laneMeta?.laneName,
    ) || "—";
    const laneId = toText(laneMeta?.laneId) || normalizeLoose(laneName) || "unassigned";

    const parsedStepTime = parseStepTimeModel(rawStep, "step");
    const durationSec = pickPositiveInt(
      row?.work_duration_sec,
      row?.step_time_sec,
      rawStep?.work_duration_sec,
      rawStep?.duration_sec,
      rawStep?.durationSec,
      rawStep?.step_time_sec,
      rawStep?.stepTimeSec,
      nodeStepTimeSecByNodeId[nodeId],
      parsedStepTime?.expected_sec,
    );
    const waitSec = pickPositiveInt(
      row?.wait_duration_sec,
      rawStep?.wait_duration_sec,
      rawStep?.waitDurationSec,
      rawStep?.wait_sec,
      rawStep?.waitSec,
      toNonNegativeInt(rawStep?.wait_min || rawStep?.waitMin) * 60,
    );

    cumulativeSec += durationSec;

    const between = asObject(row?.between_branches_item);
    let tier = "None";
    if (normalizeLoose(between?.kind) === "between_branches") {
      const primaryBranch = toArray(between?.branches).find((branch) => !!branch?.isPrimary) || null;
      const branchTier = normalizeFlowTier(primaryBranch?.tier);
      if (branchTier) tier = branchTier;
    } else if (outgoingFlowIds.length === 1) {
      tier = resolveFlowTier(outgoingFlowIds[0], flowMetaMap);
    }

    const elementNotesCount = toArray(asObject(notesByElement[nodeId]).items).length;
    const stepAiItems = aiItemsFromValue(aiByStep[stepId], `step_${stepId}`);
    const elementAiItems = aiItemsFromValue(aiByElement[nodeId], `el_${nodeId}`);
    const aiSet = new Set();
    [...stepAiItems, ...elementAiItems].forEach((item) => {
      aiSet.add(`${toText(item?.qid)}::${normalizeLoose(item?.text)}`);
    });
    const aiCount = aiSet.size;

    const prev = incoming.map((flow) => {
      const sourceId = toText(flow?.sourceId);
      const sourceTitle = toText(graphNodesById[sourceId]?.name || sourceId);
      return {
        flowId: toText(flow?.id),
        tier: resolveFlowTier(flow?.id, flowMetaMap),
        rtier: resolveFlowRtier(flow?.id, flowMetaMap),
        label: toText(flow?.condition || flow?.name),
        nodeId: sourceId,
        title: sourceTitle,
      };
    });

    const next = outgoing.map((flow) => {
      const targetId = toText(flow?.targetId);
      const targetTitle = toText(graphNodesById[targetId]?.name || targetId);
      return {
        flowId: toText(flow?.id),
        tier: resolveFlowTier(flow?.id, flowMetaMap),
        rtier: resolveFlowRtier(flow?.id, flowMetaMap),
        label: toText(flow?.condition || flow?.name),
        nodeId: targetId,
        title: targetTitle,
      };
    });

    const betweenBranchesSummary = (() => {
      if (normalizeLoose(between?.kind) !== "between_branches") return null;
      const branches = toArray(between?.branches);
      const tierCounters = { P0: 0, P1: 0, P2: 0, None: 0 };
      let primaryBranchKey = "";
      const preview = branches.map((branch, idx) => {
        const key = toText(branch?.key) || String.fromCharCode(65 + idx);
        const t = normalizeFlowTier(branch?.tier) || "None";
        tierCounters[t] += 1;
        if (branch?.isPrimary) primaryBranchKey = key;
        const outcomeMeta = flowOutcomeFromBranchChildren(branch?.children);
        return {
          key,
          label: toText(branch?.label) || `Ветка ${idx + 1}`,
          tier: t,
          outcome: outcomeMeta.outcome,
          stepsCount: outcomeMeta.stepCount,
          time: toText(asObject(branch?.time_summary).label_with_loop || asObject(branch?.time_summary).label || "—"),
          primary: !!branch?.isPrimary,
          primaryReasonLabel: toText(branch?.primaryReasonLabel),
          nonPrimaryReasonLabel: toText(branch?.nonPrimaryReasonLabel),
        };
      });
      return {
        anchorGatewayId: toText(between?.anchorGatewayId || nodeId),
        fromGraphNo: toText(between?.fromGraphNo),
        toGraphNo: toText(between?.toGraphNo),
        branchesCount: branches.length,
        primaryBranchKey,
        tiers: tierCounters,
        rows: preview,
      };
    })();

    const dod = collectStepDodChecks({
      title: toText(row?.action || rawStep?.title || graphNode?.name),
      laneName,
      incomingCount: incomingFlowIds.length,
      outgoingCount: outgoingFlowIds.length,
      nodeType: toText(graphNode?.type),
      durationSec,
      notesCount: elementNotesCount,
      aiCount,
    });

    stepRows.push({
      stepId: stepId || `row_${index + 1}`,
      index: index + 1,
      title: toText(row?.action || rawStep?.title || graphNode?.name) || `Шаг ${index + 1}`,
      laneId,
      laneName,
      bpmn: {
        nodeId,
        nodeName: toText(graphNode?.name || row?.node_bind_title || nodeId),
        nodeType: toText(graphNode?.type || row?.node_bind_kind),
        incomingFlowIds,
        outgoingFlowIds,
      },
      graph: {
        graphNo: toText(row?.seq_label || row?.seq || graphNoByNodeId[nodeId] || index + 1),
        graphPath: toText(graphNoByNodeId[nodeId] || branchPathByNodeId[nodeId]),
        prev,
        next,
        isGatewayBetween: normalizeLoose(between?.kind) === "between_branches",
        betweenBranchesSummary,
      },
      tier,
      durationSec,
      waitSec,
      cumulativeSec,
      notes: {
        elementCount: elementNotesCount,
        globalCount: notesGlobalTotal,
      },
      ai: {
        questionsCount: aiCount,
        openCount: Math.max(0, aiCount - elementAiItems.filter((item) => item.status === "done").length),
        doneCount: elementAiItems.filter((item) => item.status === "done").length,
      },
      dod,
    });
  });

  const stepRowByNodeId = {};
  stepRows.forEach((row) => {
    const nodeId = toText(row?.bpmn?.nodeId);
    if (!nodeId || stepRowByNodeId[nodeId]) return;
    stepRowByNodeId[nodeId] = row;
  });

  const rtierFlowMetaEntries = Object.values(flowMetaMap).filter((row) => !!normalizeRFlowTier(asObject(row)?.rtier));
  const rtiersSource = rtierFlowMetaEntries.length > 0 ? "meta" : "inferred";
  const inferredScopeStartId = toText(stepRows[0]?.bpmn?.nodeId)
    || toText(mainlineNodeIds[0])
    || toText(toArray(graph?.startNodeIds)[0]);
  const rVariantsRaw = buildRVariants({
    graph,
    flowMeta: flowMetaMap,
    scopeStartId: inferredScopeStartId,
    maxLoopIters: 1,
  });
  const rVariants = toArray(rVariantsRaw).map((variant) => {
    const steps = toArray(variant?.steps);
    let totalTimeSec = 0;
    let dodDone = 0;
    let dodTotal = 0;
    steps.forEach((step) => {
      const nodeId = toText(step?.nodeId);
      const row = asObject(stepRowByNodeId[nodeId]);
      totalTimeSec += Number(row?.durationSec || 0);
      dodDone += Number(asObject(row?.dod).done || 0);
      dodTotal += Number(asObject(row?.dod).total || 0);
    });
    const dodPct = dodTotal > 0 ? Math.round((dodDone / dodTotal) * 100) : 0;
    return {
      key: toText(variant?.key),
      stopReason: toText(variant?.stopReason),
      scopeStartId: toText(variant?.scopeStartId),
      successEndId: toText(variant?.successEndId),
      failEndId: toText(variant?.failEndId),
      steps,
      edges: toArray(variant?.edges),
      summary: {
        stepsCount: steps.length,
        totalTimeSec,
        dodDone,
        dodTotal,
        dodPct,
      },
    };
  });

  const mainlineSetByNode = new Set(mainlineNodeIds);
  const processTotalSec = stepRows.reduce((sum, step) => sum + Number(step?.durationSec || 0), 0);
  const waitTotalSec = stepRows.reduce((sum, step) => sum + Number(step?.waitSec || 0), 0);
  const mainlineTotalSec = stepRows.reduce((sum, step) => {
    const nodeId = toText(step?.bpmn?.nodeId);
    return sum + (mainlineSetByNode.has(nodeId) ? Number(step?.durationSec || 0) : 0);
  }, 0);

  const byLaneSecMap = {};
  const byTierSecMap = { P0: 0, P1: 0, P2: 0, None: 0 };
  stepRows.forEach((step) => {
    const laneId = toText(step?.laneId) || "unassigned";
    const laneName = toText(step?.laneName) || "—";
    if (!byLaneSecMap[laneId]) {
      byLaneSecMap[laneId] = {
        laneId,
        laneName,
        totalSec: 0,
      };
    }
    byLaneSecMap[laneId].totalSec += Number(step?.durationSec || 0);
    const tier = normalizeFlowTier(step?.tier) || "None";
    byTierSecMap[tier] += Number(step?.durationSec || 0);
  });

  const tierCounts = { P0: 0, P1: 0, P2: 0, None: 0 };
  toArray(facts?.flows).forEach((flow) => {
    const tier = resolveFlowTier(flow?.id, flowMetaMap);
    tierCounts[tier] += 1;
  });

  const bpmnQuality = computeBpmnQuality({
    facts,
    incomingByNodeId: factsIncomingByNodeId,
    outgoingByNodeId: factsOutgoingByNodeId,
    reachableNodeIds: factsReachableNodeIds,
    linkIntegrity,
  });
  const qualityItems = toArray(bpmnQuality?.items);
  const qualityErrorsTotal = Number(bpmnQuality?.errorsTotal || 0);
  const qualityWarningsTotal = Number(bpmnQuality?.warningsTotal || 0);

  const laneStatsMap = {};
  toArray(facts?.lanes).forEach((lane) => {
    const laneId = toText(lane?.laneId) || normalizeLoose(lane?.laneName) || "unassigned";
    laneStatsMap[laneId] = {
      laneId,
      laneName: toText(lane?.laneName) || laneId,
      elementsCount: 0,
      stepsCount: 0,
      timeTotalSec: 0,
      notesCount: 0,
      aiQuestionsCount: 0,
    };
  });

  toArray(facts?.nodes).forEach((node) => {
    const nodeId = toText(node?.id);
    const laneMeta = asObject(facts?.laneByNodeId?.[nodeId]);
    const laneId = toText(laneMeta?.laneId) || "unassigned";
    if (!laneStatsMap[laneId]) {
      laneStatsMap[laneId] = {
        laneId,
        laneName: toText(laneMeta?.laneName) || laneId,
        elementsCount: 0,
        stepsCount: 0,
        timeTotalSec: 0,
        notesCount: 0,
        aiQuestionsCount: 0,
      };
    }
    const kind = normalizeLoose(node?.type);
    if (LANE_ELEMENT_TYPES.has(kind)) {
      laneStatsMap[laneId].elementsCount += 1;
    }
  });

  stepRows.forEach((step) => {
    const laneId = toText(step?.laneId) || "unassigned";
    if (!laneStatsMap[laneId]) {
      laneStatsMap[laneId] = {
        laneId,
        laneName: toText(step?.laneName) || laneId,
        elementsCount: 0,
        stepsCount: 0,
        timeTotalSec: 0,
        notesCount: 0,
        aiQuestionsCount: 0,
      };
    }
    laneStatsMap[laneId].stepsCount += 1;
    laneStatsMap[laneId].timeTotalSec += Number(step?.durationSec || 0);
    laneStatsMap[laneId].notesCount += Number(step?.notes?.elementCount || 0);
    laneStatsMap[laneId].aiQuestionsCount += Number(step?.ai?.questionsCount || 0);
  });

  const laneOrderById = {};
  toArray(facts?.lanes).forEach((lane, idx) => {
    const laneId = toText(lane?.laneId);
    if (!laneId) return;
    laneOrderById[laneId] = idx;
  });

  const lanes = Object.values(laneStatsMap).sort((a, b) => {
    const ai = Number(laneOrderById[toText(a?.laneId)]);
    const bi = Number(laneOrderById[toText(b?.laneId)]);
    const ar = Number.isFinite(ai) && ai >= 0 ? ai : Number.MAX_SAFE_INTEGER;
    const br = Number.isFinite(bi) && bi >= 0 ? bi : Number.MAX_SAFE_INTEGER;
    if (ar !== br) return ar - br;
    return toText(a?.laneName).localeCompare(toText(b?.laneName), "ru");
  });
  const canonicalLanes = toArray(facts?.lanes).map((lane) => {
    const laneId = toText(lane?.laneId);
    const stats = lanes.find((row) => toText(row?.laneId) === laneId) || {};
    return {
      lane_id: laneId,
      lane_name: toText(lane?.laneName) || laneId,
      pool_id: toText(lane?.poolId) || null,
      pool_name: toText(lane?.poolName) || null,
      order: Number(lane?.order || 0) || null,
      bpmn_node_ids: toArray(lane?.nodeIds).map((nodeId) => toText(nodeId)).filter(Boolean),
      elements_count: Number(stats?.elementsCount || 0),
      steps_count: Number(stats?.stepsCount || 0),
      time_total_sec: Number(stats?.timeTotalSec || 0),
      notes_count: Number(stats?.notesCount || 0),
      ai_questions_count: Number(stats?.aiQuestionsCount || 0),
      laneId: laneId,
      laneName: toText(lane?.laneName) || laneId,
      elementsCount: Number(stats?.elementsCount || 0),
      stepsCount: Number(stats?.stepsCount || 0),
      timeTotalSec: Number(stats?.timeTotalSec || 0),
      notesCount: Number(stats?.notesCount || 0),
      aiQuestionsCount: Number(stats?.aiQuestionsCount || 0),
    };
  });
  const canonicalPools = toArray(facts?.pools).map((pool) => ({
    pool_id: toText(pool?.poolId),
    pool_name: toText(pool?.poolName),
    process_ref: toText(pool?.processRef),
    order: Number(pool?.order || 0) || null,
  }));

  const subprocessMap = {};
  stepRows.forEach((step) => {
    const rawStep = asObject(stepRawById[step.stepId] || stepRawByNodeId[step?.bpmn?.nodeId]);
    const title = toText(rawStep?.subprocess || rawStep?.subprocess_name || rawStep?.subprocessName);
    if (!title) return;
    const key = normalizeLoose(title);
    if (!subprocessMap[key]) {
      subprocessMap[key] = {
        subprocessId: key || `sub_${Object.keys(subprocessMap).length + 1}`,
        title,
        stepsCount: 0,
        timeTotalSec: 0,
        laneIds: new Set(),
      };
    }
    subprocessMap[key].stepsCount += 1;
    subprocessMap[key].timeTotalSec += Number(step?.durationSec || 0);
    const laneId = toText(step?.laneId);
    if (laneId) subprocessMap[key].laneIds.add(laneId);
  });

  const subprocesses = Object.values(subprocessMap)
    .map((sp) => ({
      subprocessId: sp.subprocessId,
      title: sp.title,
      stepsCount: sp.stepsCount,
      timeTotalSec: sp.timeTotalSec,
      laneIds: Array.from(sp.laneIds),
    }))
    .sort((a, b) => toText(a?.title).localeCompare(toText(b?.title), "ru"));

  const graphNodes = Object.values(graphNodesById)
    .map((node) => {
      const nodeId = toText(node?.id);
      const graphPath = toText(graphNoByNodeId[nodeId] || branchPathByNodeId[nodeId]);
      const cls = classifyNode(nodeId, graph, mainlineSet, reachableSet);
      const timeModel = asObject(model?.nodeTimeByNodeId)?.[nodeId] || null;
      return {
        nodeId,
        nodeName: toText(node?.name) || nodeId,
        nodeType: toText(node?.type),
        laneId: toText(asObject(facts?.laneByNodeId?.[nodeId]).laneId),
        laneName: toText(asObject(facts?.laneByNodeId?.[nodeId]).laneName),
        graphPath,
        class: cls,
        incoming: toArray(incomingByNode[nodeId]).length,
        outgoing: toArray(outgoingByNode[nodeId]).length,
        timeLabel: toText(formatTimeModelLabel(timeModel)),
        notesCount: toArray(asObject(notesByElement[nodeId]).items).length,
        aiCount: aiItemsFromValue(aiByElement[nodeId], `el_${nodeId}`).length,
      };
    })
    .sort((a, b) => {
      const ac = { mainline: 1, branch: 2, detached: 3 }[toText(a?.class)] || 9;
      const bc = { mainline: 1, branch: 2, detached: 3 }[toText(b?.class)] || 9;
      if (ac !== bc) return ac - bc;
      const ap = toText(a?.graphPath || "ZZZ");
      const bp = toText(b?.graphPath || "ZZZ");
      if (ap !== bp) return ap.localeCompare(bp, "ru", { numeric: true, sensitivity: "base" });
      return toText(a?.nodeId).localeCompare(toText(b?.nodeId), "ru");
    });

  const graphFlows = Object.values(graphFlowsById)
    .map((flow) => {
      const flowId = toText(flow?.id);
      const sourceId = toText(flow?.sourceId);
      const targetId = toText(flow?.targetId);
      const sourcePath = toText(graphNoByNodeId[sourceId] || branchPathByNodeId[sourceId]);
      const targetPath = toText(graphNoByNodeId[targetId] || branchPathByNodeId[targetId]);
      const sourceClass = classifyNode(sourceId, graph, mainlineSet, reachableSet);
      const targetClass = classifyNode(targetId, graph, mainlineSet, reachableSet);
      let cls = "branch";
      if (sourceClass === "detached" || targetClass === "detached") cls = "detached";
      else if (sourceClass === "mainline" && targetClass === "mainline") cls = "mainline";
      return {
        flowId,
        sourceId,
        sourceName: toText(graphNodesById[sourceId]?.name || sourceId),
        sourcePath,
        targetId,
        targetName: toText(graphNodesById[targetId]?.name || targetId),
        targetPath,
        label: toText(flow?.condition || flow?.name),
        tier: resolveFlowTier(flowId, flowMetaMap),
        rtier: resolveFlowRtier(flowId, flowMetaMap),
        class: cls,
      };
    })
    .sort(flowSortByGraphPath);

  const bpmnNodes = toArray(facts?.nodes).map((node, idx) => {
    const nodeId = toText(node?.id);
    const laneMeta = asObject(facts?.laneByNodeId?.[nodeId]);
    const incomingFlowIds = toArray(factsIncomingByNodeId[nodeId]).map((flow) => toText(flow?.id)).filter(Boolean);
    const outgoingFlowIds = toArray(factsOutgoingByNodeId[nodeId]).map((flow) => toText(flow?.id)).filter(Boolean);
    const nodeClass = mainlineSet.has(nodeId) ? "mainline" : "branch";
    const nodeStep = stepRawByNodeId[nodeId] || null;
    const parsedTime = parseStepTimeModel(nodeStep, "step");
    const durationSec = pickPositiveInt(
      nodeStepTimeSecByNodeId[nodeId],
      nodeStep?.duration_sec,
      nodeStep?.durationSec,
      nodeStep?.step_time_sec,
      nodeStep?.stepTimeSec,
      parsedTime?.expected_sec,
      asObject(model?.nodeTimeByNodeId)?.[nodeId]?.expected_sec,
    );
    const notesCount = toArray(asObject(notesByElement[nodeId]).items).length;
    const aiCount = aiItemsFromValue(aiByElement[nodeId], `el_${nodeId}`).length;
    return {
      idx: Number(node?.order || idx + 1),
      bpmn_id: nodeId,
      type: toText(node?.type),
      name: toText(node?.name) || nodeId,
      lane_id: toText(laneMeta?.laneId) || null,
      incoming_flow_ids: incomingFlowIds,
      outgoing_flow_ids: outgoingFlowIds,
      tier: nodeTierFromIncoming({
        nodeId,
        incomingByNodeId: factsIncomingByNodeId,
        flowMetaMap,
        nodeType: toText(node?.type),
      }),
      class: nodeClass,
      duration_sec: durationSec > 0 ? durationSec : null,
      notes_count: notesCount,
      ai_count: aiCount,
    };
  });

  const bpmnFlows = toArray(facts?.flows).map((flow) => ({
    flow_id: toText(flow?.id),
    from_id: toText(flow?.sourceRef),
    to_id: toText(flow?.targetRef),
    label: toText(flow?.label || flow?.condition),
    condition: toText(flow?.condition),
    tier: resolveFlowTier(flow?.id, flowMetaMap),
    rtier: resolveFlowRtier(flow?.id, flowMetaMap),
    is_primary: primaryFlowIdSet.has(toText(flow?.id)),
    duration_sec: null,
  }));

  const interviewSteps = toArray(model?.timelineView).map((row, idx) => {
    const stepId = toText(row?.id) || `step_${idx + 1}`;
    const nodeId = toText(row?.node_bind_id || row?.node_id);
    const rawStep = asObject(stepRawById[stepId] || stepRawByNodeId[nodeId]);
    const laneMeta = asObject(facts?.laneByNodeId?.[nodeId]);
    const durationSec = pickPositiveInt(
      row?.work_duration_sec,
      row?.step_time_sec,
      rawStep?.work_duration_sec,
      rawStep?.duration_sec,
      rawStep?.durationSec,
      rawStep?.step_time_sec,
      rawStep?.stepTimeSec,
      nodeStepTimeSecByNodeId[nodeId],
      parseStepTimeModel(rawStep, "step")?.expected_sec,
    );
    const waitSec = pickPositiveInt(
      row?.wait_duration_sec,
      rawStep?.wait_duration_sec,
      rawStep?.waitDurationSec,
      rawStep?.wait_sec,
      rawStep?.waitSec,
      toNonNegativeInt(rawStep?.wait_min || rawStep?.waitMin) * 60,
    );
    const tier = toText(
      asObject(row?.between_branches_item)?.summary?.primaryTier
        || (toArray(asObject(row?.between_branches_item)?.branches).find((branch) => !!branch?.isPrimary)?.tier)
        || "",
    ).toUpperCase();
    const normalizedTier = normalizeFlowTier(tier);
    const variantTags = [];
    if (normalizedTier) variantTags.push(normalizedTier);
    if (toArray(asObject(row?.between_branches_item)?.branches).some((branch) => normalizeLoose(branch?.stopReason) === "loop")) {
      variantTags.push("loop");
    }
    const prevStep = idx > 0 ? toText(model?.timelineView?.[idx - 1]?.seq_label || model?.timelineView?.[idx - 1]?.seq || idx) : "";
    const nextStep = idx < toArray(model?.timelineView).length - 1
      ? toText(model?.timelineView?.[idx + 1]?.seq_label || model?.timelineView?.[idx + 1]?.seq || idx + 2)
      : "";
    const graphIncomingCount = nodeId ? toArray(factsIncomingByNodeId[nodeId]).length : 0;
    const graphOutgoingCount = nodeId ? toArray(factsOutgoingByNodeId[nodeId]).length : 0;
    const notesCount = nodeId ? toArray(asObject(notesByElement[nodeId]).items).length : 0;
    const aiCount = nodeId ? aiItemsFromValue(aiByElement[nodeId], `el_${nodeId}`).length : aiItemsFromValue(aiByStep[stepId], `step_${stepId}`).length;
    return {
      step_no: toText(row?.seq_label || row?.seq || idx + 1),
      step_id: stepId,
      order_index: Number(row?.order_index || row?.order || idx + 1),
      title: toText(row?.action || rawStep?.title || `Шаг ${idx + 1}`),
      lane_id: toText(laneMeta?.laneId) || null,
      bpmn_ref: nodeId || null,
      prev_step_no: prevStep || null,
      next_step_no: nextStep || null,
      variant_tags: variantTags,
      work_duration_sec: durationSec > 0 ? durationSec : null,
      wait_duration_sec: waitSec > 0 ? waitSec : null,
      duration_sec: durationSec > 0 ? durationSec : null,
      dod: collectStepDodChecks({
        title: toText(row?.action || rawStep?.title || `Шаг ${idx + 1}`),
        laneName: toText(row?.lane_name || rawStep?.lane_name || rawStep?.lane || rawStep?.role || rawStep?.area || laneMeta?.laneName),
        incomingCount: graphIncomingCount,
        outgoingCount: graphOutgoingCount,
        nodeType: toText(asObject(facts?.nodeById?.[nodeId]).type || row?.node_bind_kind),
        durationSec,
        notesCount,
        aiCount,
      }),
    };
  });

  const boundStepsCount = interviewSteps.filter((step) => !!toText(step?.bpmn_ref)).length;
  const totalDraftStepCount = interviewSteps.length || interviewStepsRaw.length || stepRows.length;
  const unboundStepsCount = Math.max(0, totalDraftStepCount - boundStepsCount);

  const counts = {
    bpmn: {
      nodesTotal: toArray(facts?.nodes).length,
      flowsTotal: toArray(facts?.flows).length,
      annotationsTotal: Number(facts?.annotationsCount || 0),
      subprocessNodesTotal: toArray(facts?.nodes).filter((node) => {
        const t = normalizeLoose(node?.type);
        return t === "subprocess" || t === "adhocsubprocess";
      }).length,
      poolsTotal: toArray(facts?.pools).length,
      lanesTotal: toArray(facts?.lanes).length,
    },
    interview: {
      stepsTotal: totalDraftStepCount,
      stepsBoundToBpmn: boundStepsCount,
      stepsUnbound: unboundStepsCount,
      subprocessGroupsTotal: subprocesses.length,
      notesSectionsTotal: Object.keys(notesByElement).length,
      notesGlobalTotal,
      notesByElementTotal,
      aiQuestionsTotal,
      aiQuestionsOpenTotal,
      aiQuestionsDoneTotal,
      exceptionsTotal: toArray(asObject(safeDraft?.interview).exceptions).length,
    },
    tiers: {
      P0: tierCounts.P0,
      P1: tierCounts.P1,
      P2: tierCounts.P2,
      None: tierCounts.None,
    },
  };
  const mainlineStepsCount = interviewSteps.filter((step) => mainlineSet.has(toText(step?.bpmn_ref))).length;
  const metrics = {
    total: {
      bpmn_nodes: counts.bpmn.nodesTotal,
      bpmn_flows: counts.bpmn.flowsTotal,
      interview_steps: counts.interview.stepsTotal,
      link_groups: linkGroups.length,
    },
    mainline: {
      bpmn_nodes: mainlineNodeIds.length,
      interview_steps: mainlineStepsCount,
      node_ids: [...mainlineNodeIds],
    },
    time_by_lane_sec: Object.values(byLaneSecMap).sort((a, b) => toText(a?.laneName).localeCompare(toText(b?.laneName), "ru")),
    time_by_tier_sec: ["P0", "P1", "P2", "None"].map((tier) => ({ tier, totalSec: Number(byTierSecMap[tier] || 0) })),
    coverage: {
      steps_bound_to_bpmn: boundStepsCount,
      steps_unbound: unboundStepsCount,
      bind_percent: counts.interview.stepsTotal > 0
        ? Math.round((boundStepsCount / counts.interview.stepsTotal) * 100)
        : 0,
      tiers: {
        ...counts.tiers,
      },
    },
  };

  return {
    meta: {
      processTitle: toText(uiState?.processTitle || safeDraft?.title || safeDraft?.name) || "Без названия",
      sessionTitle: toText(uiState?.sessionTitle || safeDraft?.title || safeDraft?.name) || "Без названия",
      generatedAtIso: new Date().toISOString(),
      version: toText(uiState?.version || "DoDSnapshot.v1"),
      mode: toText(uiState?.mode || ""),
      sessionId: toText(uiState?.sessionId || safeDraft?.id || safeDraft?.session_id),
    },
    counts,
    time: {
      unit: "sec",
      processTotalSec,
      waitTotalSec,
      mainlineTotalSec,
      byLaneSec: Object.values(byLaneSecMap).sort((a, b) => toText(a?.laneName).localeCompare(toText(b?.laneName), "ru")),
      byTierSec: ["P0", "P1", "P2", "None"].map((tier) => ({ tier, totalSec: Number(byTierSecMap[tier] || 0) })),
    },
    quality: {
      errorsTotal: qualityErrorsTotal,
      warningsTotal: qualityWarningsTotal,
      items: qualityItems,
      orphan_bpmn_nodes: toArray(bpmnQuality?.orphan_bpmn_nodes),
      dead_end_bpmn_nodes: toArray(bpmnQuality?.dead_end_bpmn_nodes),
      gateway_unjoined: toArray(bpmnQuality?.gateway_unjoined),
      link_integrity: toArray(bpmnQuality?.link_integrity),
      link_integrity_summary: asObject(bpmnQuality?.link_integrity_summary),
    },
    lanes: canonicalLanes,
    pools: canonicalPools,
    steps: stepRows,
    bpmn_nodes: bpmnNodes,
    bpmn_flows: bpmnFlows,
    link_groups: linkGroups,
    interview_steps: interviewSteps,
    metrics,
    subprocesses,
    r_variants: rVariants,
    r_tiers: {
      source: rtiersSource,
      flowMetaRtierCount: rtierFlowMetaEntries.length,
      scopeStartId: inferredScopeStartId,
      warning: rtiersSource === "inferred"
        ? "R-tier вычислен на лету (inferred)"
        : "",
    },
    graph: {
      mainlineNodeIds,
      graphNoByNodeId,
      nodes: graphNodes,
      flows: graphFlows,
    },
    technical: {
      flowMetaMap,
      reachableNodeIds: Array.from(reachableSet),
      detachedNodeIds: Object.keys(graphNodesById).filter((id) => !reachableSet.has(id)),
      bpmnReachableNodeIds: Array.from(factsReachableNodeIds),
      legacyQualityItems: collectQualityItems(qualityReport, safeDraft),
    },
  };
}

export function computeDodSnapshotFromDraft({
  draft,
  bpmnXml,
  qualityReport,
  uiState,
}) {
  const safeDraft = asObject(draft);
  const xmlText = toText(bpmnXml || safeDraft?.bpmn_xml || safeDraft?.bpmnXml);
  return computeDodSnapshot({
    draft: safeDraft,
    bpmnXml: xmlText,
    qualityReport,
    uiState,
  });
}
