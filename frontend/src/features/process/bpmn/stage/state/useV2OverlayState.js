import { useEffect, useRef } from "react";

function toText(v) {
  return String(v || "").trim();
}

function asObject(x) {
  if (x && typeof x === "object" && !Array.isArray(x)) return x;
  return {};
}

function useDebouncedCallback(fn, delayMs, options = {}) {
  const { leading = false, trailing = true } = options;
  const fnRef = useRef(fn);
  const timerRef = useRef(null);
  const calledLeadingRef = useRef(false);

  useEffect(() => {
    fnRef.current = fn;
  }, [fn]);

  const cancel = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    calledLeadingRef.current = false;
  };

  const flush = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (trailing) {
      fnRef.current();
    }
    calledLeadingRef.current = false;
  };

  const schedule = () => {
    if (leading && !calledLeadingRef.current && !timerRef.current) {
      calledLeadingRef.current = true;
      fnRef.current();
    }
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      if (trailing) {
        fnRef.current();
      }
      calledLeadingRef.current = false;
    }, delayMs);
  };

  useEffect(() => () => cancel(), []);

  return { schedule, flush, cancel };
}

/**
 * Central V2 overlay state manager.
 *
 * Holds the authoritative refs for `v2OverlaysEnabled` and `v2OverlaysExpanded`,
 * and provides debounced updates for element-note thread decorations.
 */
export function useV2OverlayState({
  v2OverlaysEnabled = false,
  v2OverlaysExpanded = false,
  sessionId,
  threadCountsRef,
  applyNotes,
  notesDebounceMs = 80,
}) {
  const enabledRef = useRef(!!v2OverlaysEnabled);
  const expandedRef = useRef(!!v2OverlaysExpanded);
  const applyNotesRef = useRef(applyNotes);
  const threadCountsRefIn = useRef(threadCountsRef);

  useEffect(() => {
    applyNotesRef.current = applyNotes;
    threadCountsRefIn.current = threadCountsRef;
  });

  useEffect(() => {
    enabledRef.current = !!v2OverlaysEnabled;
  }, [v2OverlaysEnabled]);

  useEffect(() => {
    expandedRef.current = !!v2OverlaysExpanded;
    if (typeof document === "undefined") return;
    document.querySelectorAll(".fpc-overlay-v2-host").forEach((host) => {
      host.classList.toggle("fpc-overlay-v2-host--expanded", expandedRef.current);
    });
  }, [v2OverlaysExpanded]);

  const { schedule: scheduleNotesUpdate, flush: flushNotesUpdate, cancel: cancelNotesUpdate } =
    useDebouncedCallback(
      () => {
        applyNotesRef.current?.("viewer");
        applyNotesRef.current?.("editor");
      },
      notesDebounceMs,
      { leading: false, trailing: true }
    );

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const onElementNoteThreadsChanged = (event) => {
      const detail = event?.detail && typeof event.detail === "object" ? event.detail : {};
      const sid = toText(detail?.sessionId || detail?.sid);
      const activeSid = toText(sessionId);
      if (sid && activeSid && sid !== activeSid) return;
      if (threadCountsRefIn.current) {
        threadCountsRefIn.current.current = asObject(detail?.countsByElementId);
      }
      scheduleNotesUpdate();
    };
    window.addEventListener("processmap:element-note-threads-changed", onElementNoteThreadsChanged);
    return () =>
      window.removeEventListener("processmap:element-note-threads-changed", onElementNoteThreadsChanged);
  }, [sessionId, scheduleNotesUpdate]);

  return {
    enabledRef,
    expandedRef,
    scheduleNotesUpdate,
    flushNotesUpdate,
    cancelNotesUpdate,
  };
}
