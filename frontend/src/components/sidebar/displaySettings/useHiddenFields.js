// Per-field chip filter state (property-panel-redesign port, branch 526).
//
// On the reference branch (#524) hiddenFields lives inside the unified
// overlayDisplaySettings model; this branch keeps its own display-mode
// primitives (showOnSelect/showAlways + v2OverlaysEnabled), so the field
// filter gets a standalone per-session hook instead:
// localStorage `fpc_overlay_hidden_fields_v1:{sid}`.
//
// Semantics are opt-out (preview-level only): a field is hidden from overlay
// cards only when explicitly listed. Fields are active by default, so newly
// discovered fields stay visible until the user hides them. Never touches
// the draft, the XML, or persisted property state.

import { useCallback, useEffect, useState } from "react";

import { toggleFieldHidden } from "./fieldChipsModel.js";

export const HIDDEN_FIELDS_STORAGE_PREFIX = "fpc_overlay_hidden_fields_v1:";

// Duplicated from 524's overlayDisplaySettings.js to avoid dragging the
// unified settings model into this branch. Returns a deduped string[] for
// arrays, or null for non-arrays (caller applies the default: nothing hidden).
export function sanitizeHiddenFields(value) {
  if (!Array.isArray(value)) return null;
  const out = [];
  value.forEach((item) => {
    if (typeof item !== "string") return;
    if (!item) return;
    if (out.includes(item)) return;
    out.push(item);
  });
  return out;
}

function hiddenFieldsStorageKey(sessionId) {
  const sid = String(sessionId || "").trim();
  return sid ? `${HIDDEN_FIELDS_STORAGE_PREFIX}${sid}` : "";
}

function getLocalStorage() {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage || null;
  } catch {
    return null;
  }
}

function loadHiddenFields(sessionId) {
  const storage = getLocalStorage();
  const key = hiddenFieldsStorageKey(sessionId);
  if (!storage || !key) return [];
  try {
    const raw = storage.getItem(key);
    if (raw === null || raw === undefined || raw === "") return [];
    return sanitizeHiddenFields(JSON.parse(String(raw))) ?? [];
  } catch {
    // Corrupt value — fall back to "nothing hidden".
    return [];
  }
}

function saveHiddenFields(sessionId, hiddenFields) {
  const storage = getLocalStorage();
  const key = hiddenFieldsStorageKey(sessionId);
  if (!storage || !key) return false;
  try {
    storage.setItem(key, JSON.stringify(sanitizeHiddenFields(hiddenFields) ?? []));
    return true;
  } catch {
    return false;
  }
}

export function useHiddenFields(sessionId) {
  const [hiddenFields, setHiddenFields] = useState(() => loadHiddenFields(sessionId));

  // Reload when the session changes (per-session persistence).
  useEffect(() => {
    setHiddenFields(loadHiddenFields(sessionId));
  }, [sessionId]);

  const toggleField = useCallback((name) => {
    setHiddenFields((prev) => {
      const next = toggleFieldHidden(prev, name);
      saveHiddenFields(sessionId, next);
      return next;
    });
  }, [sessionId]);

  return { hiddenFields, toggleField };
}
