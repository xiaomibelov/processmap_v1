function toText(value) {
  return String(value || "").trim();
}

function parseBool(raw, fallback) {
  const text = toText(raw).toLowerCase();
  if (!text) return fallback;
  if (text === "1" || text === "true" || text === "on" || text === "yes") return true;
  if (text === "0" || text === "false" || text === "off" || text === "no") return false;
  return fallback;
}

function parseMode(raw, fallback = "full") {
  const mode = toText(raw).toLowerCase();
  if (mode === "flat" || mode === "mainline" || mode === "full") return mode;
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

export function getInterviewFeatureFlags() {
  const env = (typeof import.meta !== "undefined" && import.meta.env) ? import.meta.env : {};

  const v2Env = env.VITE_INTERVIEW_V2_MODEL;
  const betweenEnv = env.VITE_INTERVIEW_BETWEEN_BRANCHES;
  const timeEnv = env.VITE_INTERVIEW_TIME_MODEL;
  const detachedEnv = env.VITE_INTERVIEW_DETACHED_FILTER;
  const modeEnv = env.VITE_INTERVIEW_RENDER_MODE;

  const v2Local = readLocalStorage("interview.v2_model");
  const betweenLocal = readLocalStorage("interview.between_branches");
  const timeLocal = readLocalStorage("interview.time_model");
  const detachedLocal = readLocalStorage("interview.detached_filter");
  const modeLocal = readLocalStorage("interview.render_mode");

  const v2Model = parseBool(v2Local || v2Env, true);
  const betweenBranches = parseBool(betweenLocal || betweenEnv, true);
  const timeModel = parseBool(timeLocal || timeEnv, true);
  const detachedFilter = parseBool(detachedLocal || detachedEnv, true);
  const renderMode = parseMode(modeLocal || modeEnv, "full");

  return {
    v2Model,
    betweenBranches,
    timeModel,
    detachedFilter,
    renderMode,
  };
}
