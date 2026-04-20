import { useCallback, useState } from "react";
import {
  apiCreateProjectSession,
  apiCreateSession,
  apiGetSession,
  apiListProjectSessions,
  apiListSessions,
} from "../../../lib/api";

function shouldTraceSessionsFallback() {
  if (typeof window === "undefined") return false;
  if (window.__FPC_TRACE_SESSIONS_FALLBACK__ === true) return true;
  try {
    return window.localStorage?.getItem("fpc:trace-sessions-fallback") === "1";
  } catch {
    return false;
  }
}

function sessionIdFrom(s) {
  return (s && (s.session_id || s.id)) || "";
}

export default function useSessions({ projectId = "", onOk, onFail } = {}) {
  const [sessions, setSessions] = useState([]);

  const refreshSessions = useCallback(
    async (pidArg) => {
      const pid = typeof pidArg === "string" ? pidArg : projectId;
      const useProject = typeof pid === "string" && pid.trim().length > 0;
      if (shouldTraceSessionsFallback()) {
        // eslint-disable-next-line no-console
        console.info("[TRACE_SESSIONS_FALLBACK]", {
          label: "refreshSessions",
          timestamp: Date.now(),
          pidArg: typeof pidArg === "string" ? pidArg : "(from hook projectId)",
          resolvedPid: pid,
          branch: useProject ? "project-scoped" : "global-fallback",
        });
      }

      const r = useProject ? await apiListProjectSessions(pid) : await apiListSessions();
      if (!r.ok) {
        onFail?.(String(r.error || "Не удалось загрузить сессии."));
        setSessions([]);
        return { ok: false, sessions: [] };
      }

      onOk?.();
      const list = Array.isArray(r.sessions) ? r.sessions : [];
      setSessions(list);
      return { ok: true, sessions: list };
    },
    [projectId, onOk, onFail]
  );

  const openSession = useCallback(
    async (sid) => {
      const sessionId = String(sid || "").trim();
      if (!sessionId) return { ok: false, session: null };

      const r = await apiGetSession(sessionId);
      if (!r.ok || !r.session) {
        onFail?.(String(r.error || "Не удалось открыть сессию."));
        return { ok: false, session: null };
      }

      onOk?.();
      return { ok: true, session: r.session };
    },
    [onOk, onFail]
  );

  const createBackendSession = useCallback(
    async ({ projectId: pidArg, mode, payload } = {}) => {
      const pid = typeof pidArg === "string" ? pidArg : projectId;
      const m = String(mode || "").trim();
      const body = payload && typeof payload === "object" ? payload : {};

      if (!m) return { ok: false, session: null };

      let r;
      if (pid) r = await apiCreateProjectSession(pid, m, body);
      else r = await apiCreateSession({ mode: m, ...(body || {}) });

      if (!r.ok || !r.session) {
        onFail?.(String(r.error || "Не удалось создать сессию."));
        return { ok: false, session: null };
      }

      onOk?.();

      const created = r.session;
      const sid = sessionIdFrom(created);

      // Мягко добавим в список (если это тот же scope)
      setSessions((prev) => {
        const next = Array.isArray(prev) ? prev.slice() : [];
        if (sid && !next.some((x) => sessionIdFrom(x) === sid)) next.unshift(created);
        return next;
      });

      return { ok: true, session: created };
    },
    [projectId, onOk, onFail]
  );

  return {
    sessions,
    refreshSessions,
    openSession,
    createBackendSession,
  };
}
