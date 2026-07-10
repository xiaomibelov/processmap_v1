import { useCallback, useEffect, useRef, useState } from "react";

const STORAGE_KEY = "processmap_sidebar_width";
const MIN_WIDTH = 300;
const MAX_WIDTH = 520;
const DEFAULT_WIDTH = 380;

// Only our own ephemeral/cache keys are ever evicted on quota pressure.
// User data (e.g. processmap_quick_pins) and foreign keys are never touched.
const CLEANUP_PREFIX = "processmap_";
const EPHEMERAL_PREFIXES = [
  "processmap_cache_",
  "processmap_tmp_",
  "processmap_old_",
  "processmap_stale_",
  "processmap_session_",
  "processmap_draft_",
];

function clampWidth(value) {
  return Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, value));
}

function isQuotaError(error) {
  return !!(
    error &&
    (error.name === "QuotaExceededError" || error.code === 22 || error.code === 1014)
  );
}

// Level 3 — safe read: any failure (private mode, disabled storage, corrupt
// value) falls back to DEFAULT_WIDTH instead of throwing.
function readWidth(storage) {
  try {
    if (!storage) return DEFAULT_WIDTH;
    const saved = storage.getItem(STORAGE_KEY);
    const parsed = Number(saved);
    return Number.isFinite(parsed) ? clampWidth(parsed) : DEFAULT_WIDTH;
  } catch (_) {
    return DEFAULT_WIDTH;
  }
}

// Remove only our own ephemeral keys to free space. Returns the count removed.
function cleanupOwnKeys(storage) {
  try {
    if (!storage) return 0;
    const keys = [];
    for (let i = 0; i < storage.length; i += 1) {
      const key = storage.key(i);
      if (
        key &&
        key.startsWith(CLEANUP_PREFIX) &&
        key !== STORAGE_KEY &&
        EPHEMERAL_PREFIXES.some((prefix) => key.startsWith(prefix))
      ) {
        keys.push(key);
      }
    }
    keys.forEach((key) => {
      try {
        storage.removeItem(key);
      } catch (_) {
        /* ignore */
      }
    });
    return keys.length;
  } catch (_) {
    return 0;
  }
}

// Level 2 — safe write: persist once; on quota, evict our ephemeral keys and
// retry once; if it still fails, warn and keep the UI working (no throw).
function writeWidth(storage, width) {
  try {
    if (!storage) return false;
    storage.setItem(STORAGE_KEY, String(width));
    return true;
  } catch (error) {
    if (!isQuotaError(error)) return false;
    cleanupOwnKeys(storage);
    try {
      storage.setItem(STORAGE_KEY, String(width));
      return true;
    } catch (_) {
      try {
        console.warn("Sidebar width not persisted: localStorage full");
      } catch (__) {
        /* ignore */
      }
      return false;
    }
  }
}

export default function useSidebarWidth() {
  const [width, setWidth] = useState(() =>
    readWidth(typeof window === "undefined" ? null : window.localStorage),
  );

  const isDraggingRef = useRef(false);
  const startXRef = useRef(0);
  const startWidthRef = useRef(width);
  const widthRef = useRef(width);
  widthRef.current = width; // fresh for handleEnd without re-registering listeners

  useEffect(() => {
    if (typeof window === "undefined") return undefined;

    function getClientX(event) {
      if (event.touches && event.touches.length > 0) {
        return event.touches[0].clientX;
      }
      return event.clientX;
    }

    function handleMove(event) {
      if (!isDraggingRef.current) return;
      // Level 1 — update React state for the live UI only; no storage write here.
      const delta = getClientX(event) - startXRef.current;
      setWidth(clampWidth(startWidthRef.current + delta));
    }

    function handleEnd() {
      if (!isDraggingRef.current) return;
      isDraggingRef.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      // Persist exactly once, on drag end, with graceful fallback.
      writeWidth(window.localStorage, widthRef.current);
    }

    document.addEventListener("mousemove", handleMove);
    document.addEventListener("mouseup", handleEnd);
    document.addEventListener("touchmove", handleMove, { passive: false });
    document.addEventListener("touchend", handleEnd);
    document.addEventListener("touchcancel", handleEnd);

    return () => {
      document.removeEventListener("mousemove", handleMove);
      document.removeEventListener("mouseup", handleEnd);
      document.removeEventListener("touchmove", handleMove);
      document.removeEventListener("touchend", handleEnd);
      document.removeEventListener("touchcancel", handleEnd);
    };
  }, []); // register listeners once; widthRef keeps handleEnd fresh

  const startDragging = useCallback((event) => {
    isDraggingRef.current = true;
    startXRef.current = event.clientX ?? event.touches?.[0]?.clientX ?? 0;
    startWidthRef.current = widthRef.current;
    document.body.style.cursor = "ew-resize";
    document.body.style.userSelect = "none";
  }, []);

  return { width, startDragging };
}

export {
  STORAGE_KEY,
  MIN_WIDTH,
  MAX_WIDTH,
  DEFAULT_WIDTH,
  clampWidth,
  readWidth,
  writeWidth,
  cleanupOwnKeys,
};
