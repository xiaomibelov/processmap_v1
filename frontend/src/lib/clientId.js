const CLIENT_ID_STORAGE_KEY = "pm-client-id";

function generateClientId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    try {
      return crypto.randomUUID();
    } catch {
      // Fall through.
    }
  }
  // Fallback for environments without crypto.randomUUID (e.g. some test runners).
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

export function getOrCreateClientId() {
  if (typeof sessionStorage === "undefined") {
    return generateClientId();
  }
  let id = sessionStorage.getItem(CLIENT_ID_STORAGE_KEY);
  if (!id) {
    id = generateClientId();
    try {
      sessionStorage.setItem(CLIENT_ID_STORAGE_KEY, id);
    } catch {
      // Storage may be unavailable; use the generated id for this call only.
    }
  }
  return id;
}

export function getClientIdHeader() {
  return { "X-PM-Client-Id": getOrCreateClientId() };
}
