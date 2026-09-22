function toText(value) {
  return String(value ?? "").trim();
}

function toInt(value, fallback = 0) {
  const num = Number(value);
  return Number.isFinite(num) ? Math.round(num) : Math.round(fallback || 0);
}

export const CANVAS_TELEMETRY_ERROR_CLASSES = [
  "ops_422",
  "ops_409",
  "network",
  "timeout",
  "non_finite_di",
  "unknown",
];

export const CANVAS_TELEMETRY_FILTER_KEYS = [
  "session_id",
  "user_id",
  "error_class",
  "error_code",
  "converged",
  "last_seen_from",
  "last_seen_to",
];

export const CANVAS_TELEMETRY_LIMIT_DEFAULT = 50;
export const CANVAS_TELEMETRY_LIMIT_MAX = 100;

export const DEFAULT_CANVAS_TELEMETRY_FILTERS = {
  session_id: "",
  user_id: "",
  error_class: "",
  error_code: "",
  converged: "",
  last_seen_from: "",
  last_seen_to: "",
  limit: CANVAS_TELEMETRY_LIMIT_DEFAULT,
  order: "desc",
};

export function buildCanvasTelemetryParams(filtersRaw = {}) {
  const filters = filtersRaw && typeof filtersRaw === "object" ? filtersRaw : {};
  const params = {};
  for (const key of ["session_id", "user_id", "error_class", "error_code"]) {
    const value = toText(filters[key]);
    if (value) params[key] = value;
  }
  const converged = toText(filters.converged);
  if (converged === "0" || converged === "1") params.converged = converged;
  const from = toInt(filters.last_seen_from, 0);
  if (from > 0) params.last_seen_from = from;
  const to = toInt(filters.last_seen_to, 0);
  if (to > 0) params.last_seen_to = to;
  params.limit = Math.min(
    Math.max(1, toInt(filters.limit, CANVAS_TELEMETRY_LIMIT_DEFAULT)),
    CANVAS_TELEMETRY_LIMIT_MAX,
  );
  params.order = toText(filters.order).toLowerCase() === "asc" ? "asc" : "desc";
  return params;
}

export function parseCanvasTelemetryFiltersFromSearch(searchRaw = "") {
  const raw = toText(searchRaw);
  const params = new URLSearchParams(raw.startsWith("?") ? raw.slice(1) : raw);
  const filters = { ...DEFAULT_CANVAS_TELEMETRY_FILTERS };
  for (const key of CANVAS_TELEMETRY_FILTER_KEYS) {
    const value = toText(params.get(key));
    if (value) filters[key] = value;
  }
  const groupId = toText(params.get("group_id"));
  if (groupId) filters.group_id = groupId;
  const limit = toInt(params.get("limit"), CANVAS_TELEMETRY_LIMIT_DEFAULT);
  filters.limit = Math.min(Math.max(1, limit), CANVAS_TELEMETRY_LIMIT_MAX);
  filters.order = toText(params.get("order")).toLowerCase() === "asc" ? "asc" : "desc";
  return filters;
}

export function buildCanvasTelemetrySearchPatch(filtersRaw = {}) {
  const filters = filtersRaw && typeof filtersRaw === "object" ? filtersRaw : {};
  const patch = {};
  for (const key of [...CANVAS_TELEMETRY_FILTER_KEYS, "group_id"]) {
    const value = toText(filters[key]);
    patch[key] = value;
  }
  patch.limit = String(toInt(filters.limit, CANVAS_TELEMETRY_LIMIT_DEFAULT));
  patch.order = toText(filters.order).toLowerCase() === "asc" ? "asc" : "desc";
  return patch;
}
