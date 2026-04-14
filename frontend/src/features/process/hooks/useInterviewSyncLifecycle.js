import { useCallback, useEffect, useRef } from "react";
import { apiPatchSession, apiRecompute } from "../../../lib/api/sessionApi";
import { createAiInputHash, executeAi } from "../../ai/aiExecutor";
import useAutosaveQueue from "./useAutosaveQueue";
import { parseAndProjectBpmnToInterview } from "./useInterviewProjection";
import { deriveActorsFromBpmn } from "../lib/deriveActorsFromBpmn";
import { traceProcess } from "../lib/processDebugTrace";
import { shortUserFacingError } from "../lib/userFacingErrorText";
import {
  asArray,
  asObject,
  safeJson,
  interviewNodesFingerprint,
  interviewEdgesFingerprint,
  buildInterviewPatchPayload,
  normalizeLoose,
  sanitizeGraphNodes,
  interviewHasContent,
  interviewHasTimeline,
  enrichInterviewWithNodeBindings,
  toNodeId,
  applyInterviewTransitionsToEdges,
} from "../lib/processStageDomain";

function shortErr(x) {
  return shortUserFacingError(x, 160);
}

function shouldLogInterviewTrace() {
  if (typeof window === "undefined") return false;
  if (window.__FPC_DEBUG_BPMN__) return true;
  try {
    return String(window.localStorage?.getItem("fpc_debug_bpmn") || "").trim() === "1";
  } catch {
    return false;
  }
}

function fnv1aHex(input) {
  const src = String(input || "");
  let hash = 0x811c9dc5;
  for (let i = 0; i < src.length; i += 1) {
    hash ^= src.charCodeAt(i);
    hash = Math.imul(hash >>> 0, 0x01000193) >>> 0;
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function logInterviewTrace(tag, payload = {}) {
  if (!shouldLogInterviewTrace()) return;
  const suffix = Object.entries(payload || {})
    .map(([k, v]) => `${k}=${String(v)}`)
    .join(" ");
  // eslint-disable-next-line no-console
  console.debug(`[INTERVIEW_${String(tag || "TRACE").toUpperCase()}] ${suffix}`.trim());
}

function shouldLogAiPersist() {
  if (typeof window === "undefined") return false;
  if (window.__FPC_DEBUG_AI__) return true;
  try {
    return String(window.localStorage?.getItem("fpc_debug_ai") || "").trim() === "1";
  } catch {
    return false;
  }
}

function summarizeAiQuestionsByElement(rawMap) {
  const map = asObject(rawMap);
  const elementIds = Object.keys(map).filter((id) => String(id || "").trim());
  let total = 0;
  elementIds.forEach((elementId) => {
    const listRaw = map[elementId];
    const list = Array.isArray(listRaw) ? listRaw : asArray(listRaw?.items);
    total += asArray(list).filter((item) => String(item?.qid || item?.id || "").trim() && String(item?.text || "").trim()).length;
  });
  return {
    elementCount: elementIds.length,
    itemCount: total,
  };
}

function logAiPersist(tag, payload = {}) {
  if (!shouldLogAiPersist()) return;
  const suffix = Object.entries(payload || {})
    .map(([k, v]) => `${k}=${String(v)}`)
    .join(" ");
  // eslint-disable-next-line no-console
  console.debug(`[AI_PERSIST] ${String(tag || "trace")} ${suffix}`.trim());
}

export default function useInterviewSyncLifecycle({
  sid,
  isLocal,
  isInterview,
  draft,
  onSessionSync,
  bpmnSync,
  projectionHelpers,
  onError,
}) {
  const interviewLastSavedRef = useRef("{}");
  const interviewLastSavedNodesRef = useRef("{}");
  const interviewLastSavedEdgesRef = useRef("{}");
  const interviewHydrateTriedRef = useRef({});
  const interviewEditSeqRef = useRef(0);
  const sessionEpochRef = useRef(0);
  const sidRef = useRef(String(sid || ""));

  useEffect(() => {
    sidRef.current = String(sid || "");
    sessionEpochRef.current += 1;
  }, [sid]);

  useEffect(() => {
    interviewEditSeqRef.current = 0;
    interviewLastSavedRef.current = safeJson(draft?.interview);
    interviewLastSavedNodesRef.current = interviewNodesFingerprint(draft?.nodes);
    interviewLastSavedEdgesRef.current = interviewEdgesFingerprint(draft?.edges);
  }, [sid, draft?.interview, draft?.nodes, draft?.edges]);

  const commitInterviewAutosave = useCallback(
    async (job, { isStale }) => {
      if (!sid || isLocal) return true;
      const callSid = String(sidRef.current || "");
      const callEpoch = Number(sessionEpochRef.current || 0);
      const isSessionStale = () =>
        callSid !== String(sidRef.current || "")
        || callEpoch !== Number(sessionEpochRef.current || 0);
      const patch = asObject(job?.patch);
      const optimisticSession = asObject(job?.optimisticSession);
      const editSeq = Number(job?.editSeq || 0);
      const patchInterview = asObject(patch?.interview);
      const hasAiQuestionsByElement =
        Object.prototype.hasOwnProperty.call(patchInterview, "ai_questions_by_element")
        || Object.prototype.hasOwnProperty.call(patchInterview, "aiQuestionsByElementId");
      const aiMapFromPatch = patchInterview.ai_questions_by_element || patchInterview.aiQuestionsByElementId;
      const aiPatchStats = summarizeAiQuestionsByElement(aiMapFromPatch);
      traceProcess("interview.autosave_start", {
        sid,
        edit_seq: editSeq,
        patch_keys: Object.keys(patch),
      });
      if (hasAiQuestionsByElement) {
        logAiPersist("patch_start", {
          sid,
          editSeq,
          elements: aiPatchStats.elementCount,
          size: aiPatchStats.itemCount,
        });
      }

      const patchRes = await apiPatchSession(sid, patch);
      if (isSessionStale()) return true;
      if (hasAiQuestionsByElement) {
        const sessionInterview = asObject(patchRes?.session?.interview);
        const aiMapFromSession = sessionInterview.ai_questions_by_element || sessionInterview.aiQuestionsByElementId || aiMapFromPatch;
        const aiSessionStats = summarizeAiQuestionsByElement(aiMapFromSession);
        logAiPersist("patch_done", {
          sid,
          editSeq,
          ok: patchRes?.ok ? 1 : 0,
          status: Number(patchRes?.status || 0),
          elements: aiSessionStats.elementCount,
          size: aiSessionStats.itemCount,
        });
      }
      logInterviewTrace("save", {
        sid,
        phase: "patch",
        ok: patchRes?.ok ? 1 : 0,
        status: Number(patchRes?.status || 0),
      });
      traceProcess("interview.autosave_patch_backend", {
        sid,
        edit_seq: editSeq,
        ok: !!patchRes.ok,
        patch_keys: Object.keys(patch),
      });
      if (!patchRes.ok) {
        onError?.(shortErr(patchRes.error || "Не удалось сохранить Interview"));
        return false;
      }
      const patchedSession = patchRes.session && typeof patchRes.session === "object" ? patchRes.session : optimisticSession;
      onSessionSync?.({
        ...patchedSession,
        actors_derived: asArray(optimisticSession?.actors_derived || draft?.actors_derived),
      });

      if (isStale?.() || isSessionStale()) return true;
      if (editSeq && editSeq !== interviewEditSeqRef.current) return true;

      const mutationType = String(job?.mutation?.type || "").trim().toLowerCase();
      const patchKeys = Object.keys(patch);
      const interviewPatchKeys = Object.keys(patchInterview);
      const onlyAiQuestionsByElementPatch =
        patchKeys.length === 1
        && patchKeys[0] === "interview"
        && interviewPatchKeys.length > 0
        && interviewPatchKeys.every((key) => key === "ai_questions_by_element" || key === "aiQuestionsByElementId");
      const skipRecomputeForAiQuestions =
        mutationType === "diagram.ai_questions_by_element.update"
        || onlyAiQuestionsByElementPatch;
      const skipRecomputeForReportBuildDebug = mutationType === "paths.report_build_debug.update";
      if (skipRecomputeForAiQuestions || skipRecomputeForReportBuildDebug) {
        logInterviewTrace("save", {
          sid,
          phase: skipRecomputeForReportBuildDebug ? "recompute_skip_report_build_debug" : "recompute_skip_ai_questions",
          mutation: mutationType || "unknown",
          patchKeys: patchKeys.join(",") || "-",
        });
        traceProcess("interview.autosave_recompute_skipped", {
          sid,
          edit_seq: editSeq,
          mutation_type: mutationType,
          reason: skipRecomputeForReportBuildDebug ? "report_build_debug" : "ai_questions_by_element",
        });
        return true;
      }

      const recomputeExec = await executeAi({
        toolId: "interview_autosave_recompute",
        sessionId: sid,
        projectId: String(draft?.project_id || draft?.projectId || ""),
        inputHash: createAiInputHash({
          sid,
          patch_keys: Object.keys(patch),
          patch,
          interview_hash: safeJson(patch?.interview || optimisticSession?.interview || draft?.interview || {}),
        }),
        payload: {
          source: "interview_autosave",
          patch_keys: Object.keys(patch),
        },
        mode: "live",
        run: () => apiRecompute(sid),
      });
      if (isSessionStale()) return true;
      logInterviewTrace("save", {
        sid,
        phase: "recompute",
        ok: recomputeExec?.ok ? 1 : 0,
        status: Number(recomputeExec?.result?.status || recomputeExec?.error?.status || 0),
        cached: recomputeExec?.cached ? 1 : 0,
        skipped: recomputeExec?.skipped ? 1 : 0,
      });
      traceProcess("interview.autosave_recompute", {
        sid,
        edit_seq: editSeq,
        ok: !!recomputeExec.ok,
        cached: recomputeExec?.cached ? 1 : 0,
        skipped: recomputeExec?.skipped ? 1 : 0,
      });
      if (!recomputeExec.ok) {
        if (recomputeExec?.error?.shouldNotify !== false) {
          onError?.(shortErr(recomputeExec?.error?.message || "Не удалось синхронизировать BPMN после сохранения Interview"));
        }
        return true;
      }
      if (recomputeExec.cached && recomputeExec?.error?.shouldNotify !== false) {
        onError?.("AI временно недоступен: показан последний успешный результат синхронизации (cached).");
      }
      if (isStale?.() || isSessionStale()) return true;

      const recomputeRes = recomputeExec.result;
      const recomputed = recomputeRes?.result && typeof recomputeRes.result === "object" ? recomputeRes.result : patchedSession;
      const recomputedXml = String(recomputed?.bpmn_xml || "");
      let syncedSession = recomputed;
      if (recomputedXml.trim()) {
        syncedSession = {
          ...(recomputed || {}),
          bpmn_xml: recomputedXml,
          actors_derived: deriveActorsFromBpmn(recomputedXml),
        };
      } else {
        const latestXml = await bpmnSync.fetchLatestXml({ syncSession: false, preferDraft: true });
        if (isSessionStale()) return true;
        if (latestXml?.ok) {
          const xml = String(latestXml.xml || "");
          if (xml.trim()) {
            const derivedActors = deriveActorsFromBpmn(xml);
            syncedSession = {
              ...(recomputed || {}),
              bpmn_xml: xml,
              actors_derived: derivedActors,
            };
          }
        }
      }
      onSessionSync?.(syncedSession);
      await bpmnSync.resetBackend();
      traceProcess("interview.autosave_done", {
        sid,
        edit_seq: editSeq,
      });
      return true;
    },
    [sid, isLocal, onSessionSync, bpmnSync, onError],
  );

  const {
    schedule: scheduleInterviewAutosave,
    flush: flushInterviewAutosave,
    cancel: cancelInterviewAutosave,
    hasPending: hasPendingInterviewAutosave,
  } = useAutosaveQueue({
    enabled: !!sid && !isLocal,
    debounceMs: 120,
    onSave: commitInterviewAutosave,
  });

  useEffect(() => {
    cancelInterviewAutosave();
  }, [sid, cancelInterviewAutosave]);

  const flushInterviewBeforeTabSwitch = useCallback(
    async (currentTab, targetTab) => {
      const target = String(targetTab || "").toLowerCase();
      if (String(currentTab || "").toLowerCase() !== "interview") return true;
      if (!sid || isLocal) return true;
      if (!["diagram", "xml", "review", "llm"].includes(target)) return true;
      if (!hasPendingInterviewAutosave()) return true;
      traceProcess("interview.flush_before_tab_switch", {
        sid,
        current: String(currentTab || "").toLowerCase(),
        target,
      });
      return flushInterviewAutosave();
    },
    [sid, isLocal, hasPendingInterviewAutosave, flushInterviewAutosave],
  );

  const invalidateHydrateForSession = useCallback(() => {
    if (!sid) return;
    delete interviewHydrateTriedRef.current[sid];
  }, [sid]);

  const markHydrateDoneForSession = useCallback(() => {
    if (!sid) return;
    interviewHydrateTriedRef.current[sid] = "done";
  }, [sid]);

  const markInterviewAsSaved = useCallback(
    (nextInterview, nextNodes, currentNodes, nextEdges, currentEdges) => {
      const savePlan = buildInterviewPatchPayload(nextInterview, nextNodes, currentNodes, nextEdges, currentEdges);
      interviewLastSavedRef.current = safeJson(nextInterview);
      interviewLastSavedNodesRef.current = savePlan.nextNodesHash;
      interviewLastSavedEdgesRef.current = savePlan.nextEdgesHash;
      return savePlan;
    },
    [],
  );

  useEffect(() => {
    let cancelled = false;
    async function hydrateInterviewFromBpmn() {
      if (!sid || isLocal || !isInterview) return;
      const hydrateSid = String(sidRef.current || "");
      const hydrateEpoch = Number(sessionEpochRef.current || 0);
      const isHydrateStale = () =>
        cancelled
        || hydrateSid !== String(sidRef.current || "")
        || hydrateEpoch !== Number(sessionEpochRef.current || 0);
      const state = String(interviewHydrateTriedRef.current[sid] || "");
      if (state === "done" || state === "inflight") return;
      interviewHydrateTriedRef.current[sid] = "inflight";
      logInterviewTrace("hydrate", {
        sid,
        source: "from_bpmn",
        phase: "start",
        state,
        isInterview: isInterview ? 1 : 0,
      });

      const xr = await bpmnSync.fetchLatestXml({ syncSession: false, preferDraft: true });
      if (isHydrateStale()) return;
      let xml = xr.ok ? String(xr.xml || "") : "";
      if (!xml.trim()) xml = String(draft?.bpmn_xml || "");
      if (!xml.trim() || isHydrateStale()) {
        delete interviewHydrateTriedRef.current[sid];
        logInterviewTrace("hydrate", {
          sid,
          source: "from_bpmn",
          phase: "skip_empty_xml",
          cancelled: cancelled ? 1 : 0,
        });
        return;
      }

      const projected = parseAndProjectBpmnToInterview({
        xmlText: xml,
        draft,
        helpers: projectionHelpers,
        preferBpmn: true,
      });
      if (!projected.ok) {
        delete interviewHydrateTriedRef.current[sid];
        logInterviewTrace("hydrate", {
          sid,
          source: "from_bpmn",
          phase: "projection_failed",
          xmlHash: fnv1aHex(xml),
        });
        return;
      }

      const parsed = projected.parsed;
      const currentInterview = asObject(draft?.interview);
      const parsedInterview = asObject(parsed.interview);
      const currentSteps = asArray(currentInterview.steps);
      const parsedSteps = asArray(parsedInterview.steps);
      const parsedFirst = asObject(parsedSteps[0]);
      const parsedFirstNodeId = toNodeId(parsedFirst?.node_id || parsedFirst?.nodeId || parsedFirst?.id);
      const parsedFirstAction = normalizeLoose(parsedFirst?.action);
      const parsedLast = asObject(parsedSteps[parsedSteps.length - 1]);
      const parsedLastNodeId = toNodeId(parsedLast?.node_id || parsedLast?.nodeId || parsedLast?.id);
      const parsedLastAction = normalizeLoose(parsedLast?.action);
      const hasShadowEventNodes = sanitizeGraphNodes(draft?.nodes).length !== asArray(draft?.nodes).length;
      const hasParsedFirstStep =
        !!parsedFirstNodeId
        && currentSteps.some((s) => {
          const sidNow = toNodeId(s?.node_id || s?.nodeId || s?.id);
          if (sidNow && sidNow === parsedFirstNodeId) return true;
          if (!parsedFirstAction) return false;
          return normalizeLoose(s?.action) === parsedFirstAction;
        });
      const hasParsedLastStep =
        !!parsedLastNodeId
        && currentSteps.some((s) => {
          const sidNow = toNodeId(s?.node_id || s?.nodeId || s?.id);
          if (sidNow && sidNow === parsedLastNodeId) return true;
          if (!parsedLastAction) return false;
          return normalizeLoose(s?.action) === parsedLastAction;
        });
      const currentLaneKeys = new Set(
        currentSteps
          .map((s) => normalizeLoose(s?.role || s?.area || ""))
          .filter(Boolean),
      );
      const parsedLaneKeys = new Set(
        parsedSteps
          .map((s) => normalizeLoose(s?.role || s?.area || ""))
          .filter(Boolean),
      );
      const missingParsedLaneInCurrent = Array.from(parsedLaneKeys).some((k) => !currentLaneKeys.has(k));
      const needsRepair =
        !interviewHasTimeline(currentInterview)
        || !hasParsedFirstStep
        || !hasParsedLastStep
        || parsedSteps.length > currentSteps.length
        || missingParsedLaneInCurrent
        || asArray(parsed.nodes).length > asArray(draft?.nodes).length
        || asArray(parsed.edges).length > asArray(draft?.edges).length
        || hasShadowEventNodes;
      if (!needsRepair) {
        interviewHydrateTriedRef.current[sid] = "done";
        logInterviewTrace("hydrate", {
          sid,
          source: "from_bpmn",
          phase: "skip_no_repair_needed",
          xmlHash: fnv1aHex(xml),
          currentInterviewHash: fnv1aHex(safeJson(currentInterview)),
          parsedInterviewHash: fnv1aHex(safeJson(parsedInterview)),
        });
        return;
      }

      const derivedActors = deriveActorsFromBpmn(xml);
      const nextInterview = asObject(projected.nextInterview);
      const nextNodes = asArray(projected.nextNodes);
      const nextEdges = asArray(projected.nextEdges);
      if (!interviewHasContent(nextInterview)) {
        delete interviewHydrateTriedRef.current[sid];
        logInterviewTrace("hydrate", {
          sid,
          source: "from_bpmn",
          phase: "skip_empty_interview",
          xmlHash: fnv1aHex(xml),
        });
        return;
      }

      const nextHash = safeJson(nextInterview);
      const savePlan = buildInterviewPatchPayload(nextInterview, nextNodes, draft?.nodes, nextEdges, draft?.edges);
      const nextNodesHash = savePlan.nextNodesHash;
      const nextEdgesHash = savePlan.nextEdgesHash;
      if (
        nextHash === interviewLastSavedRef.current
        && nextNodesHash === interviewLastSavedNodesRef.current
        && nextEdgesHash === interviewLastSavedEdgesRef.current
      ) {
        interviewHydrateTriedRef.current[sid] = "done";
        logInterviewTrace("hydrate", {
          sid,
          source: "from_bpmn",
          phase: "skip_same_hash",
          interviewHash: fnv1aHex(nextHash),
          nodesHash: fnv1aHex(nextNodesHash),
          edgesHash: fnv1aHex(nextEdgesHash),
        });
        return;
      }

      interviewLastSavedRef.current = nextHash;
      interviewLastSavedNodesRef.current = nextNodesHash;
      interviewLastSavedEdgesRef.current = nextEdgesHash;

      const optimisticSession = {
        ...(draft || {}),
        id: sid,
        session_id: sid,
        interview: nextInterview,
        bpmn_xml: xml,
        actors_derived: derivedActors,
        ...(savePlan.nodesChanged ? { nodes: nextNodes } : {}),
        ...(savePlan.edgesChanged ? { edges: nextEdges } : {}),
      };
      onSessionSync?.(optimisticSession);
      logInterviewTrace("apply", {
        sid,
        reason: "hydrate_from_bpmn",
        interviewHashBefore: fnv1aHex(safeJson(draft?.interview)),
        interviewHashAfter: fnv1aHex(nextHash),
        xmlHash: fnv1aHex(xml),
      });
      const r = await apiPatchSession(sid, savePlan.patch);
      if (isHydrateStale()) return;
      if (!r.ok && !cancelled) {
        onError?.(shortErr(r.error || "Не удалось заполнить Interview из BPMN"));
        delete interviewHydrateTriedRef.current[sid];
        logInterviewTrace("save", {
          sid,
          phase: "hydrate_patch",
          ok: 0,
          status: Number(r?.status || 0),
        });
        return;
      }
      interviewHydrateTriedRef.current[sid] = "done";
      logInterviewTrace("save", {
        sid,
        phase: "hydrate_patch",
        ok: 1,
        status: Number(r?.status || 200),
      });
    }
    hydrateInterviewFromBpmn();
    return () => {
      cancelled = true;
    };
  }, [sid, isLocal, isInterview, draft, onSessionSync, bpmnSync, projectionHelpers, onError]);

  const handleInterviewChange = useCallback(
    (nextInterview, mutationMeta = null) => {
      if (!sid) return;

      const payload = asObject(nextInterview);
      const synced = enrichInterviewWithNodeBindings(payload, sanitizeGraphNodes(draft?.nodes));
      const nextPayload = asObject(synced.interview);
      const nextNodes = asArray(synced.nodes);
      const nextEdges = applyInterviewTransitionsToEdges(nextPayload, draft?.edges);
      const payloadJson = safeJson(nextPayload);
      const savePlan = buildInterviewPatchPayload(nextPayload, nextNodes, draft?.nodes, nextEdges, draft?.edges);
      const nodesJson = savePlan.nextNodesHash;
      const edgesJson = savePlan.nextEdgesHash;
      const currentPayloadJson = safeJson(draft?.interview);
      const currentNodesJson = interviewNodesFingerprint(draft?.nodes);
      const currentEdgesJson = interviewEdgesFingerprint(draft?.edges);
      if (payloadJson === currentPayloadJson && nodesJson === currentNodesJson && edgesJson === currentEdgesJson) return;

      const editSeq = interviewEditSeqRef.current + 1;
      interviewEditSeqRef.current = editSeq;
      traceProcess("interview.change_detected", {
        sid,
        edit_seq: editSeq,
        mutation_type: String(mutationMeta?.type || ""),
        payload_changed: payloadJson !== currentPayloadJson,
        nodes_changed: nodesJson !== currentNodesJson,
        edges_changed: edgesJson !== currentEdgesJson,
      });

      const optimisticSession = {
        ...(draft || {}),
        id: sid,
        session_id: sid,
        interview: nextPayload,
        ...(savePlan.nodesChanged ? { nodes: nextNodes } : {}),
        ...(savePlan.edgesChanged ? { edges: nextEdges } : {}),
      };
      onSessionSync?.(optimisticSession);
      if (
        payloadJson === interviewLastSavedRef.current
        && nodesJson === interviewLastSavedNodesRef.current
        && edgesJson === interviewLastSavedEdgesRef.current
      ) return;

      if (isLocal) {
        interviewLastSavedRef.current = payloadJson;
        interviewLastSavedNodesRef.current = nodesJson;
        interviewLastSavedEdgesRef.current = edgesJson;
        return;
      }

      interviewLastSavedRef.current = payloadJson;
      interviewLastSavedNodesRef.current = nodesJson;
      interviewLastSavedEdgesRef.current = edgesJson;
      scheduleInterviewAutosave({
        patch: savePlan.patch,
        optimisticSession,
        editSeq,
        mutation: mutationMeta && typeof mutationMeta === "object" ? mutationMeta : null,
      });
      const mutationType = String(mutationMeta?.type || "").trim().toLowerCase();
      if (
        mutationType === "interview.add_step"
        || mutationType === "interview.delete_step"
        || mutationType === "interview.add_transition"
        || mutationType === "interview.update_transition"
        || mutationType === "interview.insert_between_transition"
        || mutationType === "interview.reorder_steps"
        || mutationType === "interview.group_subprocess"
        || mutationType === "interview.order_mode"
      ) {
        void flushInterviewAutosave();
      }
    },
    [sid, isLocal, draft, onSessionSync, scheduleInterviewAutosave, flushInterviewAutosave],
  );

  return {
    flushInterviewBeforeTabSwitch,
    invalidateHydrateForSession,
    markHydrateDoneForSession,
    markInterviewAsSaved,
    handleInterviewChange,
  };
}
