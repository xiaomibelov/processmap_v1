function asObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function asText(value) {
  return String(value || "").trim();
}

function asNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export const HYBRID_UI_STORAGE_KEY = "hybrid_ui_v1";

export function getHybridUiStorageKey(userIdRaw) {
  void userIdRaw;
  return HYBRID_UI_STORAGE_KEY;
}

export function normalizeHybridUiPrefs(raw) {
  const src = asObject(raw);
  const modeRaw = asText(src.mode).toLowerCase();
  const mode = modeRaw === "edit" ? "edit" : "view";
  const opacityPreset = asNumber(src.opacity, 60);
  const opacity = opacityPreset >= 95 ? 100 : opacityPreset >= 45 ? 60 : 30;
  return {
    visible: !!src.visible,
    mode,
    opacity,
    lock: !!src.lock,
    focus: !!src.focus,
  };
}

export function loadHybridUiPrefs(storageLike, storageKey, userIdRaw = "") {
  const key = asText(storageKey);
  const userId = asText(userIdRaw) || "anon";
  if (!storageLike || !key) return normalizeHybridUiPrefs({});
  try {
    const raw = storageLike.getItem(key);
    if (!raw) return normalizeHybridUiPrefs({});
    const parsed = JSON.parse(raw);
    const container = asObject(parsed);
    if (container.by_user && typeof container.by_user === "object") {
      return normalizeHybridUiPrefs(container.by_user[userId]);
    }
    return normalizeHybridUiPrefs(container);
  } catch {
    return normalizeHybridUiPrefs({});
  }
}

export function saveHybridUiPrefs(storageLike, storageKey, prefsRaw, userIdRaw = "") {
  const key = asText(storageKey);
  const userId = asText(userIdRaw) || "anon";
  if (!storageLike || !key) return false;
  try {
    const prefs = normalizeHybridUiPrefs(prefsRaw);
    const prevRaw = storageLike.getItem(key);
    const prevContainer = prevRaw ? asObject(JSON.parse(prevRaw)) : {};
    const nextContainer = {
      ...prevContainer,
      by_user: {
        ...asObject(prevContainer.by_user),
        [userId]: prefs,
      },
    };
    storageLike.setItem(key, JSON.stringify(nextContainer));
    return true;
  } catch {
    return false;
  }
}

export function applyHybridVisibilityTransition(prevRaw, nextVisible) {
  const prev = normalizeHybridUiPrefs(prevRaw);
  return {
    ...prev,
    visible: !!nextVisible,
    mode: nextVisible ? prev.mode : "view",
  };
}

export function applyHybridModeTransition(prevRaw, nextModeRaw) {
  const prev = normalizeHybridUiPrefs(prevRaw);
  const nextMode = asText(nextModeRaw).toLowerCase() === "edit" ? "edit" : "view";
  if (!prev.visible && nextMode === "edit") {
    return {
      ...prev,
      visible: true,
      mode: "edit",
    };
  }
  return {
    ...prev,
    mode: nextMode,
  };
}

export function normalizeHybridLayerMap(rawMap) {
  const source = asObject(rawMap);
  const out = {};
  Object.keys(source).forEach((rawElementId) => {
    const elementId = asText(rawElementId);
    if (!elementId) return;
    const row = asObject(source[rawElementId]);
    out[elementId] = {
      dx: asNumber(row.dx ?? row.x ?? 0, 0),
      dy: asNumber(row.dy ?? row.y ?? 0, 0),
    };
  });
  return out;
}
