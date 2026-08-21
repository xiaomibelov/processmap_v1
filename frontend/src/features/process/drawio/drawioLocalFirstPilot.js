function toText(value) {
  return String(value || "").trim();
}

function parseBool(raw, fallback = false) {
  const text = toText(raw).toLowerCase();
  if (!text) return fallback;
  if (text === "1" || text === "true" || text === "on" || text === "yes") return true;
  if (text === "0" || text === "false" || text === "off" || text === "no") return false;
  return fallback;
}

function readLocalStorage(key) {
  if (typeof window === "undefined") return "";
  try {
    return toText(window.localStorage?.getItem(key));
  } catch {
    return "";
  }
}

export function isDrawioLocalFirstPilotEnabled() {
  const env = (typeof import.meta !== "undefined" && import.meta.env) ? import.meta.env : {};
  const envValue = env.VITE_DRAWIO_LOCALFIRST_PILOT;
  const localValue = readLocalStorage("fpc:drawio-localfirst-pilot");
  return parseBool(localValue || envValue, false);
}

export function getDrawioLocalFirstAdapterMode() {
  const env = (typeof import.meta !== "undefined" && import.meta.env) ? import.meta.env : {};
  const envValue = toText(env.VITE_DRAWIO_LOCALFIRST_ADAPTER).toLowerCase();
  const localValue = readLocalStorage("fpc:drawio-localfirst-adapter").toLowerCase();
  const mode = localValue || envValue;
  return mode === "jazz" ? "jazz" : "legacy";
}

export function getDrawioJazzPeer() {
  const env = (typeof import.meta !== "undefined" && import.meta.env) ? import.meta.env : {};
  const envValue = toText(env.VITE_DRAWIO_JAZZ_PEER);
  const localValue = readLocalStorage("fpc:drawio-jazz-peer");
  return localValue || envValue;
}

export function buildDrawioJazzScopeId(projectIdRaw, sessionIdRaw) {
  const projectId = toText(projectIdRaw);
  const sessionId = toText(sessionIdRaw);
  if (projectId && sessionId) return `${projectId}::${sessionId}`;
  return sessionId || projectId;
}
