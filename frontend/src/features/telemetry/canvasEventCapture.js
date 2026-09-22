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
 */
export function wrapOnStatus(callback, feed) {
  return function wrappedOnStatus(event) {
    const stage = asText(event?.stage);
    safeRecord(feed, {
      kind: "save_status",
      ux: {
        ...(OPS_STAGE_STATE[stage] ? { state: OPS_STAGE_STATE[stage] } : {}),
        ...(stage ? { opsStage: stage.slice(0, 64) } : {}),
      },
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
