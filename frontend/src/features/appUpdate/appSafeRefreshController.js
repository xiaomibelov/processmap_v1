function toText(value) {
  return String(value || "").trim();
}

function asObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function normalizeRiskStatus(value) {
  const status = toText(value).toLowerCase();
  if (
    status === "clean"
    || status === "dirty"
    || status === "saving"
    || status === "conflict"
    || status === "failed"
    || status === "stale"
    || status === "unknown"
  ) {
    return status;
  }
  return "unknown";
}

function normalizeFlushStatus(value) {
  const status = toText(value).toLowerCase();
  if (
    status === "clean"
    || status === "saved"
    || status === "failed"
    || status === "conflict"
    || status === "timeout"
  ) {
    return status;
  }
  return "failed";
}

let activeHandler = null;
const subscribers = new Set();

function notifySubscribers() {
  subscribers.forEach((subscriber) => {
    try {
      subscriber();
    } catch {
    }
  });
}

export function normalizeAppRefreshRisk(riskRaw = null) {
  const risk = asObject(riskRaw);
  return {
    status: normalizeRiskStatus(risk.status || (risk.clean === true ? "clean" : "")),
    message: toText(risk.message),
  };
}

export function normalizeSafeRefreshResult(resultRaw = null) {
  const result = asObject(resultRaw);
  const ok = result.ok === true;
  if (ok) {
    return {
      ok: true,
      status: normalizeFlushStatus(result.status || (result.skipped === true ? "clean" : "saved")),
      message: toText(result.message),
    };
  }
  return {
    ok: false,
    status: normalizeFlushStatus(result.status || (result.timeout === true ? "timeout" : "")),
    message: toText(result.message || result.error),
  };
}

export function registerAppSafeRefreshHandler(handler) {
  if (!handler || typeof handler !== "object") return () => {};
  activeHandler = handler;
  notifySubscribers();
  return () => {
    if (activeHandler === handler) {
      activeHandler = null;
      notifySubscribers();
    }
  };
}

export function subscribeAppSafeRefresh(handler) {
  if (typeof handler !== "function") return () => {};
  subscribers.add(handler);
  return () => {
    subscribers.delete(handler);
  };
}

export function getCurrentAppRefreshRisk() {
  if (!activeHandler || typeof activeHandler.getRisk !== "function") {
    return { status: "clean", message: "" };
  }
  try {
    return normalizeAppRefreshRisk(activeHandler.getRisk());
  } catch (error) {
    return {
      status: "unknown",
      message: toText(error?.message || error),
    };
  }
}

export async function runSafeRefreshBeforeReload({ reason = "app_update_refresh" } = {}) {
  const risk = getCurrentAppRefreshRisk();
  if (!activeHandler || typeof activeHandler.flush !== "function") {
    return { ok: true, status: "clean", message: "" };
  }
  if (risk.status === "clean") {
    return { ok: true, status: "clean", message: "" };
  }
  if (risk.status === "saving") {
    return {
      ok: false,
      status: "timeout",
      message: "Дождитесь завершения сохранения перед обновлением.",
    };
  }
  if (risk.status === "conflict" || risk.status === "failed" || risk.status === "stale" || risk.status === "unknown") {
    return {
      ok: false,
      status: risk.status === "conflict" ? "conflict" : "failed",
      message: risk.message || "Не удалось безопасно обновить приложение: есть несохранённые изменения или конфликт сохранения.",
    };
  }
  try {
    return normalizeSafeRefreshResult(await activeHandler.flush({ reason }));
  } catch (error) {
    return {
      ok: false,
      status: "failed",
      message: toText(error?.message || error || "Не удалось безопасно обновить приложение."),
    };
  }
}

export function __resetAppSafeRefreshForTests() {
  activeHandler = null;
  subscribers.clear();
}
