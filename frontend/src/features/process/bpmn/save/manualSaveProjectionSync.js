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
  const patch = asObject(patchPlan?.patch);
  // FIX-V (V1/H2): план всегда строится по непустому XML → сессия XML-truth.
  // Для XML-truth сессий nodes/edges НЕ персистятся сервером (аудит P6: раньше
  // silent no-op; после FIX-SAVE B5 — явный 409 DRAFT_GRAPH_READ_ONLY_XML_TRUTH,
  // который давал ложный companionError и тост «Метаданные версии пока не
  // синхронизированы» сразу после создания версии). Локальная проекция
  // (nextNodes/nextEdges) остаётся для React-состояния; в серверный patch
  // они не идут.
  delete patch.nodes;
  delete patch.edges;
  const planMeta = patchPlan && typeof patchPlan === "object" ? patchPlan : {};
  return {
    ok: true,
    xml,
    nextInterview,
    nextNodes,
    nextEdges,
    patch,
    patchPlan: planMeta,
    interviewChanged: planMeta.interviewChanged === true,
    nodesChanged: planMeta.nodesChanged === true,
    edgesChanged: planMeta.edgesChanged === true,
    derivedActors: deriveActorsFromBpmn(xml),
  };
}
