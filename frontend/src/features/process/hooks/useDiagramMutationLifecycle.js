import { useCallback, useEffect, useRef } from "react";
import { apiPatchSession } from "../../../lib/api/sessionApi";
import useAutosaveQueue from "./useAutosaveQueue";
import { resolveDiagramMutationSecondaryPatchBaseVersion } from "./diagramMutationSecondaryBaseVersion";
import { traceProcess } from "../lib/processDebugTrace";
import { shortUserFacingError } from "../lib/userFacingErrorText";
import { enqueueSessionPatchCasWrite } from "../stage/utils/sessionPatchCasCoordinator";
import { AUTOSAVE_CONFIG } from "../bpmn/save/autosaveConfig.js";
import {
  buildOptimisticSyncPayload,
  buildPatchAckPayload,
} from "../bpmn/save/sessionSyncBridge.js";
import {
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
  getBaseDiagramStateVersion,
  rememberDiagramStateVersion,
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
      if (saveRes?.pending) {
        traceProcess("diagram.autosave_pending_primary", {
          sid,
          mutation_kind: mutationKind,
        });
        return true;
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
      const { optimisticSession, patch } = buildOptimisticSyncPayload({
        sid,
        draft: draftNow,
        xml,
        projectionHelpers,
      });

      onSessionSync?.(optimisticSession);
      traceProcess("diagram.autosave_optimistic_sync", {
        sid,
        patch_keys: Object.keys(patch),
      });
      if (isLocal || isStale?.()) return true;
      if (Object.keys(patch).length === 0) return true;

      const secondaryBaseDiagramStateVersion = resolveDiagramMutationSecondaryPatchBaseVersion({
        sid,
        saveResult: saveRes,
        rememberDiagramStateVersion,
        getBaseDiagramStateVersion,
      });
      if (secondaryBaseDiagramStateVersion === null) {
        traceProcess("diagram.autosave_patch_skipped_missing_base", {
          sid,
          mutation_kind: mutationKind,
        });
        return true;
      }
      const patchPayload = {
        ...patch,
        base_diagram_state_version: secondaryBaseDiagramStateVersion,
      };

      const patchRes = await enqueueSessionPatchCasWrite({
        sessionId: sid,
        patch: patchPayload,
        apiPatchSession,
        getBaseDiagramStateVersion,
        rememberDiagramStateVersion,
        // FIX-BPMN-IMPORT-SAVE: XML только что сохранён через PUT /bpmn выше
        // (saveFromModeler/saveFromXmlDraft) → сессия XML-truth; nodes/edges
        // из проекции в PATCH не отправляем (409 DRAFT_GRAPH_READ_ONLY_XML_TRUTH).
        isXmlTruthSession: xml.trim() !== "",
      });
      traceProcess("diagram.autosave_patch_backend", {
        sid,
        ok: !!patchRes.ok,
        patch_keys: Object.keys(patchPayload),
        base_diagram_state_version: secondaryBaseDiagramStateVersion,
      });
      if (!patchRes.ok) {
        onError?.(shortErr(patchRes.error || "Не удалось синхронизировать Interview после изменения диаграммы."));
        return false;
      }

      if (isStale?.()) return true;
      onSessionSync?.(buildPatchAckPayload({
        sid,
        patchSession: patchRes?.session,
        optimisticSession,
      }));
      return true;
    },
    [
      sid,
      bpmnSync,
      projectionHelpers,
      onSessionSync,
      isLocal,
      onError,
      getBaseDiagramStateVersion,
      rememberDiagramStateVersion,
    ],
  );

  const {
    schedule: scheduleDiagramAutosave,
    flush: flushDiagramAutosave,
    cancel: cancelDiagramAutosave,
    hasPending: hasPendingDiagramAutosave,
  } = useAutosaveQueue({
    enabled: !!sid,
    debounceMs: AUTOSAVE_CONFIG.mutationQueue.debounceMs,
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
    flushPendingDiagramAutosave: flushDiagramAutosave,
    cancelPendingDiagramAutosave: cancelDiagramAutosave,
  };
}
