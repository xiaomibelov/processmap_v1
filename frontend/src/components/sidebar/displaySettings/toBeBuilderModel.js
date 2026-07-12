// To-Be builder derived model (property-panel-redesign).
//
// Storage (per session, localStorage): { toBe: string[], removed: string[] }.
//   toBe    — the target set of property names the element should have.
//   removed — toBe members the user deleted from the configured properties
//             (drives the "Removed" badge instead of "Not filled").
// Everything else (As-Is list, Pool list, badges, summary pills) is derived
// from (toBeState × configured names × organization dictionary). Dedup guards
// against the known x3 property duplication (display-side only).

const BADGE_IN_TO_BE = "In To-Be";
const BADGE_ADDED = "Added";
const BADGE_REMOVED = "Removed";
const BADGE_NOT_FILLED = "Not filled";

function asStringList(value) {
  if (!Array.isArray(value)) return [];
  const out = [];
  value.forEach((item) => {
    if (typeof item !== "string") return;
    const name = item.trim();
    if (!name || out.includes(name)) return;
    out.push(name);
  });
  return out;
}

export function createEmptyToBeState() {
  return { toBe: [], removed: [] };
}

export function readToBeState(rawValue) {
  const raw = rawValue && typeof rawValue === "object" && !Array.isArray(rawValue) ? rawValue : {};
  return {
    toBe: asStringList(raw.toBe),
    removed: asStringList(raw.removed),
  };
}

export function deriveToBeModel({ toBeState, asIsNames, dictionaryNames } = {}) {
  const state = readToBeState(toBeState);
  const toBeSet = new Set(state.toBe);
  const removedSet = new Set(state.removed);

  const asIs = asStringList(asIsNames).map((name) => ({
    name,
    badge: toBeSet.has(name) ? BADGE_IN_TO_BE : BADGE_ADDED,
  }));
  const asIsSet = new Set(asIs.map((row) => row.name));

  const poolNames = [];
  [...asStringList(dictionaryNames), ...state.toBe].forEach((name) => {
    if (asIsSet.has(name)) return;
    if (poolNames.includes(name)) return;
    poolNames.push(name);
  });
  const pool = poolNames.map((name) => ({
    name,
    badge: removedSet.has(name) ? BADGE_REMOVED : BADGE_NOT_FILLED,
  }));

  const inToBeCount = asIs.filter((row) => row.badge === BADGE_IN_TO_BE).length;
  const skippedCount = state.toBe.filter((name) => !asIsSet.has(name)).length;

  return {
    asIs,
    pool,
    inToBeCount,
    skippedCount,
    pillsText: `${inToBeCount} in To-Be / ${skippedCount} skipped`,
  };
}

export function toggleToBeName(stateRaw, nameRaw) {
  const state = readToBeState(stateRaw);
  const name = typeof nameRaw === "string" ? nameRaw.trim() : "";
  if (!name) return state;
  if (state.toBe.includes(name)) {
    return {
      toBe: state.toBe.filter((item) => item !== name),
      removed: state.removed.filter((item) => item !== name),
    };
  }
  return {
    toBe: [...state.toBe, name],
    removed: state.removed.filter((item) => item !== name),
  };
}

// Called when a configured property is deleted: toBe members keep their place
// in the target set but surface in the Pool with the "Removed" badge.
export function markPropertyRemoved(stateRaw, nameRaw) {
  const state = readToBeState(stateRaw);
  const name = typeof nameRaw === "string" ? nameRaw.trim() : "";
  if (!name || !state.toBe.includes(name) || state.removed.includes(name)) {
    return { toBe: [...state.toBe], removed: [...state.removed] };
  }
  return { toBe: [...state.toBe], removed: [...state.removed, name] };
}

// --- Persistence (per session, localStorage `fpc_tobe_v1:{sid}`) -------------

export const TO_BE_STORAGE_PREFIX = "fpc_tobe_v1:";

export function toBeStorageKey(sessionId) {
  const sid = String(sessionId || "").trim();
  return sid ? `${TO_BE_STORAGE_PREFIX}${sid}` : "";
}

function safeGetItem(storage, key) {
  try {
    return storage?.getItem?.(key) ?? null;
  } catch {
    return null;
  }
}

// Loads the To-Be state for the session, validating untrusted input.
export function loadToBeState(storage, sessionId) {
  const key = toBeStorageKey(sessionId);
  const raw = key ? safeGetItem(storage, key) : null;
  if (raw !== null && raw !== undefined && raw !== "") {
    try {
      return readToBeState(JSON.parse(String(raw)));
    } catch {
      // Corrupt value — fall through to the empty state.
    }
  }
  return createEmptyToBeState();
}

// Persists after validation. Returns false (without throwing) when the session
// id is empty or the storage rejects the write (quota, privacy mode).
export function saveToBeState(storage, sessionId, stateRaw) {
  const key = toBeStorageKey(sessionId);
  if (!key) return false;
  const safe = readToBeState(stateRaw);
  try {
    storage?.setItem?.(key, JSON.stringify(safe));
    return true;
  } catch {
    return false;
  }
}
