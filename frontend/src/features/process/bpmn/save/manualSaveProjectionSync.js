import { parseAndProjectBpmnToInterview } from "../../hooks/useInterviewProjection.js";
import { buildDiagramSessionPatchFromProjection } from "../../hooks/diagramSessionPatchContract.js";
import { deriveActorsFromBpmn } from "../../lib/deriveActorsFromBpmn.js";
import {
  asArray,
  asObject,
} from "../../lib/processStageDomain.js";

function toText(value) {
  return String(value || "").trim();
}

export function buildManualSaveProjectionSyncPlan({
  xmlText = "",
  draft = null,
  projectionHelpers = null,
} = {}) {
  const xml = toText(xmlText);
  if (!xml) {
    return {
      ok: false,
      reason: "empty_xml",
      error: "manual_save_projection_empty_xml",
    };
  }
  const draftValue = asObject(draft);
  const projected = parseAndProjectBpmnToInterview({
    xmlText: xml,
    draft: {
      ...draftValue,
      bpmn_xml: xml,
    },
    helpers: projectionHelpers,
    preferBpmn: true,
    forceTimelineFromBpmn: true,
  });
  if (!projected?.ok) {
    return {
      ok: false,
      reason: "projection_failed",
      error: String(projected?.error || "manual_save_projection_failed"),
    };
  }
  const nextInterview = asObject(projected.nextInterview);
  const nextNodes = asArray(projected.nextNodes);
  const nextEdges = asArray(projected.nextEdges);
  const patchPlan = buildDiagramSessionPatchFromProjection({
    draftInterviewRaw: draftValue?.interview,
    nextInterviewRaw: nextInterview,
    nextNodesRaw: nextNodes,
    draftNodesRaw: draftValue?.nodes,
    nextEdgesRaw: nextEdges,
    draftEdgesRaw: draftValue?.edges,
  });
  return {
    ok: true,
    xml,
    nextInterview,
    nextNodes,
    nextEdges,
    patch: asObject(patchPlan?.patch),
    patchPlan: patchPlan && typeof patchPlan === "object" ? patchPlan : {},
    derivedActors: deriveActorsFromBpmn(xml),
  };
}
