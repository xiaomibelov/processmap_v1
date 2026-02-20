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

export function buildTimelineView({ steps, backendNodes, graphNodeRank, laneMetaByNode = {} }) {
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
    const explicitId = toText(step?.node_id);
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

  function subprocessForStep(step) {
    const direct = toText(step?.subprocess);
    if (direct) return direct;
    const nodeHit = nodeForStep(step);
    const fromNode = toText(nodeHit?.parameters?.interview_subprocess);
    if (fromNode) return fromNode;
    return "";
  }

  const enriched = timelineRaw.map((step, idx) => {
    const boundNode = nodeForStep(step);
    const rankByNode = boundNode ? Number(graphNodeRank?.[boundNode.id]) : Number.NaN;
    const explicitNodeId = toText(step?.node_id);
    const rankByExplicit = explicitNodeId ? Number(graphNodeRank?.[explicitNodeId]) : Number.NaN;
    const fallbackRank = Number.MAX_SAFE_INTEGER - 5000 + idx;
    const graphRank = Number.isFinite(rankByNode) ? rankByNode : Number.isFinite(rankByExplicit) ? rankByExplicit : fallbackRank;
    const laneMeta = laneMetaForStep(step, boundNode);
    const laneName = toText(laneMeta?.laneName) || "unassigned";
    const laneKey = toText(laneMeta?.laneKey) || normalizeLoose(laneName) || "unassigned";
    return {
      ...step,
      _orig_idx: idx,
      _graph_rank: graphRank,
      lane_name: laneName,
      lane_key: laneKey,
      node_bind_id: toText(boundNode?.id || step?.node_id),
      node_bind_title: toText(boundNode?.title || ""),
      node_bound: !!boundNode,
      subprocess: subprocessForStep(step),
    };
  });

  enriched.sort((a, b) => {
    const ar = Number(a?._graph_rank);
    const br = Number(b?._graph_rank);
    if (ar !== br) return ar - br;
    return Number(a?._orig_idx || 0) - Number(b?._orig_idx || 0);
  });

  let cursor = 0;
  return enriched.map((step, idx) => {
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
      duration,
      wait,
      t_plus: `T+${start}→${end}`,
      lane_name: laneMap[laneKey].name,
      lane_idx: laneMap[laneKey].index,
      lane_color: laneMap[laneKey].color,
    };
  });
}
