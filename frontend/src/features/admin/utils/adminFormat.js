import { asArray, asObject, formatPct as baseFormatPct, formatTs as baseFormatTs, toInt, toText } from "../adminUtils";

export { asArray, asObject, toInt, toText };

export function formatTs(value) {
  return baseFormatTs(value);
}

export function formatPct(value, fallback = "—") {
  return baseFormatPct(value, fallback);
}

export function formatDurationSeconds(valueRaw, fallback = "—") {
  const value = Number(valueRaw);
  if (!Number.isFinite(value) || value < 0) return fallback;
  if (value < 60) return `${Math.round(value)}s`;
  const minutes = Math.floor(value / 60);
  const seconds = Math.round(value % 60);
  return seconds > 0 ? `${minutes}m ${seconds}s` : `${minutes}m`;
}

export function formatLatencyMs(valueRaw, fallback = "—") {
  const value = Number(valueRaw);
  if (!Number.isFinite(value) || value <= 0) return fallback;
  return `${Math.round(value)} ms`;
}

export function formatCount(valueRaw, fallback = "0") {
  const value = Number(valueRaw);
  if (!Number.isFinite(value)) return fallback;
  return new Intl.NumberFormat("en-US").format(Math.round(value));
}

export function sumBy(items = [], selector) {
  return asArray(items).reduce((acc, item, idx) => acc + Number(selector?.(item, idx) || 0), 0);
}

export function uniqueCount(items = [], selector) {
  const values = new Set();
  asArray(items).forEach((item, idx) => {
    const next = toText(selector?.(item, idx));
    if (next) values.add(next);
  });
  return values.size;
}

