import { useEffect, useMemo, useRef, useState } from "react";
import { apiHeartbeatSessionPresence } from "../../../lib/api.js";
import { normalizeOtherActiveUsersCount } from "./presenceCopy.js";

const DEFAULT_HEARTBEAT_MS = 20_000;

function normalizeSessionId(rawSessionId) {
  return String(rawSessionId || "").trim();
}

export default function useSessionPresence({ sessionId, enabled = true, heartbeatMs = DEFAULT_HEARTBEAT_MS }) {
  const sid = useMemo(() => normalizeSessionId(sessionId), [sessionId]);
  const isEnabled = Boolean(enabled) && sid.length > 0;
  const intervalMs = Math.max(5_000, Number(heartbeatMs || DEFAULT_HEARTBEAT_MS) || DEFAULT_HEARTBEAT_MS);
  const requestSeqRef = useRef(0);
  const [state, setState] = useState(() => ({
    status: "idle",
    otherActiveUsersCount: 0,
  }));

  useEffect(() => {
    requestSeqRef.current += 1;
    const scopeSeq = requestSeqRef.current;
    let isDisposed = false;
    let timerId = 0;

    function setNext(next) {
      if (isDisposed || requestSeqRef.current !== scopeSeq) return;
      setState(next);
    }

    async function tick() {
      const response = await apiHeartbeatSessionPresence(sid);
      if (!response?.ok) {
        setNext({
          status: "error",
          otherActiveUsersCount: 0,
        });
      } else {
        setNext({
          status: "ready",
          otherActiveUsersCount: normalizeOtherActiveUsersCount(response?.presence?.other_active_users_count),
        });
      }
      if (isDisposed || requestSeqRef.current !== scopeSeq) return;
      timerId = window.setTimeout(() => {
        void tick();
      }, intervalMs);
    }

    if (!isEnabled) {
      setState({ status: "idle", otherActiveUsersCount: 0 });
      return () => {
      };
    }

    setState({ status: "loading", otherActiveUsersCount: 0 });
    void tick();

    return () => {
      isDisposed = true;
      requestSeqRef.current += 1;
      if (timerId) window.clearTimeout(timerId);
      setState({ status: "idle", otherActiveUsersCount: 0 });
    };
  }, [intervalMs, isEnabled, sid]);

  return {
    status: state.status,
    otherActiveUsersCount: normalizeOtherActiveUsersCount(state.otherActiveUsersCount),
    hasOtherUsers: normalizeOtherActiveUsersCount(state.otherActiveUsersCount) > 0,
  };
}

