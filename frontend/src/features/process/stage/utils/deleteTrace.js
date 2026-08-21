function canUseWindow() {
  return typeof window !== "undefined" && window && typeof window === "object";
}

let cachedQuerySearch = "";
let cachedQueryFlag = false;

function readFlagFromQuery() {
  if (!canUseWindow()) return false;
  try {
    const search = String(window.location?.search || "");
    if (search === cachedQuerySearch) return cachedQueryFlag;
    const params = new URLSearchParams(search);
    cachedQuerySearch = search;
    cachedQueryFlag = (
      params.get("deleteTrace") === "1"
      || params.get("drawioDeleteDebug") === "1"
      || params.get("debugDelete") === "1"
    );
    return cachedQueryFlag;
  } catch {
    return false;
  }
}

export function isDeleteTraceEnabled() {
  if (!canUseWindow()) return false;
  return window.__FPC_DELETE_TRACE_ENABLE__ === true || readFlagFromQuery();
}

export function pushDeleteTrace(stageRaw, payloadRaw = {}) {
  if (!isDeleteTraceEnabled()) return null;
  const stage = String(stageRaw || "").trim() || "unknown_stage";
  const payload = payloadRaw && typeof payloadRaw === "object" ? payloadRaw : {};
  const entry = {
    ts: new Date().toISOString(),
    stage,
    ...payload,
  };
  const next = Array.isArray(window.__FPC_DELETE_TRACE__) ? [...window.__FPC_DELETE_TRACE__, entry] : [entry];
  window.__FPC_DELETE_TRACE__ = next.slice(-600);
  // eslint-disable-next-line no-console
  console.info("[DELETE_TRACE]", entry);
  return entry;
}
