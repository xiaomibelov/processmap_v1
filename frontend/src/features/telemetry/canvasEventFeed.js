// Лента телеметрии канваса (feature/canvas-telemetry-feed).
//
// Observer-only захват: ring buffer в памяти (~500 событий), батч-отправка
// 10–15 с + flush на error + keepalive-fetch на pagehide. ОТДЕЛЬНЫЙ транспорт
// вне telemetryClient и его 8-с throttle — потеря событий недопустима.
//
// Allowlist-инверсия redaction: запрещённые ключи (XML/свойства/имена/токены/
// координаты) вырезаются, строки ≤256, массивы ≤20, глубина ≤4. В ленту не
// попадают: bpmn_xml, значения бизнес-свойств, label/имена, waypoint/bounds.
//
// Захват синхронный: ноль await в командном пути, instrumentation never throws.

const ACCESS_TOKEN_KEY = "fpc_auth_access_token";
const MAX_EVENT_STRING = 256;
const MAX_LIST = 20;
const MAX_DEPTH = 4;
const REDACTED = "[REDACTED]";

const FORBIDDEN_KEYS = new Set([
  "properties",
  "oldproperties",
  "newlabel",
  "oldlabel",
  "delta",
  "newbounds",
  "oldbounds",
  "newwaypoints",
  "oldwaypoints",
  "start",
  "direction",
  "hint",
  "hints",
]);

const REDACTED_KEYS = /^(authorization|cookie|cookies|set-cookie|bpmn_xml|payload|request_body|response_body)$/i;

function defaultNow() {
  return Date.now();
}

function makeEventIdFactory() {
  let counter = 0;
  return () => {
    counter += 1;
    return `cev_${Date.now().toString(36)}_${counter.toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  };
}

function sanitizeValue(value, depth = 0) {
  if (depth > MAX_DEPTH) return "[max_depth]";
  if (Array.isArray(value)) {
    return value.slice(0, MAX_LIST).map((item) => sanitizeValue(item, depth + 1));
  }
  if (value && typeof value === "object") {
    const out = {};
    for (const [key, item] of Object.entries(value).slice(0, 40)) {
      const k = String(key || "").slice(0, 128);
      const lowered = k.toLowerCase();
      if (FORBIDDEN_KEYS.has(lowered)) continue;
      if (REDACTED_KEYS.test(lowered) || lowered.endsWith("token") || lowered.endsWith("_bpmn_xml")) {
        out[k] = REDACTED;
        continue;
      }
      out[k] = sanitizeValue(item, depth + 1);
    }
    return out;
  }
  if (typeof value === "string") {
    return value.length <= MAX_EVENT_STRING ? value : `${value.slice(0, MAX_EVENT_STRING)}...[truncated]`;
  }
  if (typeof value === "number" || typeof value === "boolean" || value == null) return value;
  return String(value).slice(0, MAX_EVENT_STRING);
}

function readStorage(storage, key) {
  try {
    return String(storage?.getItem(key) || "").trim();
  } catch {
    return "";
  }
}

function defaultTransport(win) {
  return async function transport(body, { keepalive = false } = {}) {
    const headers = { "Content-Type": "application/json" };
    const token = readStorage(win?.localStorage, ACCESS_TOKEN_KEY);
    if (token) headers.Authorization = `Bearer ${token}`;
    const response = await win.fetch("/api/telemetry/canvas-events", {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      credentials: "include",
      keepalive,
    });
    let data = null;
    try {
      data = await response.json();
    } catch {
      data = null;
    }
    return { ok: response.ok === true, status: Number(response.status || 0), data };
  };
}

export function createCanvasEventFeed(options = {}) {
  const sessionId = String(options.sessionId || "").trim();
  const projectId = String(options.projectId || "").trim() || null;
  const maxBuffer = Math.max(1, Number(options.maxBuffer || 500));
  const maxBatchBytes = Number(options.maxBatchBytes || 64 * 1024);
  const flushIntervalMs = Math.max(1000, Number(options.flushIntervalMs || 12_000));
  const errorFlushThrottleMs = Math.max(100, Number(options.errorFlushThrottleMs || 2_000));
  // Дефект #3 (stage): доставка не должна зависеть только от wall-clock
  // интервала — Chrome может троттлить/гасить таймеры (occlusion/App Nap/
  // energy saver). Защита: auto-flush по наполнению буфера + таймаут
  // транспорта + триггеры visibility/online.
  const transportTimeoutMs = Math.max(50, Number(options.transportTimeoutMs || 20_000));
  const autoFlushThreshold = Math.max(1, Number(options.autoFlushThreshold || 25));
  const now = typeof options.now === "function" ? options.now : defaultNow;
  const eventIdFactory = typeof options.eventIdFactory === "function" ? options.eventIdFactory : makeEventIdFactory();
  const win = options.win !== undefined ? options.win : typeof window !== "undefined" ? window : undefined;
  let enabled = options.enabled !== false;

  const transport = typeof options.transport === "function" ? options.transport : defaultTransport(win);

  let buffer = [];
  let seq = 0;
  let dropped = 0;
  let sent = 0;
  let failed = 0;
  let captureMsTotal = 0;
  let captureCount = 0;
  let flushInFlight = null;
  let autoFlushScheduled = false;
  const lastErrorFlushByCode = new Map();

  function withTransportTimeout(promise) {
    return Promise.race([
      promise,
      new Promise((_, reject) => {
        setTimeout(() => reject(new Error("canvas_feed_transport_timeout")), transportTimeoutMs);
      }),
    ]);
  }

  function scheduleFlush(reason) {
    if (autoFlushScheduled) return;
    autoFlushScheduled = true;
    setTimeout(() => {
      autoFlushScheduled = false;
      void flush(reason);
    }, 0);
  }

  function isEnabled() {
    if (!enabled) return false;
    try {
      if (win && win.__FPC_CANVAS_FEED_OFF__ === true) return false;
    } catch {
      // ignore
    }
    return true;
  }

  function publishDebug() {
    if (!win) return;
    try {
      win.__FPC_CANVAS_FEED__ = {
        buffered: buffer.length,
        dropped,
        sent,
        failed,
        captureMsTotal,
        captureCount,
        captureAvgMs: captureCount ? captureMsTotal / captureCount : 0,
      };
    } catch {
      // no-op
    }
  }

  function maybeFlushOnError(event) {
    const code = String(event?.error?.code || event?.error?.message || "unknown").slice(0, 128);
    const last = Number(lastErrorFlushByCode.get(code) || 0);
    const t = now();
    if (t - last < errorFlushThrottleMs) return;
    lastErrorFlushByCode.set(code, t);
    setTimeout(() => {
      void flush("error");
    }, 0);
  }

  function record(input) {
    if (!isEnabled() || !input || typeof input !== "object") return null;
    const t0 = typeof performance !== "undefined" && performance.now ? performance.now() : 0;
    try {
      const sanitized = sanitizeValue(input);
      if (!sanitized || typeof sanitized !== "object") return null;
      const kind = String(sanitized.kind || "").trim();
      if (!kind) return null;
      seq += 1;
      const entry = {
        event_id: String(eventIdFactory()).slice(0, 64),
        seq,
        ts: now(),
        kind,
        session_id: sessionId,
        ...(projectId ? { project_id: projectId } : {}),
        ...sanitized,
      };
      buffer.push(entry);
      if (buffer.length > maxBuffer) {
        dropped += buffer.length - maxBuffer;
        buffer.splice(0, buffer.length - maxBuffer);
      }
      if (kind === "error") {
        try {
          maybeFlushOnError(entry);
        } catch {
          // never throw from telemetry
        }
      }
      if (buffer.length >= autoFlushThreshold) {
        try {
          scheduleFlush("threshold");
        } catch {
          // never throw from telemetry
        }
      }
      publishDebug();
      return entry;
    } catch {
      return null;
    } finally {
      if (t0) {
        captureMsTotal += (typeof performance !== "undefined" && performance.now ? performance.now() : t0) - t0;
        captureCount += 1;
      }
    }
  }

  async function flush(reason = "manual", { keepalive = false } = {}) {
    if (!isEnabled()) return { ok: false, skipped: true };
    if (flushInFlight) return flushInFlight;
    flushInFlight = (async () => {
      try {
        const batch = [];
        let size = 0;
        for (const event of buffer) {
          const serialized = JSON.stringify(event);
          const next = size === 0 ? serialized.length : size + serialized.length + 1;
          if (batch.length >= 100 || (batch.length > 0 && next > maxBatchBytes)) break;
          if (serialized.length > maxBatchBytes) {
            // одиночное событие больше капа — дропаем со счётчиком
            dropped += 1;
            continue;
          }
          batch.push(event);
          size = next;
        }
        if (!batch.length) return { ok: true, accepted: 0 };
        const result = await withTransportTimeout(
          transport({ events: batch }, { keepalive: keepalive || reason === "pagehide" }),
        );
        if (result && result.ok) {
          buffer = buffer.slice(batch.length);
          sent += batch.length;
          publishDebug();
          return { ok: true, accepted: Number(result.data?.accepted ?? batch.length) };
        }
        failed += 1;
        publishDebug();
        return { ok: false, status: Number(result?.status || 0) };
      } catch {
        failed += 1;
        publishDebug();
        return { ok: false, status: 0 };
      } finally {
        flushInFlight = null;
      }
    })();
    return flushInFlight;
  }

  let timer = null;
  function start() {
    if (timer || !flushIntervalMs) return;
    timer = setInterval(() => {
      void flush("interval");
    }, flushIntervalMs);
    if (timer && typeof timer.unref === "function") timer.unref();
  }

  function stop() {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
  }

  let pagehideInstalled = false;
  let pagehideHandler = null;
  let lifecycleInstalled = false;
  const lifecycleHandlers = {};

  function installLifecycleFlush() {
    if (lifecycleInstalled || !win || typeof win.addEventListener !== "function") return;
    lifecycleInstalled = true;
    lifecycleHandlers.visibilitychange = () => {
      try {
        if (!documentHidden(win)) void flush("visibility");
      } catch {
        // never throw from telemetry
      }
    };
    lifecycleHandlers.online = () => {
      try {
        void flush("online");
      } catch {
        // never throw from telemetry
      }
    };
    win.addEventListener("visibilitychange", lifecycleHandlers.visibilitychange);
    win.addEventListener("online", lifecycleHandlers.online);
  }

  function uninstallLifecycleFlush() {
    if (!lifecycleInstalled || !win || typeof win.removeEventListener !== "function") return;
    lifecycleInstalled = false;
    if (lifecycleHandlers.visibilitychange) win.removeEventListener("visibilitychange", lifecycleHandlers.visibilitychange);
    if (lifecycleHandlers.online) win.removeEventListener("online", lifecycleHandlers.online);
  }

  function documentHidden(w) {
    try {
      const doc = w?.document;
      return doc ? doc.visibilityState === "hidden" : false;
    } catch {
      return false;
    }
  }
  function installPagehideFlush() {
    if (pagehideInstalled || !win || typeof win.addEventListener !== "function") return;
    pagehideInstalled = true;
    pagehideHandler = () => {
      try {
        void flush("pagehide", { keepalive: true });
      } catch {
        // never throw from listener
      }
    };
    win.addEventListener("pagehide", pagehideHandler);
  }

  function uninstallPagehideFlush() {
    if (!pagehideInstalled || !win || typeof win.removeEventListener !== "function") return;
    pagehideInstalled = false;
    if (pagehideHandler) win.removeEventListener("pagehide", pagehideHandler);
    pagehideHandler = null;
  }

  function destroy() {
    stop();
    uninstallPagehideFlush();
    uninstallLifecycleFlush();
    buffer = [];
    publishDebug();
  }

  start();
  installPagehideFlush();
  installLifecycleFlush();
  publishDebug();

  return {
    record,
    flush,
    peek: () => buffer.slice(),
    getDebugState: () => ({
      buffered: buffer.length,
      dropped,
      sent,
      failed,
      captureMsTotal,
      captureCount,
      captureAvgMs: captureCount ? captureMsTotal / captureCount : 0,
    }),
    setEnabled(value) {
      enabled = value !== false;
    },
    installPagehideFlush,
    uninstallPagehideFlush,
    destroy,
  };
}
