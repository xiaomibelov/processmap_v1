// Observer-подписки захвата ленты канваса (feature/canvas-telemetry-feed).
//
// Все helper'ы — чистые обёртки поверх публичных интерфейсов (runtime.onChange,
// options.api outbox, onStatus-callback): НОЛЬ правок в save-путях, ноль await
// в командном пути, instrumentation never throws.

const MAX_IDS = 20;

function asText(value) {
  return String(value || "").trim();
}

function isConnectionType(type) {
  const t = asText(type).toLowerCase();
  return t.includes("flow") || t.includes("connection") || t.includes("edge") || t.includes("messageflow");
}

function collectRefs(refs, ids, types, connections) {
  for (const ref of refs || []) {
    if (!ref || typeof ref !== "object") continue;
    const id = asText(ref.id);
    if (!id) continue;
    if (isConnectionType(ref.type)) {
      if (connections.length < MAX_IDS && !connections.includes(id)) connections.push(id);
    } else if (ids.length < MAX_IDS && !ids.includes(id)) {
      ids.push(id);
      const type = asText(ref.type);
      if (type && types.length < MAX_IDS && !types.includes(type)) types.push(type);
    }
  }
}

function readOps(body) {
  const operations = Array.isArray(body?.operations) ? body.operations : [];
  const opIds = [];
  const opTypes = [];
  for (const op of operations.slice(0, MAX_IDS)) {
    const opId = asText(op?.opId);
    const opType = asText(op?.type);
    if (opId) opIds.push(opId);
    if (opType) opTypes.push(opType);
  }
  return {
    opIds,
    opTypes,
    count: operations.length,
    baseVersion: Number.isFinite(Number(body?.baseVersion)) ? Math.round(Number(body.baseVersion)) : null,
  };
}

function safeRecord(feed, event) {
  try {
    feed?.record?.(event);
  } catch {
    // instrumentation must never break the save path
  }
}

function nowMs() {
  return typeof performance !== "undefined" && performance.now ? performance.now() : Date.now();
}

/**
 * Событие команды из payload runtime.onChange
 * ({command, action, commandContext}). Только id/типы элементов.
 */
export function buildCommandEvent(changeEvent) {
  const context = changeEvent?.commandContext && typeof changeEvent.commandContext === "object"
    ? changeEvent.commandContext
    : {};
  const elementIds = [];
  const elementTypes = [];
  const connectionIds = [];
  const refs = [];
  if (context.element && typeof context.element === "object") refs.push(context.element);
  for (const key of ["elements", "shapes", "movingShapes", "resizingShapes"]) {
    if (Array.isArray(context[key])) refs.push(...context[key]);
  }
  for (const key of ["source", "target", "newSource", "newTarget", "oldSource", "oldTarget", "parent"]) {
    if (context[key] && typeof context[key] === "object") refs.push(context[key]);
  }
  collectRefs(refs, elementIds, elementTypes, connectionIds);
  return {
    kind: "command",
    command: {
      type: asText(changeEvent?.command).slice(0, 128) || "unknown",
      action: asText(changeEvent?.action).slice(0, 32) || "execute",
      ...(elementIds.length ? { elementIds, elementTypes } : {}),
      ...(connectionIds.length ? { connectionIds } : {}),
    },
  };
}

/**
 * Подписка на runtime.onChange: каждая команда → kind:"command" в ленту.
 * Возвращает unsubscribe. Не ломает каскад при сбое записи.
 */
export function subscribeRuntimeChanges(runtime, feed) {
  if (!runtime || typeof runtime.onChange !== "function") return () => {};
  try {
    return runtime.onChange((ev) => {
      try {
        safeRecord(feed, buildCommandEvent(ev));
      } catch {
        // no-op
      }
    });
  } catch {
    return () => {};
  }
}

/**
 * Tap-обёртка transports ops-батча (options.api.postSessionOperations).
 * Меряет latency/status, пишет op/ack/error события; результат и броски
 * пробрасываются вызывающему без изменений.
 */
export function wrapOpsTransport(postFn, feed, { endpoint = "" } = {}) {
  return async function wrappedPostSessionOperations(sessionId, body, opts) {
    const t0 = nowMs();
    const ops = readOps(body);
    safeRecord(feed, {
      kind: "op",
      http: { endpoint },
      op: ops,
      versions: { clientBase: ops.baseVersion },
    });
    let result;
    try {
      result = await postFn(sessionId, body, opts);
    } catch (error) {
      safeRecord(feed, {
        kind: "error",
        http: { status: 0, latencyMs: Math.round(nowMs() - t0), endpoint },
        op: ops,
        error: {
          code: "network",
          message: asText(error?.message || error).slice(0, 256),
        },
      });
      throw error;
    }
    const latencyMs = Math.round(nowMs() - t0);
    const status = Number(result?.status || 0);
    const detail = result?.data?.detail;
    if (result?.ok && status === 200) {
      const ackVersion = Number(result?.data?.version);
      safeRecord(feed, {
        kind: "ack",
        http: { status, latencyMs, endpoint },
        op: ops,
        versions: {
          clientBase: ops.baseVersion,
          clientTracked: ops.baseVersion,
          serverAck: Number.isFinite(ackVersion) ? ackVersion : null,
        },
      });
      return result;
    }
    if (status === 409) {
      safeRecord(feed, {
        kind: "error",
        http: { status, latencyMs, endpoint },
        op: ops,
        error: {
          code: asText(detail?.code) || "DIAGRAM_STATE_CONFLICT",
          message: asText(detail?.message).slice(0, 256),
        },
        versions: {
          clientBase: ops.baseVersion,
          serverCurrent: Number.isFinite(Number(detail?.server_current_version))
            ? Number(detail.server_current_version)
            : null,
        },
      });
      return result;
    }
    if (status === 422) {
      safeRecord(feed, {
        kind: "error",
        http: { status, latencyMs, endpoint },
        op: ops,
        error: {
          code: asText(detail?.code) || "OPERATION_UNSUPPORTED",
          opId: asText(detail?.opId).slice(0, 64),
          opType: asText(detail?.type).slice(0, 64),
          reason: asText(detail?.reason).slice(0, 256),
        },
        versions: { clientBase: ops.baseVersion },
      });
      return result;
    }
    safeRecord(feed, {
      kind: "error",
      http: { status, latencyMs, endpoint },
      op: ops,
      error: {
        code: status === 0 ? "network" : "http_error",
        message: asText(result?.error || `HTTP ${status}`).slice(0, 256),
      },
      versions: { clientBase: ops.baseVersion },
    });
    return result;
  };
}

const OPS_STAGE_STATE = {
  "ops-saving": "saving",
  "ops-rebase": "saving",
  "ops-local": "saved",
  "ops-saved": "saved",
  "ops-degraded": "failed",
  "ops-conflict": "conflict",
  "ops-unsupported": "failed",
  "ops-error": "failed",
  "ops-gate-blocked": "saving",
};

/**
 * Tap-обёртка onStatus-callback'а outbox: UX-переходы → kind:"save_status".
 * Ошибки записи гасятся; callback вызывается с оригинальным событием, его
 * исключения не пролетают наружу (индикатор не должен ломать save path).
 *
 * F1: status-событие может нести versions {baseVersion, serverVersion}
 * (ops-saved) — они уходят в payload и оживляют converged-ветку агрегатора.
 */
export function wrapOnStatus(callback, feed) {
  return function wrappedOnStatus(event) {
    const stage = asText(event?.stage);
    const baseVersion = Number(event?.baseVersion);
    const serverVersion = Number(event?.serverVersion);
    const hasVersions = Number.isFinite(baseVersion) && Number.isFinite(serverVersion);
    safeRecord(feed, {
      kind: "save_status",
      ux: {
        ...(OPS_STAGE_STATE[stage] ? { state: OPS_STAGE_STATE[stage] } : {}),
        ...(stage ? { opsStage: stage.slice(0, 64) } : {}),
      },
      ...(hasVersions
        ? { versions: { clientTracked: Math.round(baseVersion), serverAck: Math.round(serverVersion) } }
        : {}),
      ...(event?.reason ? { error: { reason: asText(event.reason).slice(0, 256) } } : {}),
    });
    try {
      if (typeof callback === "function") callback(event);
    } catch {
      // indicator callback must not break the save path
    }
  };
}

/**
 * window error / unhandledrejection → kind:"pageerror". Возвращает uninstall.
 */
export function installPageErrorListeners(feed, { win: injectedWin } = {}) {
  const win = injectedWin !== undefined ? injectedWin : typeof window !== "undefined" ? window : undefined;
  if (!win || typeof win.addEventListener !== "function") return () => {};
  const onError = (event) => {
    safeRecord(feed, {
      kind: "pageerror",
      error: {
        message: asText(event?.message || event?.error?.message || "window_error").slice(0, 256),
        filename: asText(event?.filename).slice(0, 256),
        lineno: Number(event?.lineno || 0),
      },
    });
  };
  const onRejection = (event) => {
    safeRecord(feed, {
      kind: "pageerror",
      error: {
        message: asText(event?.reason?.message || event?.reason || "unhandled_rejection").slice(0, 256),
      },
    });
  };
  try {
    win.addEventListener("error", onError);
    win.addEventListener("unhandledrejection", onRejection);
  } catch {
    return () => {};
  }
  return () => {
    try {
      win.removeEventListener("error", onError);
      win.removeEventListener("unhandledrejection", onRejection);
    } catch {
      // no-op
    }
  };
}

// ---------------------------------------------------------------------------
// F1 (fix/save-telemetry-full-coverage-v1): tap ВСЕХ save-путей через события
// saveCoordinator. Пути P1 rawXml / P4 meta / P5 manual / P6 property (xml) /
// P7 analysis раньше в ленту не писали ни одного события (audit
// first-entry-save-error, Г3): баннерный путь был телеметрически слеп.
// Здесь observer-only подписка: координатор не импортирует ленту, save-пути
// не тронуты, instrumentation never throws.
// ---------------------------------------------------------------------------

const SAVE_PIPELINE_LABELS = {
  rawXml: "rawXml",
  xml: "property",
  meta: "meta",
  analysis: "analysis",
};

/**
 * Лейбл save-пути для error-события: manual save идёт тем же pipeline rawXml,
 * что autosave, и отличается только reason ("manual_save" → "manual").
 */
export function resolveSavePipelineLabel(pipelineName, reason) {
  const name = asText(pipelineName).slice(0, 64);
  if (name === "rawXml" && asText(reason).toLowerCase().includes("manual")) {
    return "manual";
  }
  return SAVE_PIPELINE_LABELS[name] || name || "unknown";
}

/**
 * Клиентский errorClass error-события (зеркало классов бэкенд-classify.py:
 * ops_409 / ops_422 / network / timeout / unknown) — raw-событие самоописано,
 * агрегаторная классификация остаётся на бэкенде.
 */
export function classifySaveErrorClass({ status = 0, code = "" } = {}) {
  const normalizedCode = asText(code);
  if (Number(status) === 409 || normalizedCode === "DIAGRAM_STATE_CONFLICT") return "ops_409";
  if (Number(status) === 422 || normalizedCode === "OPERATION_UNSUPPORTED") return "ops_422";
  if (normalizedCode === "timeout") return "timeout";
  if (!Number(status)) return "network";
  return "unknown";
}

function resolveSaveErrorCode(status, response) {
  const code = asText(response?.errorCode || response?.data?.detail?.code).slice(0, 64);
  if (code) return code;
  if (status === 409) return "DIAGRAM_STATE_CONFLICT";
  if (status > 0) return `http_${status}`;
  return /timeout/i.test(asText(response?.error)) ? "timeout" : "network";
}

function finiteVersion(value) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n) : null;
}

function recordCoordinatorSaveError(feed, data, { forcedCode } = {}) {
  const response = data?.response;
  const status = Number(response?.status || 0) || (forcedCode === "DIAGRAM_STATE_CONFLICT" ? 409 : 0);
  const code = forcedCode || resolveSaveErrorCode(status, response);
  const clientBase = finiteVersion(data?.clientBaseVersion);
  const serverCurrent = forcedCode === "DIAGRAM_STATE_CONFLICT" ? finiteVersion(data?.serverVersion) : null;
  const pipelineLabel = resolveSavePipelineLabel(data?.pipeline, data?.reason);
  safeRecord(feed, {
    kind: "error",
    save: {
      pipeline: pipelineLabel,
      errorClass: classifySaveErrorClass({ status, code }),
    },
    http: {
      status,
      endpoint: `save:${asText(data?.pipeline).slice(0, 32) || "unknown"}`,
    },
    error: {
      code,
      message: asText(
        response?.error || response?.data?.detail?.message || forcedCode || "save_failed",
      ).slice(0, 256),
    },
    versions: {
      ...(clientBase !== null ? { clientBase, clientTracked: clientBase } : {}),
      ...(serverCurrent !== null ? { serverCurrent } : {}),
    },
  });
}

/**
 * Подписка на события saveCoordinator → лента. Одна точка эмиссии на ВСЕ
 * не-ops save-пути: failure-ветки (error/conflict/session_not_found) пишут
 * kind:"error" с pipeline/errorClass/status/versions; success пишет
 * kind:"save_status" state:"saved" с versions — ack-эквивалент full-save,
 * оживляющий converged-ветку агрегатора. Фильтр по sessionId; возвращает
 * detach-функцию. Не бросает при любом входе.
 */
export function subscribeSaveCoordinatorTelemetry(coordinator, feed, { sessionId } = {}) {
  const sid = asText(sessionId);
  if (!sid || !coordinator || typeof coordinator.subscribe !== "function") {
    return () => {};
  }
  const handler = (event, data) => {
    try {
      if (asText(data?.sessionId) !== sid) return;
      // Pipeline "ops" уже тапнут wrapOpsTransport/wrapOnStatus — пропускаем,
      // чтобы не плодить дубли error/save_status событий на один факт.
      if (asText(data?.pipeline) === "ops") return;
      if (event === "error" || event === "session_not_found") {
        recordCoordinatorSaveError(feed, data, {
          forcedCode: event === "session_not_found" ? "session_not_found" : "",
        });
        return;
      }
      if (event === "conflict") {
        recordCoordinatorSaveError(feed, data, { forcedCode: "DIAGRAM_STATE_CONFLICT" });
        return;
      }
      if (event === "success") {
        const clientTracked = finiteVersion(data?.clientBaseVersion);
        const serverAck = finiteVersion(data?.version);
        safeRecord(feed, {
          kind: "save_status",
          ux: { state: "saved" },
          save: { pipeline: resolveSavePipelineLabel(data?.pipeline, data?.reason) },
          versions: {
            ...(clientTracked !== null ? { clientTracked } : {}),
            ...(serverAck !== null ? { serverAck } : {}),
          },
        });
      }
    } catch {
      // instrumentation must never break the save path
    }
  };
  try {
    return coordinator.subscribe(handler) || (() => {});
  } catch {
    return () => {};
  }
}
