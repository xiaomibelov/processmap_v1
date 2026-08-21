import { useSyncExternalStore } from "react";

const AI_CACHE_KEY = "fpc_ai_cache_v1";
const AI_ERROR_MUTE_MS = 8000;
const AI_HISTORY_LIMIT = 80;
const AI_CACHE_LIMIT = 120;

const TOOL_LABELS = {
  generate_process: "Генерация процесса",
  ai_questions: "AI-вопросы по узлам",
  session_title_questions: "AI-вопросы к названию сессии",
  interview_autosave_recompute: "Синхронизация Interview->BPMN",
  llm_verify: "Проверка AI провайдера",
  notes_extract_process: "AI-разбор заметок в процесс",
};

let aiState = {
  byTool: {},
  history: [],
  updatedAt: 0,
};
let snapshotCache = {
  updatedAt: -1,
  value: {
    byTool: [],
    history: [],
    running: 0,
    updatedAt: 0,
  },
};

const listeners = new Set();
const runtimeCache = new Map();
const errorMuteMap = new Map();
const runnerRegistry = new Map();

let cacheHydrated = false;

function asObject(v) {
  return v && typeof v === "object" && !Array.isArray(v) ? v : {};
}

function asArray(v) {
  return Array.isArray(v) ? v : [];
}

function toText(v) {
  return String(v || "").trim();
}

function nowIso(ts = Date.now()) {
  return new Date(ts).toISOString();
}

function fnv1aHex(input) {
  const src = String(input || "");
  let hash = 0x811c9dc5;
  for (let i = 0; i < src.length; i += 1) {
    hash ^= src.charCodeAt(i);
    hash = Math.imul(hash >>> 0, 0x01000193) >>> 0;
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function stableStringify(value) {
  if (value === null || value === undefined) return "null";
  const t = typeof value;
  if (t === "number" || t === "boolean") return JSON.stringify(value);
  if (t === "string") return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }
  if (t === "object") {
    const obj = asObject(value);
    const keys = Object.keys(obj).sort();
    return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(obj[key])}`).join(",")}}`;
  }
  return JSON.stringify(String(value));
}

function shouldLogAiTrace() {
  if (typeof window === "undefined") return false;
  if (window.__FPC_DEBUG_AI__) return true;
  try {
    return String(window.localStorage?.getItem("fpc_debug_ai") || "").trim() === "1";
  } catch {
    return false;
  }
}

function logAiTrace(tag, payload = {}) {
  if (!shouldLogAiTrace()) return;
  const suffix = Object.entries(payload || {})
    .map(([k, v]) => `${k}=${String(v)}`)
    .join(" ");
  // eslint-disable-next-line no-console
  console.debug(`[AI_EXEC] ${String(tag || "trace")} ${suffix}`.trim());
}

function emitState() {
  listeners.forEach((cb) => {
    try {
      cb();
    } catch {
      // ignore listeners failure
    }
  });
}

function snapshotState() {
  if (Number(snapshotCache.updatedAt || 0) === Number(aiState.updatedAt || 0)) {
    return snapshotCache.value;
  }
  const byTool = Object.values(asObject(aiState.byTool))
    .sort((a, b) => Number(b?.lastFinishedAtTs || b?.lastStartedAtTs || 0) - Number(a?.lastFinishedAtTs || a?.lastStartedAtTs || 0));
  const running = byTool.filter((x) => x.status === "running").length;
  const next = {
    byTool,
    history: asArray(aiState.history),
    running,
    updatedAt: Number(aiState.updatedAt || 0),
  };
  snapshotCache = {
    updatedAt: Number(aiState.updatedAt || 0),
    value: next,
  };
  return next;
}

function updateToolState(toolKey, patch = {}, historyItem = null) {
  const prevByTool = asObject(aiState.byTool);
  const prev = asObject(prevByTool[toolKey]);
  const next = {
    ...prev,
    ...patch,
    toolKey,
  };
  const nextByTool = {
    ...prevByTool,
    [toolKey]: next,
  };
  const nextHistory = historyItem
    ? [historyItem, ...asArray(aiState.history)].slice(0, AI_HISTORY_LIMIT)
    : asArray(aiState.history);
  aiState = {
    byTool: nextByTool,
    history: nextHistory,
    updatedAt: Date.now(),
  };
  emitState();
}

function toolLabel(toolId) {
  const id = toText(toolId);
  return TOOL_LABELS[id] || id || "AI tool";
}

function getToolKey({ toolId, sessionId, projectId }) {
  return [toText(toolId) || "ai_tool", toText(sessionId) || "-", toText(projectId) || "-"].join("::");
}

function getCacheKey({ toolId, sessionId, projectId, inputHash }) {
  return [toText(toolId) || "ai_tool", toText(sessionId) || "-", toText(projectId) || "-", toText(inputHash) || "no_hash"].join("::");
}

function hydrateCache() {
  if (cacheHydrated) return;
  cacheHydrated = true;
  if (typeof window === "undefined") return;
  try {
    const raw = window.localStorage?.getItem(AI_CACHE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    const entries = asArray(parsed?.entries);
    entries.forEach((entry) => {
      const key = toText(entry?.cacheKey);
      if (!key) return;
      runtimeCache.set(key, entry);
    });
  } catch {
    // ignore malformed cache
  }
}

function persistCache() {
  if (typeof window === "undefined") return;
  try {
    const entries = Array.from(runtimeCache.values())
      .sort((a, b) => Number(b?.updatedAtTs || 0) - Number(a?.updatedAtTs || 0))
      .slice(0, AI_CACHE_LIMIT);
    window.localStorage?.setItem(AI_CACHE_KEY, JSON.stringify({
      version: 1,
      entries,
      updatedAt: nowIso(),
    }));
  } catch {
    // ignore storage errors
  }
}

function readCached(cacheKey) {
  hydrateCache();
  const key = toText(cacheKey);
  if (!key) return null;
  const entry = runtimeCache.get(key);
  if (!entry) return null;
  return entry;
}

function writeCached(cacheKey, payload) {
  hydrateCache();
  const key = toText(cacheKey);
  if (!key) return;
  const next = {
    ...asObject(payload),
    cacheKey: key,
    updatedAtTs: Date.now(),
    updatedAt: nowIso(),
  };
  runtimeCache.set(key, next);
  if (runtimeCache.size > AI_CACHE_LIMIT * 2) {
    const stale = Array.from(runtimeCache.values())
      .sort((a, b) => Number(b?.updatedAtTs || 0) - Number(a?.updatedAtTs || 0))
      .slice(AI_CACHE_LIMIT);
    stale.forEach((entry) => {
      runtimeCache.delete(toText(entry?.cacheKey));
    });
  }
  persistCache();
}

function classifyAiError(rawError = {}, rawStatus = 0) {
  const status = Number(rawStatus || rawError?.status || 0);
  const details = asObject(rawError?.details || rawError?.data || {});
  const message = toText(rawError?.message || rawError?.error || details?.detail || rawError) || "AI request failed";
  const lower = message.toLowerCase();
  const timeoutLike = lower.includes("timeout") || lower.includes("timed out") || lower.includes("network");
  const retriable = timeoutLike || [0, 408, 425, 429, 500, 502, 503, 504].includes(status);
  const code = status > 0 ? `HTTP_${status}` : (timeoutLike ? "NETWORK_TIMEOUT" : "NETWORK_ERROR");
  return {
    code,
    status,
    message,
    retriable,
    details,
  };
}

function withMuteFlag(toolId, inputHash, error) {
  const err = asObject(error);
  const dedupeKey = `${toText(toolId)}::${toText(err.code)}::${toText(inputHash)}`;
  const now = Date.now();
  const last = Number(errorMuteMap.get(dedupeKey) || 0);
  const shouldNotify = (now - last) > AI_ERROR_MUTE_MS;
  if (shouldNotify) errorMuteMap.set(dedupeKey, now);
  return {
    ...err,
    shouldNotify,
  };
}

function createRequestId(toolId, inputHash) {
  const seed = `${toText(toolId)}::${toText(inputHash)}::${Date.now()}::${Math.random().toString(36).slice(2, 8)}`;
  return fnv1aHex(seed);
}

export function createAiInputHash(input) {
  return fnv1aHex(stableStringify(input));
}

export async function executeAi(options = {}) {
  const toolId = toText(options.toolId) || "ai_tool";
  const sessionId = toText(options.sessionId);
  const projectId = toText(options.projectId);
  const inputHash = toText(options.inputHash);
  const payload = asObject(options.payload);
  const mode = toText(options.mode).toLowerCase() === "replay" ? "replay" : "live";
  const run = typeof options.run === "function" ? options.run : null;
  const startedAtTs = Date.now();
  const startedAt = nowIso(startedAtTs);
  const requestId = createRequestId(toolId, inputHash);
  const toolKey = getToolKey({ toolId, sessionId, projectId });
  const cacheKey = getCacheKey({ toolId, sessionId, projectId, inputHash });
  const label = toolLabel(toolId);

  if (run) {
    runnerRegistry.set(toolKey, {
      toolId,
      sessionId,
      projectId,
      inputHash,
      payload,
      run,
    });
  }

  updateToolState(toolKey, {
    toolId,
    label,
    sessionId,
    projectId,
    inputHash,
    cacheKey,
    status: "running",
    running: true,
    cached: false,
    lastMessage: "AI request running",
    lastStartedAt: startedAt,
    lastStartedAtTs: startedAtTs,
    lastRequestId: requestId,
    runCount: Number(asObject(aiState.byTool[toolKey])?.runCount || 0) + 1,
  }, {
    type: "start",
    toolKey,
    toolId,
    label,
    startedAt,
    startedAtTs,
    requestId,
    mode,
  });

  logAiTrace("start", {
    tool: toolId,
    mode,
    sid: sessionId || "-",
    pid: projectId || "-",
    hash: inputHash || "-",
    requestId,
  });

  if (mode === "replay") {
    const cachedEntry = readCached(cacheKey);
    const finishedAtTs = Date.now();
    const finishedAt = nowIso(finishedAtTs);
    const durationMs = finishedAtTs - startedAtTs;
    if (cachedEntry && Object.prototype.hasOwnProperty.call(cachedEntry, "result")) {
      const msg = "Replay from cached result";
      updateToolState(toolKey, {
        status: "cached",
        running: false,
        cached: true,
        lastMessage: msg,
        lastFinishedAt: finishedAt,
        lastFinishedAtTs: finishedAtTs,
        durationMs,
        lastError: null,
      }, {
        type: "cached",
        toolKey,
        toolId,
        label,
        startedAt,
        finishedAt,
        finishedAtTs,
        durationMs,
        requestId,
        mode,
      });
      logAiTrace("replay_cached", {
        tool: toolId,
        sid: sessionId || "-",
        hash: inputHash || "-",
        requestId,
      });
      return {
        ok: true,
        cached: true,
        skipped: false,
        result: cachedEntry.result,
        meta: {
          startedAt,
          finishedAt,
          durationMs,
          requestId,
        },
      };
    }
    const noCacheError = withMuteFlag(toolId, inputHash, classifyAiError({ message: "Нет cached результата для replay" }, 404));
    updateToolState(toolKey, {
      status: "skipped",
      running: false,
      cached: false,
      lastMessage: noCacheError.message,
      lastFinishedAt: finishedAt,
      lastFinishedAtTs: finishedAtTs,
      durationMs,
      lastError: noCacheError,
      errorCount: Number(asObject(aiState.byTool[toolKey])?.errorCount || 0) + 1,
    }, {
      type: "error",
      toolKey,
      toolId,
      label,
      startedAt,
      finishedAt,
      finishedAtTs,
      durationMs,
      requestId,
      mode,
      error: noCacheError,
    });
    logAiTrace("replay_missing_cache", {
      tool: toolId,
      sid: sessionId || "-",
      hash: inputHash || "-",
      requestId,
    });
    return {
      ok: false,
      skipped: true,
      cached: false,
      error: noCacheError,
      meta: {
        startedAt,
        finishedAt,
        durationMs,
        requestId,
      },
    };
  }

  if (!run) {
    const finishedAtTs = Date.now();
    const finishedAt = nowIso(finishedAtTs);
    const durationMs = finishedAtTs - startedAtTs;
    const noRunnerError = withMuteFlag(toolId, inputHash, classifyAiError({ message: "AI runner is not configured" }, 400));
    updateToolState(toolKey, {
      status: "error",
      running: false,
      cached: false,
      lastMessage: noRunnerError.message,
      lastFinishedAt: finishedAt,
      lastFinishedAtTs: finishedAtTs,
      durationMs,
      lastError: noRunnerError,
      errorCount: Number(asObject(aiState.byTool[toolKey])?.errorCount || 0) + 1,
    }, {
      type: "error",
      toolKey,
      toolId,
      label,
      startedAt,
      finishedAt,
      finishedAtTs,
      durationMs,
      requestId,
      mode,
      error: noRunnerError,
    });
    logAiTrace("error_no_runner", {
      tool: toolId,
      sid: sessionId || "-",
      requestId,
    });
    return {
      ok: false,
      skipped: true,
      cached: false,
      error: noRunnerError,
      meta: {
        startedAt,
        finishedAt,
        durationMs,
        requestId,
      },
    };
  }

  let rawResult = null;
  let rawError = null;
  try {
    rawResult = await Promise.resolve(run({
      toolId,
      sessionId,
      projectId,
      inputHash,
      payload,
      requestId,
    }));
  } catch (error) {
    rawError = classifyAiError({ message: String(error?.message || error), details: { stack: String(error?.stack || "") } }, 0);
  }

  const finishedAtTs = Date.now();
  const finishedAt = nowIso(finishedAtTs);
  const durationMs = finishedAtTs - startedAtTs;

  const resultLooksOk = !rawError && asObject(rawResult).ok === true;
  if (resultLooksOk) {
    writeCached(cacheKey, {
      cacheKey,
      toolId,
      sessionId,
      projectId,
      inputHash,
      result: rawResult,
      meta: {
        finishedAt,
        durationMs,
        requestId,
      },
    });
    updateToolState(toolKey, {
      status: "success",
      running: false,
      cached: false,
      lastMessage: "AI request succeeded",
      lastFinishedAt: finishedAt,
      lastFinishedAtTs: finishedAtTs,
      durationMs,
      lastError: null,
      lastSuccessAt: finishedAt,
      lastSuccessAtTs: finishedAtTs,
      okCount: Number(asObject(aiState.byTool[toolKey])?.okCount || 0) + 1,
    }, {
      type: "success",
      toolKey,
      toolId,
      label,
      startedAt,
      finishedAt,
      finishedAtTs,
      durationMs,
      requestId,
      mode,
    });
    logAiTrace("success", {
      tool: toolId,
      sid: sessionId || "-",
      hash: inputHash || "-",
      durationMs,
      requestId,
    });
    return {
      ok: true,
      skipped: false,
      cached: false,
      result: rawResult,
      meta: {
        startedAt,
        finishedAt,
        durationMs,
        requestId,
      },
    };
  }

  const status = Number(rawError?.status || asObject(rawResult).status || 0);
  const classified = withMuteFlag(
    toolId,
    inputHash,
    rawError || classifyAiError(asObject(rawResult), status),
  );
  const cachedEntry = readCached(cacheKey);

  if (cachedEntry && Object.prototype.hasOwnProperty.call(cachedEntry, "result")) {
    updateToolState(toolKey, {
      status: "cached",
      running: false,
      cached: true,
      lastMessage: "AI request failed, used cached result",
      lastFinishedAt: finishedAt,
      lastFinishedAtTs: finishedAtTs,
      durationMs,
      lastError: classified,
      errorCount: Number(asObject(aiState.byTool[toolKey])?.errorCount || 0) + 1,
    }, {
      type: "cached_fallback",
      toolKey,
      toolId,
      label,
      startedAt,
      finishedAt,
      finishedAtTs,
      durationMs,
      requestId,
      mode,
      error: classified,
    });
    logAiTrace("fallback_cached", {
      tool: toolId,
      sid: sessionId || "-",
      code: classified.code,
      retriable: classified.retriable ? 1 : 0,
      durationMs,
      requestId,
    });
    return {
      ok: true,
      skipped: true,
      cached: true,
      result: cachedEntry.result,
      error: classified,
      meta: {
        startedAt,
        finishedAt,
        durationMs,
        requestId,
      },
    };
  }

  updateToolState(toolKey, {
    status: "error",
    running: false,
    cached: false,
    lastMessage: classified.message,
    lastFinishedAt: finishedAt,
    lastFinishedAtTs: finishedAtTs,
    durationMs,
    lastError: classified,
    errorCount: Number(asObject(aiState.byTool[toolKey])?.errorCount || 0) + 1,
  }, {
    type: "error",
    toolKey,
    toolId,
    label,
    startedAt,
    finishedAt,
    finishedAtTs,
    durationMs,
    requestId,
    mode,
    error: classified,
  });
  logAiTrace("error", {
    tool: toolId,
    sid: sessionId || "-",
    code: classified.code,
    retriable: classified.retriable ? 1 : 0,
    durationMs,
    requestId,
  });
  return {
    ok: false,
    skipped: true,
    cached: false,
    error: classified,
    meta: {
      startedAt,
      finishedAt,
      durationMs,
      requestId,
    },
  };
}

export async function rerunAiTool(toolKey, options = {}) {
  const key = toText(toolKey);
  const runner = runnerRegistry.get(key);
  if (!runner) {
    return {
      ok: false,
      skipped: true,
      cached: false,
      error: {
        code: "NO_RUNNER",
        message: "Инструмент недоступен для повтора в текущей сессии.",
        retriable: false,
        status: 0,
        shouldNotify: true,
      },
      meta: {
        startedAt: nowIso(),
        finishedAt: nowIso(),
        durationMs: 0,
        requestId: createRequestId("rerun", key),
      },
    };
  }
  return await executeAi({
    ...runner,
    mode: toText(options.mode).toLowerCase() === "replay" ? "replay" : "live",
    payload: {
      ...asObject(runner.payload),
      ...asObject(options.payload),
    },
    run: runner.run,
  });
}

export function subscribeAiStatus(listener) {
  if (typeof listener !== "function") return () => {};
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getAiStatusSnapshot() {
  return snapshotState();
}

export function useAiStatus() {
  return useSyncExternalStore(subscribeAiStatus, getAiStatusSnapshot, getAiStatusSnapshot);
}

export function getAiToolLabel(toolId) {
  return toolLabel(toolId);
}
