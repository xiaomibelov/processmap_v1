import { pushDeleteTrace } from "../../stage/utils/deleteTrace.js";

function traceDrawioRuntime(stageRaw, payloadRaw = {}) {
  const stage = String(stageRaw || "").trim();
  if (!stage) return null;
  return pushDeleteTrace(stage, payloadRaw);
}

const PERF_QUERY_FLAGS = ["drawioPerf", "drawioRuntimePerf", "perfDrawio"];

let cachedPerfQuerySearch = "";
let cachedPerfQueryFlag = false;

function canUseWindow() {
  return typeof window !== "undefined" && window && typeof window === "object";
}

function readPerfFlagFromQuery() {
  if (!canUseWindow()) return false;
  try {
    const search = String(window.location?.search || "");
    if (search === cachedPerfQuerySearch) return cachedPerfQueryFlag;
    const params = new URLSearchParams(search);
    cachedPerfQuerySearch = search;
    cachedPerfQueryFlag = PERF_QUERY_FLAGS.some((flag) => params.get(flag) === "1");
    return cachedPerfQueryFlag;
  } catch {
    return false;
  }
}

function isDrawioPerfProbeEnabled() {
  if (!canUseWindow()) return false;
  return window.__FPC_DRAWIO_PERF_ENABLE__ === true || readPerfFlagFromQuery();
}

function ensurePerfStore() {
  if (!canUseWindow() || !isDrawioPerfProbeEnabled()) return null;
  const current = window.__FPC_DRAWIO_PERF__;
  if (current && typeof current === "object") return current;
  const next = {
    counters: {},
    samples: {},
    marks: {},
    startedAt: Date.now(),
    resetAt: Date.now(),
  };
  window.__FPC_DRAWIO_PERF__ = next;
  return next;
}

function bumpDrawioPerfCounter(counterKeyRaw, deltaRaw = 1) {
  const store = ensurePerfStore();
  if (!store) return 0;
  const counterKey = String(counterKeyRaw || "").trim();
  if (!counterKey) return 0;
  const delta = Number(deltaRaw);
  const amount = Number.isFinite(delta) ? delta : 1;
  const prev = Number(store.counters[counterKey] || 0);
  const next = prev + amount;
  store.counters[counterKey] = next;
  return next;
}

function recordDrawioPerfSample(sampleKeyRaw, valueRaw) {
  const store = ensurePerfStore();
  if (!store) return null;
  const sampleKey = String(sampleKeyRaw || "").trim();
  const value = Number(valueRaw);
  if (!sampleKey || !Number.isFinite(value)) return null;
  const prev = store.samples[sampleKey] && typeof store.samples[sampleKey] === "object"
    ? store.samples[sampleKey]
    : { count: 0, total: 0, min: Number.POSITIVE_INFINITY, max: Number.NEGATIVE_INFINITY };
  const next = {
    count: Number(prev.count || 0) + 1,
    total: Number(prev.total || 0) + value,
    min: Math.min(Number(prev.min), value),
    max: Math.max(Number(prev.max), value),
  };
  next.avg = next.count > 0 ? next.total / next.count : 0;
  store.samples[sampleKey] = next;
  return next;
}

function markDrawioPerf(perfKeyRaw, valueRaw = null) {
  const store = ensurePerfStore();
  if (!store) return null;
  const perfKey = String(perfKeyRaw || "").trim();
  if (!perfKey) return null;
  const value = valueRaw === null ? Date.now() : valueRaw;
  store.marks[perfKey] = value;
  return value;
}

function resetDrawioPerfStore() {
  if (!canUseWindow()) return null;
  const next = {
    counters: {},
    samples: {},
    marks: {},
    startedAt: Date.now(),
    resetAt: Date.now(),
  };
  window.__FPC_DRAWIO_PERF__ = next;
  return next;
}

function readDrawioPerfStore() {
  if (!canUseWindow()) return null;
  const store = window.__FPC_DRAWIO_PERF__;
  return store && typeof store === "object" ? store : null;
}

export {
  bumpDrawioPerfCounter,
  isDrawioPerfProbeEnabled,
  markDrawioPerf,
  readDrawioPerfStore,
  recordDrawioPerfSample,
  resetDrawioPerfStore,
  traceDrawioRuntime,
};
