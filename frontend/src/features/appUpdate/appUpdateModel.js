export const APP_UPDATE_POLL_INTERVAL_MS = 120000;
export const APP_UPDATE_DISMISS_STORAGE_KEY = "processmap:app-update:dismissed-runtime-id";

function toText(value) {
  return String(value || "").trim();
}

function isKnownRuntimeValue(value) {
  const text = toText(value);
  return !!text && text.toLowerCase() !== "unknown";
}

function getDefaultSessionStorage() {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage || null;
  } catch {
    return null;
  }
}

export function getCurrentClientRuntimeId({ currentVersion = "", currentBuildId = "" } = {}) {
  return toText(currentBuildId) || toText(currentVersion);
}

export function normalizeRuntimeMeta(meta) {
  const source = meta && typeof meta === "object" ? meta : {};
  const runtime = source.runtime && typeof source.runtime === "object" ? source.runtime : {};
  const appVersion = toText(runtime.app_version);
  const buildId = toText(runtime.build_id);
  const gitSha = toText(runtime.git_sha);
  const minSupportedFrontendVersion = toText(runtime.min_supported_frontend_version);
  if (!isKnownRuntimeValue(appVersion)) return null;
  return {
    appVersion,
    buildId,
    gitSha,
    minSupportedFrontendVersion,
    runtimeId: getRuntimeDismissId({ appVersion, buildId }),
  };
}

export function getRuntimeDismissId(runtime) {
  const source = runtime && typeof runtime === "object" ? runtime : {};
  return toText(source.buildId || source.build_id) || toText(source.appVersion || source.app_version);
}

export function isNewRuntimeAvailable({
  currentVersion = "",
  currentBuildId = "",
  runtime = null,
} = {}) {
  const normalized = runtime?.appVersion ? runtime : normalizeRuntimeMeta({ runtime });
  if (!normalized) return false;
  const clientBuildId = toText(currentBuildId);
  if (clientBuildId && toText(normalized.buildId)) {
    return toText(normalized.buildId) !== clientBuildId;
  }
  return toText(normalized.appVersion) !== toText(currentVersion);
}

export function getDismissedRuntimeId(storage = getDefaultSessionStorage()) {
  if (!storage) return "";
  try {
    return toText(storage.getItem(APP_UPDATE_DISMISS_STORAGE_KEY));
  } catch {
    return "";
  }
}

export function setDismissedRuntimeId(runtimeId, storage = getDefaultSessionStorage()) {
  const value = toText(runtimeId);
  if (!storage || !value) return false;
  try {
    storage.setItem(APP_UPDATE_DISMISS_STORAGE_KEY, value);
    return true;
  } catch {
    return false;
  }
}

export function shouldShowUpdateBanner({
  currentVersion = "",
  currentBuildId = "",
  runtime = null,
  storage = getDefaultSessionStorage(),
} = {}) {
  const normalized = runtime?.appVersion ? runtime : normalizeRuntimeMeta({ runtime });
  if (!isNewRuntimeAvailable({ currentVersion, currentBuildId, runtime: normalized })) return false;
  const runtimeId = getRuntimeDismissId(normalized);
  if (!runtimeId) return false;
  return getDismissedRuntimeId(storage) !== runtimeId;
}

export function reloadPage(win = typeof window === "undefined" ? null : window) {
  win?.location?.reload?.();
}
