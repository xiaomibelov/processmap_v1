import { useCallback, useRef } from "react";
import { apiGetSession, apiPatchSession } from "../../../../../lib/api.js";

export default function useSessionStatusOptimisticUpdate({
  canChangeStatus,
  draft,
  isLocalSessionId,
  setIsChangingSessionStatus,
  setDraftPersisted,
  onSessionSync,
  refreshSessions,
  projectId,
  markFail,
  markOk,
  logNav,
}) {
  const statusChangeSnapshotRef = useRef(null);

  const changeCurrentSessionStatus = useCallback(async (nextStatus) => {
    if (!canChangeStatus) return { ok: false, error: "forbidden" };
    const sid = String(draft?.session_id || "").trim();
    if (!sid || isLocalSessionId(sid)) return { ok: false, error: "Сессия не выбрана." };
    const status = String(nextStatus || "").trim();
    if (!status) return { ok: false, error: "status_required" };

    let baseDiagramStateVersion = Number(
      draft?.diagram_state_version ?? draft?.diagramStateVersion ?? NaN,
    );
    if (!Number.isFinite(baseDiagramStateVersion) || baseDiagramStateVersion < 0) {
      const snapshot = await apiGetSession(sid);
      baseDiagramStateVersion = Number(
        snapshot?.session?.diagram_state_version
        ?? snapshot?.session?.diagramStateVersion
        ?? NaN,
      );
      if (!snapshot?.ok || !Number.isFinite(baseDiagramStateVersion) || baseDiagramStateVersion < 0) {
        const error = String(snapshot?.error || "Не удалось получить актуальную версию сессии.");
        markFail(error);
        return { ok: false, error };
      }
    }

    const previousInterviewStatus = draft?.interview?.status;
    const previousDirectStatus = draft?.status;
    statusChangeSnapshotRef.current = { interviewStatus: previousInterviewStatus, directStatus: previousDirectStatus };

    setIsChangingSessionStatus(true);
    setDraftPersisted((prev) => {
      const next = { ...prev };
      next.interview = next.interview && typeof next.interview === "object" ? { ...next.interview, status } : { status };
      next.status = status;
      return next;
    });

    const payload = {
      status,
      base_diagram_state_version: Math.round(baseDiagramStateVersion),
    };
    const r = await apiPatchSession(sid, payload);
    if (!r.ok) {
      setDraftPersisted((prev) => {
        const next = { ...prev };
        const snap = statusChangeSnapshotRef.current || {};
        next.interview = next.interview && typeof next.interview === "object" ? { ...next.interview } : {};
        if (snap.interviewStatus !== undefined) next.interview.status = snap.interviewStatus;
        else delete next.interview.status;
        if (snap.directStatus !== undefined) next.status = snap.directStatus;
        else delete next.status;
        return next;
      });
      if (r.status === 409) {
        markFail("Переход в выбранный статус недоступен для текущего состояния сессии.");
      } else {
        const statusErr = String(r.error || "").toLowerCase();
        const userMessage = statusErr.includes("invalid status transition")
          ? "Недопустимый переход статуса."
          : statusErr.includes("forbidden")
            ? "Недостаточно прав для изменения статуса."
            : String(r.error || "status_update_failed");
        markFail(userMessage);
      }
      setIsChangingSessionStatus(false);
      return { ok: false, error: String(r.error || "status_update_failed") };
    }
    onSessionSync(r.session || {});
    try {
      await refreshSessions(projectId);
    } catch (refreshError) {
      logNav?.("refresh_sessions_after_status_failed", { projectId, error: String(refreshError?.message || refreshError) });
    }
    setIsChangingSessionStatus(false);
    markOk("API OK");
    return { ok: true };
  }, [canChangeStatus, draft, isLocalSessionId, setIsChangingSessionStatus, setDraftPersisted, onSessionSync, refreshSessions, projectId, markFail, markOk, logNav]);

  return { changeCurrentSessionStatus, statusChangeSnapshotRef };
}
