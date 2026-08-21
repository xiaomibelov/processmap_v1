function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function asObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function asText(value) {
  return String(value || "").trim();
}

function toOrderIndex(stepRaw, fallback) {
  const step = asObject(stepRaw);
  const raw = Number(step?.order_index ?? step?.order ?? fallback);
  if (!Number.isFinite(raw) || raw <= 0) return Number(fallback || 1);
  return Math.floor(raw);
}

function readNodeId(stepRaw) {
  const step = asObject(stepRaw);
  return asText(
    step?.bpmn_id
    || step?.bpmn_ref
    || step?.bpmnRef
    || step?.node_id
    || step?.nodeId
    || step?.id,
  );
}

function readIncomingFlowId(stepRaw) {
  const step = asObject(stepRaw);
  const decision = asObject(step?.decision);
  return asText(
    step?.incoming_flow_id
    || step?.incomingFlowId
    || step?.flow_id
    || step?.flowId
    || step?.edge_id
    || step?.edgeId
    || decision?.incoming_flow_id
    || decision?.incomingFlowId,
  );
}

function readOutgoingFlowId(stepRaw) {
  const step = asObject(stepRaw);
  const decision = asObject(step?.decision);
  return asText(
    step?.selected_outgoing_flow_id
    || step?.selectedOutgoingFlowId
    || step?.selected_flow_id
    || step?.selectedFlowId
    || step?.outgoing_flow_id
    || step?.outgoingFlowId
    || decision?.selected_flow_id
    || decision?.selectedFlowId
    || decision?.outgoing_flow_id
    || decision?.outgoingFlowId,
  );
}

function readBranchLabel(stepRaw) {
  const step = asObject(stepRaw);
  const decision = asObject(step?.decision);
  return asText(
    step?.branch_label
    || step?.branchLabel
    || step?.selected_condition
    || step?.selectedCondition
    || decision?.selected_label
    || decision?.label
    || decision?.condition,
  );
}

export function buildPlaybackTimeline({ routeItems, scenarioLabel = "", pathId = "" } = {}) {
  const ordered = asArray(routeItems)
    .map((stepRaw, idx) => {
      const nodeId = readNodeId(stepRaw);
      if (!nodeId) return null;
      const step = asObject(stepRaw);
      return {
        raw: step,
        idx,
        orderIndex: toOrderIndex(stepRaw, idx + 1),
        nodeId,
        title: asText(step?.name || step?.title || step?.action || nodeId) || nodeId,
        lane: asText(step?.lane || step?.lane_name || step?.laneName),
        bpmnType: asText(step?.bpmn_type || step?.bpmnType || step?.type),
        incomingFlowId: readIncomingFlowId(step),
        outgoingFlowId: readOutgoingFlowId(step),
        branchLabel: readBranchLabel(step),
      };
    })
    .filter(Boolean);

  const events = ordered.map((step, idx) => {
    const prev = idx > 0 ? ordered[idx - 1] : null;
    const flowId = asText(step.incomingFlowId || prev?.outgoingFlowId || "");
    const branchLabel = asText(prev?.branchLabel || step?.branchLabel || "");
    const branchFlowId = asText(prev?.outgoingFlowId || "");
    return {
      index: idx,
      orderIndex: idx + 1,
      nodeId: step.nodeId,
      title: step.title,
      lane: step.lane,
      bpmnType: step.bpmnType,
      flowId: flowId || null,
      branchLabel: branchLabel || null,
      branchFlowId: branchFlowId || null,
      isLast: idx === ordered.length - 1,
    };
  });

  return {
    scenarioLabel: asText(scenarioLabel) || "Scenario",
    pathId: asText(pathId),
    total: events.length,
    events,
  };
}
