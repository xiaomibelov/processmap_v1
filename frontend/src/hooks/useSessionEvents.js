/**
 * useSessionEvents — Real-time session event subscription.
 *
 * Opens an EventSource (SSE) to /api/sessions/{sessionId}/events when a
 * valid server-side session is active. Handles session_deleted events by
 * triggering a callback so the consumer can redirect / clean up.
 *
 * Falls back to short-polling 404 checks when EventSource is not available
 * (SSE blocked by CSP / enterprise proxy).
 *
 * Usage:
 *   useSessionEvents(sessionId, {
 *     onDeleted: (sessionId) => { ... },
 *     onConnectionError: (error) => { ... },
 *   });
 */

import { useEffect, useRef } from "react";
import { apiRoutes } from "../lib/apiRoutes.js";
import { getAccessToken } from "../lib/apiCore.js";
import { markSessionNotFound } from "../features/session/sessionLiveness.js";

const POLL_INTERVAL_MS = 15000;

function asText(value) {
  return String(value || "").trim();
}

function isLocalSessionId(sid) {
  return /^local_|^new_/.test(asText(sid));
}

export function eventsUrl(sessionId) {
  const sid = asText(sessionId);
  if (!sid) return "";
  const base = apiRoutes.sessions.events(sid);
  // Native EventSource cannot set the Authorization header, so the access
  // token travels as a query param (accepted by the backend auth guard for
  // SSE paths only — EVENTS-401 fix).
  const token = asText(getAccessToken());
  if (!token) return base;
  return `${base}?access_token=${encodeURIComponent(token)}`;
}

/**
 * Subscribe to real-time events for a session.
 *
 * @param {string} sessionId
 * @param {Object} handlers
 * @param {(sessionId: string) => void} [handlers.onDeleted]  — called when session_deleted received
 * @param {(error: Event) => void} [handlers.onConnectionError] — optional SSE error handler
 * @param {Object} [options]
 * @param {boolean} [options.forcePolling=false] — skip SSE, use polling only
 */
export default function useSessionEvents(sessionIdRaw, handlers = {}, options = {}) {
  const sessionId = asText(sessionIdRaw);
  const onDeleted = typeof handlers?.onDeleted === "function" ? handlers.onDeleted : null;
  const onConnectionError = typeof handlers?.onConnectionError === "function" ? handlers.onConnectionError : null;
  const forcePolling = options?.forcePolling === true;

  // Keep callbacks in refs so the effect doesn't re-subscribe on callback change.
  const onDeletedRef = useRef(onDeleted);
  const onConnectionErrorRef = useRef(onConnectionError);
  onDeletedRef.current = onDeleted;
  onConnectionErrorRef.current = onConnectionError;

  const isActiveSession = !!sessionId && !isLocalSessionId(sessionId);

  useEffect(() => {
    if (!isActiveSession) return;

    const sid = sessionId;
    const url = eventsUrl(sid);
    let eventSource = null;
    let pollTimer = null;
    let stopped = false;

    // ── SSE path ──────────────────────────────────────────────
    function startEventSource() {
      if (stopped) return;
      if (eventSource) {
        eventSource.close();
      }
      try {
        eventSource = new EventSource(url, { withCredentials: true });
      } catch (err) {
        // EventSource not supported — fall back to polling immediately.
        startPolling();
        return;
      }

      eventSource.addEventListener("session_deleted", (event) => {
        try {
          const data = JSON.parse(event.data || "{}");
          // P-1: фиксируем в реестре — поллеры (presence/remote-poll/save)
          // останавливаются даже если UX-редирект по какой-то причине не сработал.
          markSessionNotFound(data.session_id || sid, { source: "session_events" });
          if (!stopped && onDeletedRef.current) {
            onDeletedRef.current(data.session_id || sid);
          }
        } catch {
          // ignore parse errors
        }
        if (eventSource) {
          eventSource.close();
          eventSource = null;
        }
        stopped = true;
      });

      eventSource.addEventListener("closed", () => {
        // Server closed the stream normally.
        if (eventSource) {
          eventSource.close();
          eventSource = null;
        }
      });

      eventSource.onerror = () => {
        // Browser will auto-reconnect for transient errors.
        // If the session was deleted while offline, the 404 on reconnect
        // won't trigger session_deleted — делаем одноразовую HEAD-проверку
        // (P-1: иначе presence/remote-poll 404'ятся бесконечно, см. frequency_map).
        if (onConnectionErrorRef.current) {
          onConnectionErrorRef.current(eventSource);
        }
        if (stopped) return;
        fetch(url, { method: "HEAD", credentials: "include" })
          .then((resp) => {
            if (resp.status === 404 && !stopped) {
              markSessionNotFound(sid, { source: "session_events_head" });
              if (onDeletedRef.current) onDeletedRef.current(sid);
              stopped = true;
              if (eventSource) {
                eventSource.close();
                eventSource = null;
              }
            }
          })
          .catch(() => {
            // сетевая ошибка — браузер продолжит reconnect сам
          });
      };
    }

    // ── Polling fallback ───────────────────────────────────────
    function startPolling() {
      if (stopped) return;
      pollTimer = setTimeout(async () => {
        if (stopped) return;
        try {
          const resp = await fetch(url, { method: "HEAD", credentials: "include" });
          if (resp.status === 404) {
            markSessionNotFound(sid, { source: "session_events_poll" });
            if (onDeletedRef.current) {
              onDeletedRef.current(sid);
            }
            stopped = true;
            return;
          }
        } catch {
          // Network error — try again next interval.
        }
        if (!stopped) {
          startPolling();
        }
      }, POLL_INTERVAL_MS);
    }

    // ── Start ──────────────────────────────────────────────────
    if (typeof window !== "undefined" && !forcePolling && typeof EventSource !== "undefined") {
      startEventSource();
    } else {
      startPolling();
    }

    // ── Cleanup ────────────────────────────────────────────────
    return () => {
      stopped = true;
      if (eventSource) {
        eventSource.close();
        eventSource = null;
      }
      if (pollTimer) {
        clearTimeout(pollTimer);
        pollTimer = null;
      }
    };
  }, [sessionId, isActiveSession, forcePolling]);
}
