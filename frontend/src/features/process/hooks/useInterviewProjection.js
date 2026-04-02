function pickHelpers(helpers = {}) {
  return {
    asArray: helpers.asArray,
    asObject: helpers.asObject,
    interviewHasContent: helpers.interviewHasContent,
    mergeInterviewData: helpers.mergeInterviewData,
    sanitizeGraphNodes: helpers.sanitizeGraphNodes,
    mergeNodesById: helpers.mergeNodesById,
    mergeEdgesByKey: helpers.mergeEdgesByKey,
    enrichInterviewWithNodeBindings: helpers.enrichInterviewWithNodeBindings,
    parseBpmnToSessionGraph: helpers.parseBpmnToSessionGraph,
  };
}

export function projectParsedBpmnToInterview({
  parsed,
  draft,
  helpers,
  preferBpmn = true,
  canAutofillInterview = false,
  forceTimelineFromBpmn = false,
  replaceGraph = false,
}) {
  const h = pickHelpers(helpers);
  if (!parsed || !parsed.ok) {
    return { ok: false, error: parsed?.error || "BPMN parse failed" };
  }
  const asArray = h.asArray;
  const asObject = h.asObject;
  const interviewHasContent = h.interviewHasContent;
  const mergeInterviewData = h.mergeInterviewData;
  const sanitizeGraphNodes = h.sanitizeGraphNodes;
  const mergeNodesById = h.mergeNodesById;
  const mergeEdgesByKey = h.mergeEdgesByKey;
  const enrichInterviewWithNodeBindings = h.enrichInterviewWithNodeBindings;

  const currentInterview = asObject(draft?.interview);
  const importedInterview = asObject(parsed.interview);
  const importedRoles = asArray(parsed.roles).map((x) => String(x || "").trim()).filter(Boolean);
  const importedStartRoleRaw = String(parsed.start_role || "").trim();
  const importedStartRole = importedRoles.includes(importedStartRoleRaw) ? importedStartRoleRaw : (importedRoles[0] || "");

  const shouldUseImportedAsBase = replaceGraph || canAutofillInterview || !interviewHasContent(currentInterview);
  const mergedInterview = shouldUseImportedAsBase
    ? importedInterview
    : mergeInterviewData(currentInterview, importedInterview, preferBpmn ? { preferBpmn: true } : undefined);
  if (forceTimelineFromBpmn) {
    mergedInterview.steps = asArray(importedInterview.steps).map((s) => ({ ...s }));
    mergedInterview.transitions = asArray(importedInterview.transitions).map((t) => ({ ...t }));
    mergedInterview.subprocesses = asArray(importedInterview.subprocesses).map((x) => String(x || ""));
  }

  const mergedNodes = replaceGraph
    ? mergeNodesById([], parsed.nodes)
    : mergeNodesById(sanitizeGraphNodes(draft?.nodes), parsed.nodes);
  const mergedEdges = replaceGraph
    ? mergeEdgesByKey([], parsed.edges)
    : mergeEdgesByKey(draft?.edges, parsed.edges);
  const synced = enrichInterviewWithNodeBindings(mergedInterview, mergedNodes);
  const nextInterview = asObject(synced.interview);
  const nextNodes = asArray(synced.nodes);
  const nextEdges = asArray(mergedEdges);

  return {
    ok: true,
    parsed,
    nextInterview,
    nextNodes,
    nextEdges,
    importedRoles,
    importedStartRole,
  };
}

export function parseAndProjectBpmnToInterview({
  xmlText,
  draft,
  helpers,
  preferBpmn = true,
  canAutofillInterview = false,
  forceTimelineFromBpmn = false,
  replaceGraph = false,
}) {
  const h = pickHelpers(helpers);
  const parsed = h.parseBpmnToSessionGraph(String(xmlText || ""));
  if (!parsed || !parsed.ok) return { ok: false, error: parsed?.error || "BPMN parse failed", parsed };
  return projectParsedBpmnToInterview({
    parsed,
    draft,
    helpers: h,
    preferBpmn,
    canAutofillInterview,
    forceTimelineFromBpmn,
    replaceGraph,
  });
}
