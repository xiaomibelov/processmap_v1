function toText(value) {
  return String(value ?? "").trim();
}

function toInt(value, fallback = 0) {
  const num = Number(value);
  return Number.isFinite(num) ? Math.round(num) : Math.round(fallback || 0);
}

export const TELEMETRY_EVENT_FILTER_KEYS = [
  "session_id",
  "request_id",
  "correlation_id",
  "user_id",
  "org_id",
  "runtime_id",
  "event_type",
  "source",
  "severity",
  "occurred_from",
  "occurred_to",
];

export const TELEMETRY_LIMIT_DEFAULT = 50;
export const TELEMETRY_LIMIT_MAX = 100;

export const DEFAULT_TELEMETRY_FILTERS = {
  session_id: "",
  request_id: "",
  correlation_id: "",
  user_id: "",
  org_id: "",
  runtime_id: "",
  event_type: "",
  source: "",
  severity: "",
  occurred_from: "",
  occurred_to: "",
  limit: TELEMETRY_LIMIT_DEFAULT,
  order: "asc",
  event_id: "",
};

export function normalizeTelemetryLimit(value, fallback = TELEMETRY_LIMIT_DEFAULT) {
  const next = toInt(value, fallback);
  if (!Number.isFinite(next) || next <= 0) return TELEMETRY_LIMIT_DEFAULT;
  return Math.max(1, Math.min(next, TELEMETRY_LIMIT_MAX));
}

export function normalizeTelemetryOrder(value) {
  return toText(value).toLowerCase() === "desc" ? "desc" : "asc";
}

export function normalizeTelemetryTs(value) {
  const text = toText(value);
  if (!text) return "";
  if (!/^\d+$/.test(text)) return "";
  const num = Number(text);
  if (!Number.isFinite(num) || num <= 0) return "";
  return String(Math.floor(num));
}

export function parseTelemetryFiltersFromSearch(searchRaw = "") {
  const raw = toText(searchRaw).replace(/^\?/, "");
  const params = new URLSearchParams(raw);
  const out = { ...DEFAULT_TELEMETRY_FILTERS };
  TELEMETRY_EVENT_FILTER_KEYS.forEach((key) => {
    out[key] = toText(params.get(key));
  });
  out.occurred_from = normalizeTelemetryTs(out.occurred_from);
  out.occurred_to = normalizeTelemetryTs(out.occurred_to);
  out.limit = normalizeTelemetryLimit(params.get("limit"), TELEMETRY_LIMIT_DEFAULT);
  out.order = normalizeTelemetryOrder(params.get("order"));
  out.event_id = toText(params.get("event_id"));
  return out;
}

export function buildTelemetryErrorEventsParams(filtersRaw = {}) {
  const filters = { ...DEFAULT_TELEMETRY_FILTERS, ...(filtersRaw || {}) };
  const out = {
    limit: String(normalizeTelemetryLimit(filters.limit)),
    order: normalizeTelemetryOrder(filters.order),
  };
  TELEMETRY_EVENT_FILTER_KEYS.forEach((key) => {
    const value = key.startsWith("occurred_") ? normalizeTelemetryTs(filters[key]) : toText(filters[key]);
    if (value) out[key] = value;
  });
  return out;
}

export function buildTelemetrySearchPatch(filtersRaw = {}) {
  const filters = { ...DEFAULT_TELEMETRY_FILTERS, ...(filtersRaw || {}) };
  const out = {};
  TELEMETRY_EVENT_FILTER_KEYS.forEach((key) => {
    out[key] = key.startsWith("occurred_") ? normalizeTelemetryTs(filters[key]) : toText(filters[key]);
  });
  const limit = normalizeTelemetryLimit(filters.limit);
  out.limit = limit === TELEMETRY_LIMIT_DEFAULT ? "" : String(limit);
  const order = normalizeTelemetryOrder(filters.order);
  out.order = order === "asc" ? "" : order;
  out.event_id = toText(filters.event_id);
  return out;
}

export function buildTelemetryCorrelationPivotFilters(filtersRaw = {}, correlationIdRaw = "") {
  const filters = { ...DEFAULT_TELEMETRY_FILTERS, ...(filtersRaw || {}) };
  return {
    ...DEFAULT_TELEMETRY_FILTERS,
    org_id: toText(filters.org_id),
    limit: normalizeTelemetryLimit(filters.limit),
    order: normalizeTelemetryOrder(filters.order),
    correlation_id: toText(correlationIdRaw),
    event_id: "",
  };
}

export function hasTelemetryFilterValue(filtersRaw = {}) {
  const filters = { ...DEFAULT_TELEMETRY_FILTERS, ...(filtersRaw || {}) };
  return TELEMETRY_EVENT_FILTER_KEYS.some((key) => toText(filters[key]));
}

export function telemetryFilterValidation(filtersRaw = {}) {
  const filters = { ...DEFAULT_TELEMETRY_FILTERS, ...(filtersRaw || {}) };
  const errors = [];
  ["occurred_from", "occurred_to"].forEach((key) => {
    if (toText(filters[key]) && !normalizeTelemetryTs(filters[key])) {
      errors.push(`${key} must be Unix seconds`);
    }
  });
  const limit = toInt(filters.limit, TELEMETRY_LIMIT_DEFAULT);
  if (!Number.isFinite(limit) || limit <= 0 || limit > TELEMETRY_LIMIT_MAX) {
    errors.push(`limit must be 1..${TELEMETRY_LIMIT_MAX}`);
  }
  return errors;
}
