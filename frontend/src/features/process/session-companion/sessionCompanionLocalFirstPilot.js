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

function readEnv() {
  if (typeof import.meta === "undefined" || !import.meta.env) return {};
  return import.meta.env || {};
}

function normalizeAdapterMode(raw) {
  return toText(raw).toLowerCase() === "jazz" ? "jazz" : "legacy";
}

function hasAnyLocalOverride({ localPilotRaw, localAdapterRaw, localPeerRaw }) {
  return !!toText(localPilotRaw) || !!toText(localAdapterRaw) || !!toText(localPeerRaw);
}

export function resolveSessionCompanionLocalFirstActivation(options = {}) {
  const env = (options?.envOverride && typeof options.envOverride === "object")
    ? options.envOverride
    : readEnv();
  const localReader = typeof options?.localReader === "function" ? options.localReader : readLocalStorage;
  const envPilotRaw = env.VITE_SESSION_COMPANION_LOCALFIRST_PILOT;
  const envAdapterRaw = toText(env.VITE_SESSION_COMPANION_LOCALFIRST_ADAPTER).toLowerCase();
  const envPeerRaw = toText(env.VITE_SESSION_COMPANION_JAZZ_PEER || env.VITE_DRAWIO_JAZZ_PEER);
  const localPilotRaw = localReader("fpc:session-companion-localfirst-pilot");
  const localAdapterRaw = toText(localReader("fpc:session-companion-localfirst-adapter")).toLowerCase();
  const localPeerRaw = localReader("fpc:session-companion-jazz-peer");
  const isDev = env.DEV === true;
  const allowLocalOverrideFromEnv = parseBool(env.VITE_SESSION_COMPANION_LOCALFIRST_ALLOW_LOCAL_OVERRIDE, false);
  const allowLocalOverride = allowLocalOverrideFromEnv || isDev;
  const localOverridePresent = hasAnyLocalOverride({
    localPilotRaw,
    localAdapterRaw,
    localPeerRaw,
  });
  const useLocalOverride = allowLocalOverride && localOverridePresent;
  const pilotSource = useLocalOverride && toText(localPilotRaw)
    ? "local_storage"
    : (toText(envPilotRaw) ? "env" : "default");
  const adapterSource = useLocalOverride && toText(localAdapterRaw)
    ? "local_storage"
    : (toText(envAdapterRaw) ? "env" : "default");
  const peerSource = useLocalOverride && toText(localPeerRaw)
    ? "local_storage"
    : (toText(envPeerRaw) ? "env" : "default");
  const pilotEnabled = parseBool(
    useLocalOverride && toText(localPilotRaw) ? localPilotRaw : envPilotRaw,
    false,
  );
  const adapterRequested = normalizeAdapterMode(
    useLocalOverride && toText(localAdapterRaw) ? localAdapterRaw : envAdapterRaw,
  );
  const adapterModeEffective = pilotEnabled ? adapterRequested : "legacy";
  const jazzPeer = toText(useLocalOverride && toText(localPeerRaw) ? localPeerRaw : envPeerRaw);
  let unsupportedReason = "";
  if (!allowLocalOverride && localOverridePresent) {
    unsupportedReason = "local_override_blocked";
  } else if (!pilotEnabled && adapterRequested === "jazz") {
    unsupportedReason = "adapter_requested_without_pilot";
  } else if (pilotEnabled && adapterRequested === "jazz" && !jazzPeer) {
    unsupportedReason = "jazz_peer_missing";
  }
  return {
    pilotEnabled,
    adapterRequested,
    adapterModeEffective,
    activationSource: useLocalOverride ? "local_storage" : (toText(envPilotRaw) || toText(envAdapterRaw) ? "env" : "default"),
    pilotSource,
    adapterSource,
    peerSource,
    localOverridePresent,
    localOverrideUsed: useLocalOverride,
    localOverrideBlocked: localOverridePresent && !allowLocalOverride,
    allowLocalOverride,
    jazzPeer,
    isDevRuntime: isDev,
    unsupportedState: !!unsupportedReason,
    unsupportedReason,
  };
}

export function isSessionCompanionLocalFirstPilotEnabled() {
  return resolveSessionCompanionLocalFirstActivation().pilotEnabled === true;
}

export function getSessionCompanionLocalFirstAdapterMode() {
  return resolveSessionCompanionLocalFirstActivation().adapterModeEffective;
}

export function getSessionCompanionJazzPeer() {
  return resolveSessionCompanionLocalFirstActivation().jazzPeer;
}

export function getSessionCompanionLocalFirstActivationDiagnostics() {
  const resolved = resolveSessionCompanionLocalFirstActivation();
  return {
    activationSource: resolved.activationSource,
    pilotEnabled: resolved.pilotEnabled,
    adapterRequested: resolved.adapterRequested,
    adapterModeEffective: resolved.adapterModeEffective,
    pilotSource: resolved.pilotSource,
    adapterSource: resolved.adapterSource,
    peerSource: resolved.peerSource,
    localOverridePresent: resolved.localOverridePresent,
    localOverrideUsed: resolved.localOverrideUsed,
    localOverrideBlocked: resolved.localOverrideBlocked,
    allowLocalOverride: resolved.allowLocalOverride,
    unsupportedState: resolved.unsupportedState,
    unsupportedReason: resolved.unsupportedReason,
  };
}

export function isSessionCompanionLocalFirstPilotExplicitlyConfigured() {
  const env = (typeof import.meta !== "undefined" && import.meta.env) ? import.meta.env : {};
  const envValue = env.VITE_SESSION_COMPANION_LOCALFIRST_PILOT;
  const localValue = readLocalStorage("fpc:session-companion-localfirst-pilot");
  return !!toText(localValue || envValue);
}

export function buildSessionCompanionJazzScopeId(projectIdRaw, sessionIdRaw) {
  const projectId = toText(projectIdRaw);
  const sessionId = toText(sessionIdRaw);
  if (projectId && sessionId) return `${projectId}::${sessionId}`;
  return sessionId || projectId;
}
