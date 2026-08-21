const PERF_STORE_KEY = "__FPC_INTERVIEW_PERF__";

let perfSeq = 0;

function canUsePerformanceApi() {
  const perf = globalThis?.performance;
  return !!(perf && typeof perf.mark === "function" && typeof perf.measure === "function" && typeof perf.getEntriesByName === "function");
}

function isDevMode() {
  return typeof import.meta !== "undefined" && !!import.meta.env?.DEV;
}

export function isInterviewPerfEnabled() {
  if (typeof window === "undefined") return false;
  const forced = !!window.__FPC_FORCE_INTERVIEW_PERF__;
  if (!forced && !isDevMode()) return false;
  if (!canUsePerformanceApi()) return false;
  try {
    const raw = String(window.localStorage?.getItem("fpc_interview_perf") || "").trim();
    if (!raw) return true;
    return raw !== "0" && raw.toLowerCase() !== "false" && raw.toLowerCase() !== "off";
  } catch {
    return true;
  }
}

function readMeta(meta) {
  if (!meta) return {};
  if (typeof meta === "function") {
    try {
      const out = meta();
      return out && typeof out === "object" ? out : {};
    } catch {
      return {};
    }
  }
  return meta && typeof meta === "object" ? meta : {};
}

function writePerfStore(name, duration, meta) {
  if (typeof window === "undefined") return;
  if (!window[PERF_STORE_KEY] || typeof window[PERF_STORE_KEY] !== "object") {
    window[PERF_STORE_KEY] = {};
  }
  const root = window[PERF_STORE_KEY];
  const prev = root[name] && typeof root[name] === "object" ? root[name] : {
    count: 0,
    totalMs: 0,
    maxMs: 0,
    lastMs: 0,
    avgMs: 0,
    lastMeta: {},
  };
  const count = Number(prev.count || 0) + 1;
  const totalMs = Number(prev.totalMs || 0) + Number(duration || 0);
  const maxMs = Math.max(Number(prev.maxMs || 0), Number(duration || 0));
  root[name] = {
    count,
    totalMs,
    maxMs,
    lastMs: Number(duration || 0),
    avgMs: count > 0 ? totalMs / count : 0,
    lastMeta: meta,
    updatedAt: Date.now(),
  };
}

export function measureInterviewPerf(name, fn, meta = null) {
  if (!isInterviewPerfEnabled()) return fn();
  const perf = globalThis.performance;
  const id = `${String(name || "perf")}:${++perfSeq}`;
  const startMark = `${id}:start`;
  const endMark = `${id}:end`;
  const measureName = `${id}:measure`;
  const safeMeta = readMeta(meta);
  perf.mark(startMark);
  try {
    return fn();
  } finally {
    perf.mark(endMark);
    perf.measure(measureName, startMark, endMark);
    const entries = perf.getEntriesByName(measureName);
    const last = entries[entries.length - 1];
    const duration = Number(last?.duration || 0);
    writePerfStore(String(name || "perf"), duration, safeMeta);
    if (duration >= 8 || window?.__FPC_DEBUG_INTERVIEW_PERF__) {
      // eslint-disable-next-line no-console
      console.debug(`[INTERVIEW_PERF] ${String(name)} ${duration.toFixed(2)}ms`, safeMeta);
    }
    perf.clearMarks(startMark);
    perf.clearMarks(endMark);
    perf.clearMeasures(measureName);
  }
}

export function markInterviewPerf(name) {
  if (!isInterviewPerfEnabled()) return false;
  const perf = globalThis.performance;
  try {
    perf.mark(String(name || ""));
    return true;
  } catch {
    return false;
  }
}

export function measureInterviewSpan({
  name,
  startMark,
  endMark,
  meta = null,
  clear = true,
} = {}) {
  if (!isInterviewPerfEnabled()) return 0;
  const perf = globalThis.performance;
  const spanName = String(name || `${String(startMark || "span")}:${String(endMark || "end")}:${++perfSeq}`);
  const safeMeta = readMeta(meta);
  try {
    perf.measure(spanName, String(startMark || ""), String(endMark || ""));
    const entries = perf.getEntriesByName(spanName);
    const last = entries[entries.length - 1];
    const duration = Number(last?.duration || 0);
    writePerfStore(spanName, duration, safeMeta);
    if (duration >= 8 || window?.__FPC_DEBUG_INTERVIEW_PERF__) {
      // eslint-disable-next-line no-console
      console.debug(`[INTERVIEW_PERF_SPAN] ${spanName} ${duration.toFixed(2)}ms`, safeMeta);
    }
    return duration;
  } catch {
    return 0;
  } finally {
    if (clear) {
      try {
        perf.clearMeasures(spanName);
        perf.clearMarks(String(startMark || ""));
        perf.clearMarks(String(endMark || ""));
      } catch {
        // ignore clear errors
      }
    }
  }
}

export function scheduleInterviewIdle(task, options = {}) {
  const timeout = Number(options?.timeout || 0) > 0 ? Number(options.timeout) : 300;
  if (typeof window === "undefined") {
    const id = setTimeout(() => {
      task?.({ didTimeout: true, timeRemaining: () => 0 });
    }, 0);
    return () => clearTimeout(id);
  }
  if (typeof window.requestIdleCallback === "function") {
    const id = window.requestIdleCallback((deadline) => {
      task?.(deadline);
    }, { timeout });
    return () => {
      if (typeof window.cancelIdleCallback === "function") window.cancelIdleCallback(id);
    };
  }
  const id = window.setTimeout(() => {
    task?.({ didTimeout: true, timeRemaining: () => 0 });
  }, 0);
  return () => window.clearTimeout(id);
}
