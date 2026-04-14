import {
  asArray,
  asObject,
  safeJson,
  buildInterviewPatchPayload,
} from "../lib/processStageDomain.js";

function normalizeInterviewBoundarySummary(interviewRaw = null) {
  const interview = asObject(interviewRaw);
  const boundaries = asObject(interview?.boundaries);
  return {
    trigger: String(boundaries?.trigger || "").trim(),
    start_shop: String(boundaries?.start_shop || boundaries?.startShop || "").trim(),
    finish_state: String(boundaries?.finish_state || boundaries?.finishState || "").trim(),
    finish_shop: String(boundaries?.finish_shop || boundaries?.finishShop || "").trim(),
    input_physical: String(boundaries?.input_physical || boundaries?.inputPhysical || "").trim(),
    output_physical: String(boundaries?.output_physical || boundaries?.outputPhysical || "").trim(),
  };
}

function normalizeInterviewStepSummary(stepRaw = null) {
  const step = asObject(stepRaw);
  return {
    id: String(step?.id || "").trim(),
    node_id: String(step?.node_id || step?.nodeId || "").trim(),
    bpmn_ref: String(step?.bpmn_ref || step?.bpmnRef || "").trim(),
    action: String(step?.action || "").trim(),
    area: String(step?.area || "").trim(),
    role: String(step?.role || "").trim(),
    type: String(step?.type || "").trim(),
    subprocess: String(step?.subprocess || "").trim(),
    comment: String(step?.comment || "").trim(),
    order_index: Number(step?.order_index ?? step?.order ?? step?.idx ?? 0) || 0,
  };
}

function normalizeInterviewTransitionSummary(transitionRaw = null) {
  const transition = asObject(transitionRaw);
  return {
    id: String(transition?.id || "").trim(),
    from_node_id: String(transition?.from_node_id || transition?.from || transition?.source_id || transition?.sourceId || "").trim(),
    to_node_id: String(transition?.to_node_id || transition?.to || transition?.target_id || transition?.targetId || "").trim(),
    when: String(transition?.when || "").trim(),
  };
}

export function buildDiagramInterviewSemanticFingerprint(interviewRaw = null) {
  const interview = asObject(interviewRaw);
  const steps = asArray(interview?.steps)
    .map((item) => normalizeInterviewStepSummary(item))
    .filter((step) => step.node_id || step.action || step.bpmn_ref)
    .sort((a, b) => {
      const orderCmp = Number(a.order_index || 0) - Number(b.order_index || 0);
      if (orderCmp !== 0) return orderCmp;
      const nodeCmp = String(a.node_id || "").localeCompare(String(b.node_id || ""));
      if (nodeCmp !== 0) return nodeCmp;
      return String(a.id || "").localeCompare(String(b.id || ""));
    });
  const transitions = asArray(interview?.transitions)
    .map((item) => normalizeInterviewTransitionSummary(item))
    .filter((item) => item.from_node_id && item.to_node_id)
    .sort((a, b) => {
      const fromCmp = String(a.from_node_id || "").localeCompare(String(b.from_node_id || ""));
      if (fromCmp !== 0) return fromCmp;
      const toCmp = String(a.to_node_id || "").localeCompare(String(b.to_node_id || ""));
      if (toCmp !== 0) return toCmp;
      const whenCmp = String(a.when || "").localeCompare(String(b.when || ""));
      if (whenCmp !== 0) return whenCmp;
      return String(a.id || "").localeCompare(String(b.id || ""));
    });
  const subprocesses = asArray(interview?.subprocesses)
    .map((item) => String(item || "").trim())
    .filter(Boolean)
    .sort((a, b) => String(a).localeCompare(String(b)));
  return safeJson({
    boundaries: normalizeInterviewBoundarySummary(interview),
    steps,
    transitions,
    subprocesses,
  });
}

export function hasMeaningfulDiagramInterviewDelta(previousInterviewRaw = null, nextInterviewRaw = null) {
  const previousFingerprint = buildDiagramInterviewSemanticFingerprint(previousInterviewRaw);
  const nextFingerprint = buildDiagramInterviewSemanticFingerprint(nextInterviewRaw);
  return previousFingerprint !== nextFingerprint;
}

export function buildDiagramSessionPatchFromProjection({
  draftInterviewRaw = null,
  nextInterviewRaw = null,
  nextNodesRaw = [],
  draftNodesRaw = [],
  nextEdgesRaw = [],
  draftEdgesRaw = [],
} = {}) {
  const nextInterview = asObject(nextInterviewRaw);
  const nextNodes = asArray(nextNodesRaw);
  const nextEdges = asArray(nextEdgesRaw);
  const savePlan = buildInterviewPatchPayload(
    nextInterview,
    nextNodes,
    draftNodesRaw,
    nextEdges,
    draftEdgesRaw,
  );
  const patch = {};
  const interviewChanged = hasMeaningfulDiagramInterviewDelta(draftInterviewRaw, nextInterview);
  if (interviewChanged) patch.interview = nextInterview;
  if (savePlan.nodesChanged) patch.nodes = nextNodes;
  if (savePlan.edgesChanged) patch.edges = nextEdges;
  return {
    patch,
    interviewChanged,
    nodesChanged: savePlan.nodesChanged === true,
    edgesChanged: savePlan.edgesChanged === true,
  };
}
