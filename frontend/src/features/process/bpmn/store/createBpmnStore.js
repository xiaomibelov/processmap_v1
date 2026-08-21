function asText(value) {
  return String(value || "");
}

function fnv1aHex(input) {
  const src = asText(input);
  let hash = 0x811c9dc5;
  for (let i = 0; i < src.length; i += 1) {
    hash ^= src.charCodeAt(i);
    hash = Math.imul(hash >>> 0, 0x01000193) >>> 0;
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function asNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export default function createBpmnStore(initial = {}) {
  const initialXml = asText(initial?.xml);
  const initialHash = fnv1aHex(initialXml);
  let state = {
    xml: initialXml,
    rev: asNumber(initial?.rev, 0),
    dirty: !!initial?.dirty,
    lastSavedRev: asNumber(initial?.lastSavedRev, 0),
    lastLoadedRev: asNumber(initial?.lastLoadedRev, 0),
    lastHash: asText(initial?.lastHash || initial?.hash || initialHash),
    source: asText(initial?.source || "init"),
    hash: initialHash,
  };
  const subs = new Set();

  function emit(reason = "update") {
    const snap = { ...state, reason };
    subs.forEach((cb) => {
      try {
        cb(snap);
      } catch {
        // no-op
      }
    });
  }

  function getState() {
    return { ...state };
  }

  function subscribe(cb) {
    if (typeof cb !== "function") return () => {};
    subs.add(cb);
    try {
      cb({ ...state, reason: "subscribe" });
    } catch {
      // no-op
    }
    return () => {
      subs.delete(cb);
    };
  }

  function setXml(xmlText, source = "unknown", options = {}) {
    const xml = asText(xmlText);
    const nextHash = fnv1aHex(xml);
    const bumpRev = options?.bumpRev !== false;
    const explicitDirty = typeof options?.dirty === "boolean" ? options.dirty : null;
    const nextRev = bumpRev ? state.rev + 1 : state.rev;
    const nextDirty = explicitDirty === null ? state.dirty : explicitDirty;
    const loadedRev = options?.loadedRev;
    state = {
      ...state,
      xml,
      rev: nextRev,
      dirty: nextDirty,
      lastLoadedRev: Number.isFinite(Number(loadedRev))
        ? Math.max(state.lastLoadedRev, asNumber(loadedRev, state.lastLoadedRev))
        : state.lastLoadedRev,
      source: asText(source || "unknown"),
      hash: nextHash,
      lastHash: nextHash,
    };
    emit("setXml");
    return getState();
  }

  function bumpRev(source = "unknown") {
    state = {
      ...state,
      rev: state.rev + 1,
      dirty: true,
      source: asText(source || "unknown"),
    };
    emit("bumpRev");
    return getState();
  }

  function markDirty(source = "unknown") {
    state = {
      ...state,
      dirty: true,
      source: asText(source || "unknown"),
    };
    emit("markDirty");
    return getState();
  }

  function markSaved(rev, hash) {
    const targetRev = asNumber(rev, state.rev);
    const nextHash = asText(hash || state.lastHash || state.hash || fnv1aHex(state.xml));
    state = {
      ...state,
      dirty: targetRev < state.rev ? state.dirty : false,
      lastSavedRev: Math.max(state.lastSavedRev, targetRev),
      hash: nextHash,
      lastHash: nextHash,
      source: "markSaved",
    };
    emit("markSaved");
    return getState();
  }

  function markLoaded(rev, hash) {
    const targetRev = asNumber(rev, state.rev);
    const nextHash = asText(hash || state.lastHash || state.hash || fnv1aHex(state.xml));
    state = {
      ...state,
      lastLoadedRev: Math.max(state.lastLoadedRev, targetRev),
      hash: nextHash,
      lastHash: nextHash,
      source: "markLoaded",
    };
    emit("markLoaded");
    return getState();
  }

  return {
    getState,
    subscribe,
    setXml,
    bumpRev,
    markDirty,
    markSaved,
    markLoaded,
  };
}
