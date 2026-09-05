// Builders пейлоадов onSessionSync-каскада (contour canvas-save-pipeline-extraction-v1, п.3).
// Пейлоады перенесены дословно из хуков (MOVE, NOT REWRITE):
//   - buildSyncXmlPayload       ← useBpmnSync.js syncXmlToSession (был :226-232);
//   - buildOptimisticSyncPayload ← useDiagramMutationLifecycle.js (был :89-145;
//     projection + optimistic session; patch возвращается by-product'ом для
//     PATCH-стадии вызывающего кода);
//   - buildPatchAckPayload      ← useDiagramMutationLifecycle.js (был :194-207).
// Порядок вызовов, число синков (3 за commitDiagramAutosave) и truthOwner-обвязка
// в ProcessStage не меняются — меняется только место сборки литералов.
import { parseAndProjectBpmnToInterview } from "../../hooks/useInterviewProjection";
import { buildDiagramSessionPatchFromProjection } from "../../hooks/diagramSessionPatchContract";
import { deriveActorsFromBpmn } from "../../lib/deriveActorsFromBpmn";
import {
  asArray,
  asObject,
} from "../../lib/processStageDomain";

export function buildSyncXmlPayload({ sid, xml, source, derivedActors }) {
  return {
    id: sid,
    session_id: sid,
    bpmn_xml: xml,
    actors_derived: derivedActors,
    _sync_source: source,
  };
}

export function buildOptimisticSyncPayload({ sid, draft, xml, projectionHelpers }) {
  const draftNow = asObject(draft);
  const baseOptimistic = {
    ...draftNow,
    id: sid,
    session_id: sid,
    bpmn_xml: xml,
  };

  let optimisticSession = baseOptimistic;
  let patch = {};

  let derivedActors = [];
  if (xml.trim()) {
    derivedActors = deriveActorsFromBpmn(xml);
    const projected = parseAndProjectBpmnToInterview({
      xmlText: xml,
      draft: baseOptimistic,
      helpers: projectionHelpers,
      preferBpmn: true,
      forceTimelineFromBpmn: true,
    });

    if (projected.ok) {
      const nextInterview = asObject(projected.nextInterview);
      const nextNodes = asArray(projected.nextNodes);
      const nextEdges = asArray(projected.nextEdges);
      const patchPlan = buildDiagramSessionPatchFromProjection({
        draftInterviewRaw: draftNow?.interview,
        nextInterviewRaw: nextInterview,
        nextNodesRaw: nextNodes,
        draftNodesRaw: draftNow?.nodes,
        nextEdgesRaw: nextEdges,
        draftEdgesRaw: draftNow?.edges,
      });
      patch = patchPlan.patch;

      optimisticSession = {
        ...baseOptimistic,
        interview: nextInterview,
        nodes: nextNodes,
        edges: nextEdges,
        actors_derived: derivedActors,
      };
    }
  }

  if (!xml.trim()) {
    derivedActors = [];
  }

  if (!optimisticSession.actors_derived) {
    optimisticSession = {
      ...optimisticSession,
      actors_derived: derivedActors,
    };
  }

  return { optimisticSession, patch };
}

export function buildPatchAckPayload({ sid, patchSession, optimisticSession }) {
  const patchAck = asObject(patchSession);
  const patchAckVersion = Number(patchAck?.diagram_state_version ?? patchAck?.diagramStateVersion);
  const patchAckPayload = {
    id: sid,
    session_id: sid,
    actors_derived: asArray(optimisticSession?.actors_derived),
    _sync_source: "diagram.autosave_patch_ack",
  };
  if (Number.isFinite(patchAckVersion) && patchAckVersion >= 0) {
    patchAckPayload.diagram_state_version = Math.round(patchAckVersion);
  }
  return patchAckPayload;
}
