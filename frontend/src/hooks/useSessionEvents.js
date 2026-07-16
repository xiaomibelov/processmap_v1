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

const POLL_INTERVAL_MS = 15000;

function asText(value) {
  return String(value || "").trim();
}

function isLocalSessionId(sid) {
  return /^local_|^new_/.test(asText(sid));
}

function eventsUrl(sessionId) {
  const sid = asText(sessionId);
  if (!sid) return "";
  return apiRoutes.sessions.events(sid);
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
        // won't trigger session_deleted — so after N consecutive errors
        // we proactively check.
        if (onConnectionErrorRef.current) {
          onConnectionErrorRef.current(eventSource);
        }
      };
    }

    // ── Polling fallback ───────────────────────────────────────
    function startPolling() {
      if (stopped) return;
      pollTimer = setTimeout(async () => {
        if (stopped) return;
        try {
          const resp = await fetch(url, { method: "HEAD", credentials: "include" });
          if (resp.status === 404 && onDeletedRef.current) {
            onDeletedRef.current(sid);
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
