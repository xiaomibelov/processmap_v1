function toText(value) {
  return String(value || "").trim();
}

function toNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export function buildAuthLoaderGate({
  loading = false,
  isAuthed = false,
  reauthRequired = false,
  enabled = true,
} = {}) {
  if (enabled === false) {
    return { allowRun: false, status: "disabled", reason: "gate_disabled" };
  }
  if (loading) {
    return { allowRun: false, status: "auth_bootstrap_pending", reason: "auth_loading" };
  }
  if (reauthRequired) {
    return { allowRun: false, status: "reauth_required", reason: "reauth_required" };
  }
  if (!isAuthed) {
    return { allowRun: false, status: "unauthenticated", reason: "not_authed" };
  }
  return { allowRun: true, status: "ready", reason: "auth_ready" };
}

export function canRunPrivilegedLoader(gateRaw = null) {
  const gate = gateRaw && typeof gateRaw === "object" ? gateRaw : {};
  return gate.allowRun === true;
}

export function classifyUnauthorizedResult(resultRaw, options = {}) {
  const result = resultRaw && typeof resultRaw === "object" ? resultRaw : {};
  const status = toNumber(result.status, 0);
  const unauthorizedStatuses = Array.isArray(options?.unauthorizedStatuses)
    ? options.unauthorizedStatuses
    : [401];
  const normalized = new Set(
    unauthorizedStatuses
      .map((value) => toNumber(value, 0))
      .filter((value) => value > 0),
  );
  if (options?.includeForbidden === true) normalized.add(403);
  return {
    unauthorized: normalized.has(status),
    status,
  };
}

export async function runGuardedLoader({
  gate = null,
  featureEnabled = true,
  scope = "",
  run,
  unauthorizedStatuses = [401],
  includeForbidden = false,
} = {}) {
  const normalizedScope = toText(scope) || "guarded_loader";
  if (featureEnabled === false) {
    return {
      ok: false,
      skipped: true,
      state: "skipped_feature_disabled",
      scope: normalizedScope,
      status: 0,
      error: "feature_disabled",
      data: null,
    };
  }
  if (!canRunPrivilegedLoader(gate)) {
    const gateState = gate && typeof gate === "object" ? gate : {};
    return {
      ok: false,
      skipped: true,
      state: "skipped_auth_not_ready",
      scope: normalizedScope,
      status: 0,
      error: toText(gateState.reason || gateState.status || "auth_not_ready"),
      gateStatus: toText(gateState.status || ""),
      data: null,
    };
  }
  if (typeof run !== "function") {
    return {
      ok: false,
      skipped: false,
      state: "error",
      scope: normalizedScope,
      status: 0,
      error: "loader_not_callable",
      data: null,
    };
  }

  try {
    const data = await run();
    if (data && typeof data === "object" && Object.prototype.hasOwnProperty.call(data, "ok")) {
      if (data.ok) {
        return {
          ok: true,
          skipped: false,
          state: "ok",
          scope: normalizedScope,
          status: toNumber(data.status, 200),
          error: "",
          data,
        };
      }
      const unauthorized = classifyUnauthorizedResult(data, {
        unauthorizedStatuses,
        includeForbidden,
      });
      if (unauthorized.unauthorized) {
        return {
          ok: false,
          skipped: false,
          state: "unauthorized",
          unauthorized: true,
          scope: normalizedScope,
          status: unauthorized.status,
          error: toText(data.error || "unauthorized"),
          data,
        };
      }
      return {
        ok: false,
        skipped: false,
        state: "error",
        scope: normalizedScope,
        status: toNumber(data.status, 0),
        error: toText(data.error || "loader_failed"),
        data,
      };
    }
    return {
      ok: true,
      skipped: false,
      state: "ok",
      scope: normalizedScope,
      status: 200,
      error: "",
      data,
    };
  } catch (error) {
    return {
      ok: false,
      skipped: false,
      state: "error",
      scope: normalizedScope,
      status: toNumber(error?.status, 0),
      error: toText(error?.message || error || "loader_failed"),
      data: null,
    };
  }
}
