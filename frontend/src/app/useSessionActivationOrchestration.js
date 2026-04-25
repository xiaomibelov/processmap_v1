import { useCallback, useState } from "react";

import {
  apiGetSession,
  apiListProjectSessions,
  apiListProjects,
  apiPutBpmnXml,
} from "../lib/api.js";
import {
  getLatestBpmnSnapshot,
  shouldAutoRestoreFromSnapshot,
} from "../features/process/bpmn/snapshots/bpmnSnapshots.js";
import {
  readSelectionFromUrl,
  shouldSkipDuplicateUrlRestore,
} from "./useSessionRouteOrchestration.js";

export function shouldAttemptRequestedSessionRestore({
  requestedSessionId,
  currentSessionId,
  activeSessionId,
  confirmedSessionId,
  urlSessionId,
  requestedExists,
  isLocalSessionId,
}) {
  const requestedSid = String(requestedSessionId || "").trim();
  const currentSid = String(currentSessionId || "").trim();
  if (!requestedSid) return false;
  if (typeof isLocalSessionId === "function" && isLocalSessionId(requestedSid)) return false;
  if (requestedSid === currentSid) return false;
  return !shouldSkipDuplicateUrlRestore({
    currentSessionId: currentSid,
    requestedSessionId: requestedSid,
    activeSessionId,
    confirmedSessionId,
    urlSessionId,
    requestedExists,
  });
}

export function buildSnapshotRestorePutOptions({
  sessionLike,
  restoredSnapshot,
} = {}) {
  const session = sessionLike && typeof sessionLike === "object" ? sessionLike : {};
  const snapshot = restoredSnapshot && typeof restoredSnapshot === "object" ? restoredSnapshot : {};
  const rev = Number(session?.bpmn_xml_version ?? session?.version ?? snapshot?.rev ?? 0);
  const baseDiagramStateVersion = Number(session?.diagram_state_version ?? session?.diagramStateVersion);
  const options = {};
  if (Number.isFinite(rev) && rev >= 0) {
    options.rev = Math.round(rev);
  }
  if (Number.isFinite(baseDiagramStateVersion) && baseDiagramStateVersion >= 0) {
    options.baseDiagramStateVersion = Math.round(baseDiagramStateVersion);
  }
  return options;
}

export default function useSessionActivationOrchestration({
  projectId,
  setProjectId,
  projects,
  setProjects,
  draft,
  setDraftPersisted,
  resetDraft,
  setSessions,
  sessionNavNotice,
  setSessionNavNotice,
  setSnapshotRestoreNotice,
  refreshMeta,
  markOk,
  markFail,
  logNav,
  logCreateTrace,
  logDraftTrace,
  logSnapshotTrace,
  ensureArray,
  ensureObject,
  ensureDraftShape,
  sessionToDraft,
  projectIdOf,
  projectTitleOf,
  sessionIdOf,
  isLocalSessionId,
  fnv1aHex,
  routeOrchestration,
  initialProjectSelectionConsumedRef,
  suppressProjectAutoselectRef,
  openSessionReqSeqRef,
  projectWorkspaceHintsRef,
  createLocalSessionId,
}) {
  const [activationState, setActivationState] = useState({
    phase: "idle",
    projectId: "",
    sessionId: "",
    source: "",
    error: "",
  });

  const {
    initialSelectionRef,
    requestedSessionIdRef,
    activeSessionIdRef,
    confirmedSessionIdRef,
    setRequestedSessionId,
    rememberActiveSessionId,
    rememberConfirmedSessionId,
    clearSessionRestoreMemory,
  } = routeOrchestration;

  const setActivationPhase = useCallback((phase, payload = {}) => {
    setActivationState({
      phase: String(phase || "idle"),
      projectId: String(payload.projectId || "").trim(),
      sessionId: String(payload.sessionId || "").trim(),
      source: String(payload.source || "").trim(),
      error: String(payload.error || "").trim(),
    });
  }, []);

  const openSession = useCallback(async (sessionId, options = {}) => {
    const reqSeq = openSessionReqSeqRef.current + 1;
    openSessionReqSeqRef.current = reqSeq;
    const sid = String(sessionId || "").trim();
    const source = String(options?.source || "manual_select");
    setRequestedSessionId(sid);
    setActivationPhase("opening", {
      sessionId: sid,
      projectId: String(projectId || "").trim(),
      source,
    });
    logNav("open_session_start", { sessionId: sid || "-", source });
    logCreateTrace("OPEN_SESSION", {
      phase: "start",
      sid: sid || "-",
      projectId: String(projectId || "-"),
      reqSeq,
    });
    if (!sid) {
      clearSessionRestoreMemory();
      setSessionNavNotice(null);
      resetDraft(ensureDraftShape(null));
      setActivationPhase("idle", { source: "empty_sid" });
      logNav("open_session_empty", { source });
      logCreateTrace("OPEN_SESSION", {
        phase: "done",
        sid: "-",
        projectId: String(projectId || "-"),
        bpmnLen: 0,
        bpmnHash: fnv1aHex(""),
        mode: "empty_sid",
      });
      return;
    }

    if (isLocalSessionId(sid)) {
      rememberConfirmedSessionId(sid);
      rememberActiveSessionId(sid);
      setSessionNavNotice(null);
      resetDraft(ensureDraftShape(sid));
      setActivationPhase("active", { sessionId: sid, projectId: String(projectId || "").trim(), source });
      logNav("open_session_local", { sessionId: sid, source });
      logCreateTrace("OPEN_SESSION", {
        phase: "done",
        sid,
        projectId: String(projectId || "-"),
        bpmnLen: 0,
        bpmnHash: fnv1aHex(""),
        mode: "local",
      });
      return;
    }

    const r = await apiGetSession(sid);
    if (reqSeq !== openSessionReqSeqRef.current) return;
    if (!r.ok) {
      const status = Number(r?.status || 0);
      setActivationPhase("failed", {
        sessionId: sid,
        projectId: String(projectId || "").trim(),
        source,
        error: String(r.error || "api_get_session_failed"),
      });
      logCreateTrace("OPEN_SESSION", {
        phase: "done",
        sid,
        projectId: String(projectId || "-"),
        ok: 0,
        error: String(r.error || "api_get_session_failed"),
      });
      markFail(r.error);
      const isUnavailable = status === 401 || status === 403 || status === 404;
      if (isUnavailable) {
        setSessionNavNotice({
          code: `HTTP_${status || "ERR"}`,
          status,
          projectId: String(projectId || ""),
          sessionId: sid,
          message: `Сессия недоступна: ${String(r.error || "request failed")}`,
        });
      }
      logNav("open_session_error", { sessionId: sid, source, status, error: String(r?.error || "api_error") });
      return;
    }

    const nextRaw = r.session || ensureDraftShape(sid);
    const sidProject = String(nextRaw?.project_id || projectId || "").trim();
    if (sidProject && sidProject !== String(projectId || "").trim()) {
      setProjectId(sidProject);
    }
    const backendXml = String(nextRaw?.bpmn_xml || "");
    const backendHash = fnv1aHex(backendXml);
    let restoredFromSnapshot = false;
    let restoredSnapshot = null;
    let next = nextRaw;

    try {
      const latestSnapshot = await getLatestBpmnSnapshot({
        projectId: sidProject,
        sessionId: sid,
      });
      const snapshotXml = String(latestSnapshot?.xml || "");
      const snapshotHash = String(latestSnapshot?.hash || fnv1aHex(snapshotXml));
      const restoreDecision = shouldAutoRestoreFromSnapshot({
        backendXml,
        snapshot: latestSnapshot,
      });
      if (restoreDecision.restore) {
        restoredFromSnapshot = true;
        restoredSnapshot = latestSnapshot;
        next = {
          ...nextRaw,
          bpmn_xml: snapshotXml,
        };
        logSnapshotTrace("restore_apply", {
          sid,
          projectId: sidProject || "-",
          backendLen: backendXml.length,
          backendHash,
          snapshotLen: snapshotXml.length,
          snapshotHash,
          snapshotTs: Number(latestSnapshot?.ts || 0),
          reason: restoreDecision.reason,
        });
      }
    } catch (snapshotError) {
      logSnapshotTrace("restore_skip_error", {
        sid,
        error: String(snapshotError?.message || snapshotError || "snapshot_read_error"),
      });
    }

    const xml = String(next?.bpmn_xml || "");
    logDraftTrace("DRAFT_REPLACE", {
      sid,
      source: "open_session",
      len: xml.length,
      hash: fnv1aHex(xml),
    });
    setDraftPersisted(sessionToDraft(sid, next));
    rememberConfirmedSessionId(sid);
    rememberActiveSessionId(sid);
    setSessionNavNotice(null);
    if (restoredFromSnapshot && restoredSnapshot) {
      const ts = Number(restoredSnapshot?.ts || Date.now()) || Date.now();
      setSnapshotRestoreNotice({ sid, ts, nonce: Date.now() });
      void (async () => {
        const putRes = await apiPutBpmnXml(sid, xml, buildSnapshotRestorePutOptions({
          sessionLike: nextRaw,
          restoredSnapshot,
        }));
        logSnapshotTrace("restore_persist_backend", {
          sid,
          ok: putRes?.ok ? 1 : 0,
          status: Number(putRes?.status || 0),
          len: xml.length,
          hash: fnv1aHex(xml),
        });
      })();
    } else {
      setSnapshotRestoreNotice(null);
    }
    logCreateTrace("OPEN_SESSION", {
      phase: "done",
      sid,
      projectId: sidProject || "-",
      bpmnLen: xml.length,
      bpmnHash: fnv1aHex(xml),
      ok: 1,
    });
    logNav("open_session_done", { sessionId: sid, projectId: sidProject || projectId, source });
    setActivationPhase("active", {
      sessionId: sid,
      projectId: sidProject || String(projectId || "").trim(),
      source,
    });
    markOk("API OK");
  }, [
    clearSessionRestoreMemory,
    ensureDraftShape,
    fnv1aHex,
    isLocalSessionId,
    logCreateTrace,
    logDraftTrace,
    logNav,
    logSnapshotTrace,
    markFail,
    markOk,
    openSessionReqSeqRef,
    projectId,
    rememberActiveSessionId,
    rememberConfirmedSessionId,
    resetDraft,
    setActivationPhase,
    setDraftPersisted,
    setProjectId,
    setRequestedSessionId,
    setSessionNavNotice,
    setSnapshotRestoreNotice,
    sessionToDraft,
  ]);

  const refreshProjects = useCallback(async () => {
    setActivationPhase("restoring_projects", {
      projectId: String(projectId || "").trim(),
      sessionId: String(requestedSessionIdRef.current || "").trim(),
      source: "refreshProjects",
    });
    const ok = await refreshMeta();
    if (!ok) {
      setActivationPhase("failed", {
        projectId: String(projectId || "").trim(),
        error: "refresh_meta_failed",
        source: "refreshProjects",
      });
      return;
    }
    const r = await apiListProjects();
    if (!r.ok) {
      setActivationPhase("failed", {
        projectId: String(projectId || "").trim(),
        error: String(r.error || "api_list_projects_failed"),
        source: "refreshProjects",
      });
      return markFail(r.error);
    }
    const list = ensureArray(r.projects || r.items);
    setProjects(list);
    const selectionFromUrl = readSelectionFromUrl();
    const currentUrlProjectId = String(selectionFromUrl?.projectId || "").trim();
    const bootRequestedProjectId = initialProjectSelectionConsumedRef.current
      ? ""
      : String(initialSelectionRef.current?.projectId || "").trim();
    const preferredFromUrl = String(currentUrlProjectId || bootRequestedProjectId).trim();
    initialProjectSelectionConsumedRef.current = true;
    const suppressAutoselect = !!suppressProjectAutoselectRef.current;
    if (suppressAutoselect) {
      suppressProjectAutoselectRef.current = false;
    }
    const current = String(projectId || "").trim();
    if (current) {
      const existsCurrent = list.some((p) => projectIdOf(p) === current);
      if (existsCurrent) {
        setActivationPhase("idle", { projectId: current, source: "refreshProjects" });
        return;
      }
      if (preferredFromUrl && preferredFromUrl === current) {
        logNav("project_keep_requested_url", { projectId: current });
        setActivationPhase("idle", { projectId: current, source: "refreshProjects" });
        return;
      }
      setProjectId("");
      setSessions([]);
      setSessionNavNotice(null);
      clearSessionRestoreMemory();
      resetDraft(ensureDraftShape(null));
    }
    if (!list.length) {
      setActivationPhase("idle", { source: "refreshProjects" });
      return;
    }
    if (preferredFromUrl && !list.some((p) => projectIdOf(p) === preferredFromUrl)) {
      if (!current) {
        setProjectId(preferredFromUrl);
        logNav("project_restore_missing_from_list", { projectId: preferredFromUrl });
      }
      setActivationPhase("idle", { projectId: preferredFromUrl, source: "refreshProjects" });
      return;
    }
    const preferred = preferredFromUrl && list.some((p) => projectIdOf(p) === preferredFromUrl)
      ? preferredFromUrl
      : "";
    if (!preferred && suppressAutoselect) {
      logNav("project_autoselect_suppressed", {});
      setActivationPhase("idle", { source: "refreshProjects" });
      return;
    }
    if (!preferred) {
      logNav("project_keep_home", { projects: list.length });
      setActivationPhase("idle", { source: "refreshProjects" });
      return;
    }
    setProjectId(preferred);
    logNav("project_restore_from_url", { projectId: preferred });
    setActivationPhase("idle", { projectId: preferred, source: "refreshProjects" });
  }, [
    clearSessionRestoreMemory,
    ensureArray,
    ensureDraftShape,
    initialProjectSelectionConsumedRef,
    initialSelectionRef,
    logNav,
    markFail,
    projectId,
    projectIdOf,
    refreshMeta,
    requestedSessionIdRef,
    resetDraft,
    setActivationPhase,
    setProjectId,
    setProjects,
    setSessionNavNotice,
    setSessions,
    suppressProjectAutoselectRef,
  ]);

  const refreshSessions = useCallback(async (pid) => {
    const p = String(pid || "").trim();
    if (!p) {
      setSessions([]);
      setActivationPhase("idle", { source: "refreshSessions" });
      return;
    }
    setActivationPhase("restoring_sessions", {
      projectId: p,
      sessionId: String(requestedSessionIdRef.current || "").trim(),
      source: "refreshSessions",
    });
    logNav("sessions_refresh_start", { projectId: p });
    const r = await apiListProjectSessions(p);
    if (!r.ok) {
      setActivationPhase("failed", {
        projectId: p,
        sessionId: String(requestedSessionIdRef.current || "").trim(),
        source: "refreshSessions",
        error: String(r?.error || "api_list_project_sessions_failed"),
      });
      markFail(r.error);
      logNav("sessions_refresh_error", { projectId: p, status: Number(r?.status || 0), error: String(r?.error || "api_error") });
      return;
    }
    markOk("API OK");
    const nextSessions = ensureArray(r.sessions || r.items);
    setSessions(nextSessions);

    const currentSid = String(draft?.session_id || "").trim();
    if (currentSid && !isLocalSessionId(currentSid)) {
      const stillExists = nextSessions.some((s) => sessionIdOf(s) === currentSid);
      if (!stillExists) {
        setSessionNavNotice({
          code: "MISSING_IN_LIST",
          status: 404,
          projectId: p,
          sessionId: currentSid,
          message: `Сессия ${currentSid} не найдена в текущем проекте.`,
        });
        logNav("session_missing_in_list", { projectId: p, sessionId: currentSid });
      } else if (String(sessionNavNotice?.sessionId || "") === currentSid) {
        setSessionNavNotice(null);
      }
    }

    const requestedSid = String(requestedSessionIdRef.current || "").trim();
    const existsRequested = nextSessions.some((s) => sessionIdOf(s) === requestedSid);
    const routeSelection = readSelectionFromUrl();
    const shouldRestore = shouldAttemptRequestedSessionRestore({
      requestedSessionId: requestedSid,
      currentSessionId: currentSid,
      activeSessionId: activeSessionIdRef.current,
      confirmedSessionId: confirmedSessionIdRef.current,
      urlSessionId: routeSelection?.sessionId,
      requestedExists: existsRequested,
      isLocalSessionId,
    });
    if (!shouldRestore) {
      if (requestedSid && existsRequested) {
        logNav("url_restore_skip_confirmed", { projectId: p, sessionId: requestedSid });
      }
      setActivationPhase("idle", {
        projectId: p,
        sessionId: currentSid || requestedSid,
        source: "refreshSessions",
      });
      return;
    }
    setActivationPhase("restoring_session", {
      projectId: p,
      sessionId: requestedSid,
      source: "url_restore",
    });
    void openSession(requestedSid, { source: "url_restore" });
  }, [
    activeSessionIdRef,
    confirmedSessionIdRef,
    draft?.session_id,
    ensureArray,
    isLocalSessionId,
    logNav,
    markFail,
    markOk,
    openSession,
    requestedSessionIdRef,
    sessionIdOf,
    sessionNavNotice?.sessionId,
    setActivationPhase,
    setSessionNavNotice,
    setSessions,
  ]);

  const openWorkspaceSession = useCallback(async (sessionLike, options = {}) => {
    const row = ensureObject(sessionLike);
    const sid = String(row?.id || row?.session_id || sessionLike || "").trim();
    const pid = String(row?.project_id || "").trim();
    const wid = String(row?.workspace_id || "").trim();
    const source = String(options?.source || "workspace_dashboard").trim() || "workspace_dashboard";
    if (!sid) return;
    if (pid && wid) {
      projectWorkspaceHintsRef.current.set(pid, wid);
    }
    if (pid && pid !== String(projectId || "").trim()) {
      setProjectId(pid);
    }
    await openSession(sid, { source });
  }, [ensureObject, openSession, projectId, projectWorkspaceHintsRef, setProjectId]);

  const createLocalSession = useCallback(() => {
    const sid = typeof createLocalSessionId === "function"
      ? String(createLocalSessionId() || "").trim()
      : "";
    if (!sid) return "";
    rememberConfirmedSessionId(sid);
    rememberActiveSessionId(sid);
    resetDraft(ensureDraftShape(sid));
    setActivationPhase("active", {
      sessionId: sid,
      projectId: String(projectId || "").trim(),
      source: "local_create",
    });
    return sid;
  }, [
    createLocalSessionId,
    ensureDraftShape,
    projectId,
    rememberActiveSessionId,
    rememberConfirmedSessionId,
    resetDraft,
    setActivationPhase,
  ]);

  return {
    activationState,
    refreshProjects,
    refreshSessions,
    openSession,
    openWorkspaceSession,
    createLocalSession,
  };
}
