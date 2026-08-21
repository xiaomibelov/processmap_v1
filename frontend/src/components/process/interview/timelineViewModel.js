import {
  toArray,
  toText,
  normalizeLoose,
  computeTimeline,
  laneColor,
} from "./utils.js";

function inferStepTypeFromNode(node) {
  const nodeType = toText(node?.nodeType).toLowerCase();
  const bpmnKind = toText(node?.bpmnKind).toLowerCase();
  if (nodeType === "timer" || bpmnKind === "intermediatecatchevent") return "waiting";
  if (nodeType === "message" || bpmnKind === "intermediatethrowevent") return "movement";
  return "operation";
}

function buildFallbackStepsFromBackend(backendNodes, graphNodeRank) {
  const list = toArray(backendNodes)
    .map((n, idx) => {
      const nodeId = toText(n?.id);
      if (!nodeId) return null;
      const title = toText(n?.title) || nodeId;
      const role = toText(n?.actorRole);
      const stepType = inferStepTypeFromNode(n);
      const rankVal = Number(graphNodeRank?.[nodeId]);
      const graphRank = Number.isFinite(rankVal) ? rankVal : Number.MAX_SAFE_INTEGER - 5000 + idx;
      const bpmnKind = toText(n?.bpmnKind).toLowerCase();
      const isBoundaryEvent = bpmnKind === "startevent" || bpmnKind === "endevent";
      const duration = isBoundaryEvent ? "0" : stepType === "movement" ? "5" : stepType === "waiting" ? "0" : "15";
      const wait = stepType === "waiting" ? "10" : "0";
      return {
        id: `auto_${nodeId}`,
        node_id: nodeId,
        bpmn_ref: nodeId,
        order_index: idx + 1,
        area: role,
        type: stepType,
        action: title,
        subprocess: toText(n?.parameters?.interview_subprocess),
        comment: toText(n?.parameters?.interview_comment),
        role,
        duration_min: duration,
        wait_min: wait,
        output: "",
        _rank: graphRank,
      };
    })
    .filter(Boolean)
    .sort((a, b) => Number(a?._rank || 0) - Number(b?._rank || 0));

  return list.map(({ _rank, ...rest }) => rest);
}

function isSubprocessKind(kindRaw) {
  const kind = toText(kindRaw).toLowerCase();
  return kind === "subprocess" || kind === "adhocsubprocess";
}

function sortByGraphRank(a, b) {
  const ar = Number(a?._graph_rank);
  const br = Number(b?._graph_rank);
  if (ar !== br) return ar - br;
  return Number(a?._orig_idx || 0) - Number(b?._orig_idx || 0);
}

function stepKey(step) {
  const key = toText(step?.id);
  if (key) return key;
  const idx = Number(step?._orig_idx);
  if (Number.isFinite(idx)) return `__step_${idx}`;
  return `__step_fallback_${toText(step?.node_bind_id || step?.node_id || step?.action || "unknown")}`;
}

function buildHierarchicalTimelineOrder(steps) {
  const sorted = [...toArray(steps)].sort(sortByGraphRank);
  if (!sorted.length) return [];

  const containerStepByNodeId = {};
  sorted.forEach((step) => {
    const nodeId = toText(step?.node_bind_id);
    if (!nodeId) return;
    if (!isSubprocessKind(step?.node_bind_kind)) return;
    if (!containerStepByNodeId[nodeId]) containerStepByNodeId[nodeId] = step;
  });

  const childrenByParentStepId = {};
  const childStepKeys = new Set();
  sorted.forEach((step) => {
    const parentNodeId = toText(step?.parent_subprocess_id);
    if (!parentNodeId) return;
    const ownNodeId = toText(step?.node_bind_id);
    if (ownNodeId && ownNodeId === parentNodeId) return;
    const parentStep = containerStepByNodeId[parentNodeId];
    if (!parentStep) return;
    const parentStepKey = stepKey(parentStep);
    const ownKey = stepKey(step);
    if (!childrenByParentStepId[parentStepKey]) childrenByParentStepId[parentStepKey] = [];
    childrenByParentStepId[parentStepKey].push(step);
    childStepKeys.add(ownKey);
  });

  Object.keys(childrenByParentStepId).forEach((parentStepId) => {
    childrenByParentStepId[parentStepId].sort(sortByGraphRank);
  });

  const topLevel = sorted.filter((step) => !childStepKeys.has(stepKey(step)));
  const out = [];
  const emitted = new Set();
  const recursionGuard = new Set();

  function pushWithChildren(step, path = [1], depth = 0, parentStepId = "") {
    const key = stepKey(step);
    if (emitted.has(key)) return;
    if (recursionGuard.has(key)) return;
    recursionGuard.add(key);

    const children = toArray(childrenByParentStepId[key]).filter((child) => !emitted.has(stepKey(child)));
    out.push({
      ...step,
      depth,
      is_subprocess_child: depth > 0,
      subprocess_parent_step_id: depth > 0 ? parentStepId : "",
      subprocess_children_count: children.length,
      seq_label: path.join("."),
    });
    emitted.add(key);

    children.forEach((child, idx) => {
      pushWithChildren(child, [...path, idx + 1], depth + 1, key);
    });
    recursionGuard.delete(key);
  }

  let topCounter = 0;
  topLevel.forEach((step) => {
    topCounter += 1;
    pushWithChildren(step, [topCounter], 0, "");
  });

  // Safety: include any disconnected leftovers once.
  sorted.forEach((step) => {
    const key = stepKey(step);
    if (emitted.has(key)) return;
    topCounter += 1;
    pushWithChildren(step, [topCounter], 0, "");
  });

  return out;
}

export function buildTimelineView({
  steps,
  backendNodes,
  graphNodeRank,
  laneMetaByNode = {},
  subprocessMetaByNode = {},
  preferGraphOrder = true,
}) {
  let timelineRaw = computeTimeline(steps);
  if (!timelineRaw.length) {
    const fallbackSteps = buildFallbackStepsFromBackend(backendNodes, graphNodeRank);
    timelineRaw = computeTimeline(fallbackSteps);
  }

  const byId = {};
  toArray(backendNodes).forEach((n) => {
    const id = toText(n?.id);
    if (!id) return;
    byId[id] = n;
  });

  const laneOrder = [];
  const laneMap = {};

  function nodeForStep(step) {
    const explicitId = toText(step?.bpmn_ref || step?.node_id);
    const byExplicit = byId[explicitId] || byId[toText(step?.id)];
    if (byExplicit) return byExplicit;
    const explicitLower = explicitId.toLowerCase();
    if (explicitLower.startsWith("startevent")) {
      const startNode = toArray(backendNodes).find((n) => String(n?.bpmnKind || "").toLowerCase() === "startevent");
      if (startNode) return startNode;
    }
    if (explicitLower.startsWith("endevent")) {
      const endNode = toArray(backendNodes).find((n) => String(n?.bpmnKind || "").toLowerCase() === "endevent");
      if (endNode) return endNode;
    }
    const actionKey = normalizeLoose(step?.action);
    if (actionKey) {
      const hits = toArray(backendNodes).filter((n) => normalizeLoose(n.title) === actionKey);
      if (hits.length === 1) return hits[0];
    }
    return null;
  }

  function laneMetaForStep(step, boundNode) {
    const nodeId = toText(boundNode?.id || step?.node_id);
    const byXml = laneMetaByNode && nodeId ? laneMetaByNode[nodeId] : null;
    if (byXml) {
      const laneName = toText(byXml.label || byXml.name) || "unassigned";
      const laneKey = toText(byXml.key) || normalizeLoose(laneName) || "unassigned";
      return { laneName, laneKey };
    }

    const direct = toText(step?.role) || toText(step?.area);
    if (direct) {
      const laneName = direct;
      return {
        laneName,
        laneKey: normalizeLoose(laneName) || "unassigned",
      };
    }

    const nodeHit = boundNode || nodeForStep(step);
    const laneName = toText(nodeHit?.actorRole) || "unassigned";
    return {
      laneName,
      laneKey: normalizeLoose(laneName) || "unassigned",
    };
  }

  function subprocessForStep(step, boundNode, subMeta) {
    const direct = toText(step?.subprocess);
    if (direct) return direct;
    const nodeHit = boundNode || nodeForStep(step);
    const fromNode = toText(nodeHit?.parameters?.interview_subprocess);
    if (fromNode) return fromNode;
    const fromParent = toText(subMeta?.parentSubprocessName);
    if (fromParent) return fromParent;
    return "";
  }

  const enriched = timelineRaw.map((step, idx) => {
    const boundNode = nodeForStep(step);
    const explicitNodeId = toText(step?.bpmn_ref || step?.node_id);
    const explicitNode = byId[explicitNodeId];
    const rankByNode = boundNode ? Number(graphNodeRank?.[boundNode.id]) : Number.NaN;
    const rankByExplicit = explicitNodeId ? Number(graphNodeRank?.[explicitNodeId]) : Number.NaN;
    const fallbackRank = Number.MAX_SAFE_INTEGER - 5000 + idx;
    const graphRank = Number.isFinite(rankByNode) ? rankByNode : Number.isFinite(rankByExplicit) ? rankByExplicit : fallbackRank;
    const laneMeta = laneMetaForStep(step, boundNode);
    const laneName = toText(laneMeta?.laneName) || "unassigned";
    const laneKey = toText(laneMeta?.laneKey) || normalizeLoose(laneName) || "unassigned";
    const nodeBindId = toText(boundNode?.id || step?.bpmn_ref || step?.node_id);
    const subMeta = subprocessMetaByNode?.[nodeBindId] || {};
    return {
      ...step,
      _orig_idx: idx,
      _graph_rank: graphRank,
      _order_index: Number(step?.order_index || step?.order || idx + 1),
      lane_name: laneName,
      lane_key: laneKey,
      node_bind_id: nodeBindId,
      node_bind_title: toText(boundNode?.title || ""),
      node_bind_kind: toText(boundNode?.bpmnKind || explicitNode?.bpmnKind),
      node_bound: !!boundNode,
      is_subprocess_container: !!subMeta?.isSubprocessContainer || isSubprocessKind(boundNode?.bpmnKind || explicitNode?.bpmnKind),
      parent_subprocess_id: toText(subMeta?.parentSubprocessId),
      parent_subprocess_name: toText(subMeta?.parentSubprocessName),
      subprocess_depth: Number(subMeta?.depth || 0),
      subprocess: subprocessForStep(step, boundNode, subMeta),
    };
  });

  if (preferGraphOrder) {
    enriched.sort(sortByGraphRank);
  } else {
    enriched.sort((a, b) => {
      const ao = Number(a?._order_index || 0);
      const bo = Number(b?._order_index || 0);
      if (ao !== bo) return ao - bo;
      return Number(a?._orig_idx || 0) - Number(b?._orig_idx || 0);
    });
  }

  const visualOrder = preferGraphOrder
    ? buildHierarchicalTimelineOrder(enriched)
    : enriched.map((step, idx) => ({
      ...step,
      depth: 0,
      is_subprocess_child: false,
      subprocess_parent_step_id: "",
      subprocess_children_count: 0,
      seq_label: String(idx + 1),
    }));

  let cursor = 0;
  return visualOrder.map((step, idx) => {
    const duration = Number(step.duration) || 0;
    const wait = Number(step.wait) || 0;
    const start = cursor;
    const end = cursor + duration + wait;
    cursor = end;

    const laneKey = step.lane_key || "unassigned";
    if (!laneMap[laneKey]) {
      laneOrder.push(laneKey);
      const laneIdx = laneOrder.length;
      laneMap[laneKey] = {
        key: laneKey,
        index: laneIdx,
        name: step.lane_name || "unassigned",
        color: laneColor(laneKey, laneIdx),
      };
    }

    return {
      ...step,
      seq: idx + 1,
      order_index: idx + 1,
      seq_label: toText(step?.seq_label) || String(idx + 1),
      duration,
      wait,
      t_plus: `T+${start}→${end}`,
      lane_name: laneMap[laneKey].name,
      lane_idx: laneMap[laneKey].index,
      lane_color: laneMap[laneKey].color,
    };
  });
}
