import { useCallback, useEffect, useRef } from "react";
import { apiPatchSession } from "../../../lib/api/sessionApi";
import useAutosaveQueue from "./useAutosaveQueue";
import { parseAndProjectBpmnToInterview } from "./useInterviewProjection";
import { buildDiagramSessionPatchFromProjection } from "./diagramSessionPatchContract";
import { deriveActorsFromBpmn } from "../lib/deriveActorsFromBpmn";
import { traceProcess } from "../lib/processDebugTrace";
import { shortUserFacingError } from "../lib/userFacingErrorText";
import {
  asArray,
  asObject,
} from "../lib/processStageDomain";

function shortErr(x) {
  return shortUserFacingError(x, 160);
}

export default function useDiagramMutationLifecycle({
  sid,
  isLocal,
  draft,
  bpmnSync,
  coordinator,
  projectionHelpers,
  onSessionSync,
  onError,
}) {
  const draftRef = useRef(draft);

  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);

  useEffect(() => {
    if (typeof coordinator?.setDiagramMutationSaveActive === "function") {
      coordinator.setDiagramMutationSaveActive(true);
    }
    return () => {
      if (typeof coordinator?.setDiagramMutationSaveActive === "function") {
        coordinator.setDiagramMutationSaveActive(false);
      }
    };
  }, [coordinator]);

  const commitDiagramAutosave = useCallback(
    async (job, { isStale }) => {
      if (!sid) return true;

      const mutationKind = String(job?.mutation?.kind || "").trim().toLowerCase();
      traceProcess("diagram.autosave_start", { sid, mutation_kind: mutationKind });
      const saveRes = mutationKind.startsWith("xml.")
        ? await bpmnSync.saveFromXmlDraft()
        : await bpmnSync.saveFromModeler();
      traceProcess("diagram.autosave_saved", {
        sid,
        mutation_kind: mutationKind,
        ok: !!saveRes?.ok,
        xml_len: String(saveRes?.xml || "").length,
      });
      if (!saveRes?.ok) {
        const errLabel = mutationKind.startsWith("xml.") ? "XML" : "BPMN";
        onError?.(shortErr(saveRes?.error || `Не удалось сохранить ${errLabel} после изменения.`));
        return false;
      }

      const xmlFromSave = String(saveRes?.xml || "");
      const draftNow = asObject(draftRef.current);
      const fallbackXml = String(draftNow?.bpmn_xml || "");
      const xml = xmlFromSave.trim() ? xmlFromSave : fallbackXml;
      if (!xmlFromSave.trim() && fallbackXml.trim()) {
        traceProcess("diagram.autosave_xml_fallback", {
          sid,
          mutation_kind: mutationKind,
          fallback_len: fallbackXml.length,
          pending: saveRes?.pending ? 1 : 0,
        });
      }
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

      onSessionSync?.(optimisticSession);
      traceProcess("diagram.autosave_optimistic_sync", {
        sid,
        patch_keys: Object.keys(patch),
      });
      if (isLocal || isStale?.()) return true;
      if (Object.keys(patch).length === 0) return true;

      const saveDiagramStateVersion = Number(saveRes?.diagramStateVersion);
      const patchPayload = { ...patch };
      if (Number.isFinite(saveDiagramStateVersion) && saveDiagramStateVersion >= 0) {
        patchPayload.base_diagram_state_version = Math.round(saveDiagramStateVersion);
      }

      const patchRes = await apiPatchSession(sid, patchPayload);
      traceProcess("diagram.autosave_patch_backend", {
        sid,
        ok: !!patchRes.ok,
        patch_keys: Object.keys(patchPayload),
        base_diagram_state_version: (
          Number.isFinite(saveDiagramStateVersion) && saveDiagramStateVersion >= 0
            ? Math.round(saveDiagramStateVersion)
            : null
        ),
      });
      if (!patchRes.ok) {
        onError?.(shortErr(patchRes.error || "Не удалось синхронизировать Interview после изменения диаграммы."));
        return false;
      }

      if (isStale?.()) return true;
      const patchAck = asObject(patchRes.session);
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
      onSessionSync?.({
        ...patchAckPayload,
      });
      return true;
    },
    [sid, bpmnSync, projectionHelpers, onSessionSync, isLocal, onError],
  );

  const {
    schedule: scheduleDiagramAutosave,
    flush: flushDiagramAutosave,
    cancel: cancelDiagramAutosave,
    hasPending: hasPendingDiagramAutosave,
  } = useAutosaveQueue({
    enabled: !!sid,
    debounceMs: 350,
    onSave: commitDiagramAutosave,
  });

  useEffect(() => {
    cancelDiagramAutosave();
  }, [sid, cancelDiagramAutosave]);

  const queueDiagramMutation = useCallback(
    (mutation) => {
      if (!sid) return;
      const mutationKind = String(mutation?.kind || mutation || "diagram.change");
      traceProcess("diagram.queue_mutation", { sid, mutation_kind: mutationKind });
      scheduleDiagramAutosave({
        mutation: mutation && typeof mutation === "object" ? mutation : { kind: String(mutation || "diagram.change") },
        at: Date.now(),
      });
    },
    [sid, scheduleDiagramAutosave],
  );

  const flushDiagramBeforeTabSwitch = useCallback(
    async (currentTab, targetTab) => {
      const current = String(currentTab || "").toLowerCase();
      const target = String(targetTab || "").toLowerCase();
      if (!sid) return true;
      if (!["diagram", "xml"].includes(current)) return true;
      if (target === current) return true;
      if (!hasPendingDiagramAutosave()) return true;
      return flushDiagramAutosave();
    },
    [sid, hasPendingDiagramAutosave, flushDiagramAutosave],
  );

  return {
    queueDiagramMutation,
    flushDiagramBeforeTabSwitch,
  };
}
