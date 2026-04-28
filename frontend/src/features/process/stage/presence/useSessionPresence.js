import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { apiTouchSessionPresence } from "../../../../lib/api.js";

export const SESSION_PRESENCE_HEARTBEAT_MS = 45000;
export const SESSION_PRESENCE_TTL_MS = 180000;
const SESSION_PRESENCE_CLIENT_ID_KEY = "processmap:session-presence:client-id";

function toText(value) {
  return String(value || "").trim();
}

function randomClientId() {
  const cryptoObj = typeof window !== "undefined" ? window.crypto : null;
  if (cryptoObj && typeof cryptoObj.randomUUID === "function") {
    return cryptoObj.randomUUID();
  }
  return `tab_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

export function getSessionPresenceClientId(storage = null) {
  const store = storage || (typeof window !== "undefined" ? window.sessionStorage : null);
  try {
    const existing = toText(store?.getItem?.(SESSION_PRESENCE_CLIENT_ID_KEY));
    if (existing) return existing;
    const next = randomClientId();
    store?.setItem?.(SESSION_PRESENCE_CLIENT_ID_KEY, next);
    return next;
  } catch {
    return randomClientId();
  }
}

function normalizeLastSeenMs(value) {
  const raw = Number(value);
  if (!Number.isFinite(raw) || raw <= 0) return 0;
  return raw < 1000000000000 ? Math.round(raw * 1000) : Math.round(raw);
}

export function normalizeSessionPresenceUsers(itemsRaw = []) {
  const items = Array.isArray(itemsRaw) ? itemsRaw : [];
  return items
    .map((itemRaw) => {
      const item = itemRaw && typeof itemRaw === "object" ? itemRaw : {};
      const userId = toText(item.user_id || item.userId);
      const label = toText(item.display_name || item.displayName || item.full_name || item.fullName || item.email || userId);
      if (!userId && !label) return null;
      return {
        userId,
        label: label || "Пользователь",
        email: toText(item.email),
        fullName: toText(item.full_name || item.fullName),
        jobTitle: toText(item.job_title || item.jobTitle),
        lastSeenAt: normalizeLastSeenMs(item.last_seen_at || item.lastSeenAt),
        isCurrentUser: item.is_current_user === true || item.isCurrentUser === true,
      };
    })
    .filter(Boolean);
}

export default function useSessionPresence(sessionIdRaw = "", currentUserRaw = null, options = {}) {
  const sessionId = toText(sessionIdRaw);
  const currentUser = currentUserRaw && typeof currentUserRaw === "object" ? currentUserRaw : {};
  const currentUserId = toText(currentUser.id || currentUser.user_id || currentUser.email);
  const heartbeatMs = Math.max(5000, Number(options.heartbeatMs || SESSION_PRESENCE_HEARTBEAT_MS));
  const surface = toText(options.surface) || "process_stage";
  const touchPresence = typeof options.apiTouch === "function" ? options.apiTouch : apiTouchSessionPresence;
  const clientIdRef = useRef("");
  const mountedRef = useRef(false);
  const [activeUsers, setActiveUsers] = useState([]);
  const [ttlMs, setTtlMs] = useState(SESSION_PRESENCE_TTL_MS);
  const [lastError, setLastError] = useState("");

  const clearPresence = useCallback(() => {
    setActiveUsers([]);
    setLastError("");
  }, []);

  const heartbeat = useCallback(async (reason = "interval") => {
    if (!sessionId || !currentUserId) return { ok: false, reason: "disabled" };
    if (typeof document !== "undefined" && document.visibilityState === "hidden" && reason === "interval") {
      return { ok: false, reason: "hidden" };
    }
    const clientId = clientIdRef.current || getSessionPresenceClientId();
    clientIdRef.current = clientId;
    try {
      const out = await touchPresence(sessionId, { clientId, surface });
      if (!mountedRef.current) return out;
      if (!out?.ok) {
        setLastError(toText(out?.error || out?.reason || "presence_failed"));
        return out;
      }
      setActiveUsers(normalizeSessionPresenceUsers(out.active_users || out.activeUsers));
      const ttlSeconds = Number(out.ttl_seconds || out.ttlSeconds || 0);
      if (Number.isFinite(ttlSeconds) && ttlSeconds > 0) {
        setTtlMs(Math.round(ttlSeconds * 1000));
      }
      setLastError("");
      return out;
    } catch (error) {
      if (mountedRef.current) {
        setLastError(toText(error?.message || error || "presence_failed"));
      }
      return { ok: false, reason: "presence_failed" };
    }
  }, [currentUserId, sessionId, surface, touchPresence]);

  useEffect(() => {
    mountedRef.current = true;
    if (typeof window === "undefined" || typeof document === "undefined") {
      clearPresence();
      return () => {
        mountedRef.current = false;
      };
    }
    if (!sessionId || !currentUserId) {
      clearPresence();
      return () => {
        mountedRef.current = false;
      };
    }

    clientIdRef.current = getSessionPresenceClientId();
    void heartbeat("mount");
    const intervalId = window.setInterval(() => {
      void heartbeat("interval");
    }, heartbeatMs);
    const handleForeground = () => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      void heartbeat("foreground");
    };
    window.addEventListener("focus", handleForeground);
    document.addEventListener("visibilitychange", handleForeground);
    return () => {
      mountedRef.current = false;
      window.clearInterval(intervalId);
      window.removeEventListener("focus", handleForeground);
      document.removeEventListener("visibilitychange", handleForeground);
    };
  }, [clearPresence, currentUserId, heartbeat, heartbeatMs, sessionId]);

  return useMemo(() => ({
    activeUsers,
    clientId: clientIdRef.current,
    ttlMs,
    lastError,
    heartbeat,
  }), [activeUsers, heartbeat, lastError, ttlMs]);
}
