export const PROCESS_MAP_ROUTE_STATE_KEY = "processMapRoute";

const DEFAULT_APP_PATHNAME = "/app";
const VALID_SOURCES = new Set(["internal", "direct", "popstate"]);

function text(value) {
  return String(value || "").trim();
}

function normalizeSource(value) {
  const source = text(value).toLowerCase();
  return VALID_SOURCES.has(source) ? source : "direct";
}

function asLocationUrl(locationLike) {
  const fallback = "https://processmap.local/app";
  if (!locationLike) return new URL(fallback);
  if (typeof locationLike === "string") {
    return new URL(locationLike, fallback);
  }
  if (locationLike instanceof URL) return locationLike;
  if (locationLike.location) return asLocationUrl(locationLike.location);

  const href = text(locationLike.href);
  if (href) return new URL(href, fallback);

  const pathname = text(locationLike.pathname) || DEFAULT_APP_PATHNAME;
  const search = text(locationLike.search);
  const hash = text(locationLike.hash);
  return new URL(`${pathname}${search}${hash}`, fallback);
}

export function normalizeProcessMapRoute(routeRaw = {}) {
  const route = routeRaw && typeof routeRaw === "object" ? routeRaw : {};
  const workspaceId = text(route.workspaceId ?? route.workspace_id);
  const folderId = text(route.folderId ?? route.folder_id);
  const projectId = text(route.projectId ?? route.project_id);
  const sessionId = projectId ? text(route.sessionId ?? route.session_id) : "";
  const surface = sessionId && projectId
    ? "session"
    : projectId
      ? "project"
      : "workspace";

  return {
    surface,
    workspaceId,
    folderId,
    projectId,
    sessionId,
    source: normalizeSource(route.source),
  };
}

export function parseProcessMapRoute(locationLike = typeof window !== "undefined" ? window.location : undefined, options = {}) {
  try {
    const url = asLocationUrl(locationLike);
    const params = new URLSearchParams(url.search || "");
    return normalizeProcessMapRoute({
      workspaceId: params.get("workspace"),
      folderId: params.get("folder"),
      projectId: params.get("project"),
      sessionId: params.get("session"),
      source: options?.source || "direct",
    });
  } catch {
    return normalizeProcessMapRoute({ source: options?.source || "direct" });
  }
}

export function buildProcessMapUrl(routeRaw = {}, options = {}) {
  const raw = routeRaw && typeof routeRaw === "object" ? routeRaw : {};
  const route = normalizeProcessMapRoute(routeRaw);
  const pathname = text(options?.pathname) || DEFAULT_APP_PATHNAME;
  const hash = text(options?.hash);
  const baseSearch = text(options?.baseSearch);
  const params = new URLSearchParams(baseSearch);
  const shouldApply = (camelKey, snakeKey) => !baseSearch
    || Object.prototype.hasOwnProperty.call(raw, camelKey)
    || Object.prototype.hasOwnProperty.call(raw, snakeKey);

  if (shouldApply("workspaceId", "workspace_id")) {
    if (route.workspaceId) params.set("workspace", route.workspaceId);
    else params.delete("workspace");
  }
  if (shouldApply("folderId", "folder_id")) {
    if (route.folderId) params.set("folder", route.folderId);
    else params.delete("folder");
  }
  if (shouldApply("projectId", "project_id")) {
    if (route.projectId) params.set("project", route.projectId);
    else params.delete("project");
  }
  if (shouldApply("sessionId", "session_id")) {
    if (route.sessionId) params.set("session", route.sessionId);
    else params.delete("session");
  }

  const search = params.toString();
  return `${pathname}${search ? `?${search}` : ""}${hash}`;
}

export function routesEqual(a, b) {
  const left = normalizeProcessMapRoute(a);
  const right = normalizeProcessMapRoute(b);
  return left.surface === right.surface
    && left.workspaceId === right.workspaceId
    && left.folderId === right.folderId
    && left.projectId === right.projectId
    && left.sessionId === right.sessionId;
}

function writeProcessMapHistory(routeRaw, options = {}) {
  const win = options?.win || (typeof window !== "undefined" ? window : undefined);
  if (!win?.history || !win?.location) return { ok: false, action: "none", url: "" };

  const routeInput = {
    ...routeRaw,
    source: options?.source || routeRaw?.source || "internal",
  };
  const route = normalizeProcessMapRoute(routeInput);
  const url = buildProcessMapUrl(routeInput, {
    pathname: options?.pathname || win.location.pathname || DEFAULT_APP_PATHNAME,
    hash: Object.prototype.hasOwnProperty.call(options, "hash") ? options.hash : win.location.hash || "",
    baseSearch: options?.baseSearch || "",
  });
  const currentUrl = `${win.location.pathname || ""}${win.location.search || ""}${win.location.hash || ""}`;
  if (url === currentUrl && options?.force !== true) {
    return { ok: true, action: "none", url, route };
  }

  const prevState = win.history.state && typeof win.history.state === "object" ? win.history.state : {};
  const state = {
    ...prevState,
    [PROCESS_MAP_ROUTE_STATE_KEY]: route,
  };
  const replace = options?.replace === true;
  if (replace) win.history.replaceState(state, "", url);
  else win.history.pushState(state, "", url);
  return { ok: true, action: replace ? "replace" : "push", url, route };
}

export function pushProcessMapHistory(routeRaw, options = {}) {
  return writeProcessMapHistory(routeRaw, {
    ...options,
    replace: options?.replace === true,
  });
}

export function replaceProcessMapHistory(routeRaw, options = {}) {
  return writeProcessMapHistory(routeRaw, {
    ...options,
    replace: true,
  });
}
