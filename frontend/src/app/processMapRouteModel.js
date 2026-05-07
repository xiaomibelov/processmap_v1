export const PROCESS_MAP_ROUTE_STATE_KEY = "processMapRoute";
export const PROCESS_MAP_PROJECT_CONTEXT_STATE_KEY = "processMapProjectContext";
export const PRODUCT_ACTIONS_REGISTRY_SURFACE = "product-actions-registry";

const DEFAULT_APP_PATHNAME = "/app";
const VALID_SOURCES = new Set(["internal", "direct", "popstate"]);

function text(value) {
  return String(value || "").trim();
}

function normalizeSource(value) {
  const source = text(value).toLowerCase();
  return VALID_SOURCES.has(source) ? source : "direct";
}

export function normalizeProductActionsRegistryScope(value) {
  const scope = text(value).toLowerCase();
  if (scope === "session" || scope === "current") return "session";
  if (scope === "project") return "project";
  if (scope === "workspace") return "workspace";
  return "workspace";
}

function normalizeBreadcrumbBase(crumbsRaw) {
  const crumbs = Array.isArray(crumbsRaw) ? crumbsRaw : [];
  return crumbs
    .map((crumb) => {
      const type = text(crumb?.type).toLowerCase();
      const id = text(crumb?.id);
      const name = text(crumb?.name);
      if (!id || !name) return null;
      if (type !== "workspace" && type !== "folder") return null;
      return { type, id, name };
    })
    .filter(Boolean);
}

export function normalizeProcessMapProjectContext(contextRaw = {}) {
  const context = contextRaw && typeof contextRaw === "object" ? contextRaw : {};
  const breadcrumbBase = normalizeBreadcrumbBase(context.breadcrumbBase ?? context.breadcrumb_base);
  const workspaceCrumb = breadcrumbBase.find((crumb) => crumb.type === "workspace");
  const folderCrumbs = breadcrumbBase.filter((crumb) => crumb.type === "folder");
  const lastFolderCrumb = folderCrumbs.length ? folderCrumbs[folderCrumbs.length - 1] : null;
  const projectId = text(context.projectId ?? context.project_id);
  const workspaceId = text(context.workspaceId ?? context.workspace_id) || text(workspaceCrumb?.id);
  const folderId = text(context.folderId ?? context.folder_id) || text(lastFolderCrumb?.id);
  const projectTitle = text(context.projectTitle ?? context.project_title ?? context.title ?? context.name);

  if (!projectId && !workspaceId && !folderId && !projectTitle && !breadcrumbBase.length) {
    return null;
  }

  return {
    projectId,
    workspaceId,
    folderId,
    breadcrumbBase,
    projectTitle,
  };
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

export function readProductActionsRegistryRoute(locationLike = typeof window !== "undefined" ? window.location : undefined) {
  try {
    const url = asLocationUrl(locationLike);
    const params = new URLSearchParams(url.search || "");
    const surface = text(params.get("surface")).toLowerCase();
    const projectId = text(params.get("project"));
    const sessionId = projectId ? text(params.get("session")) : "";
    const workspaceId = text(params.get("workspace"));
    if (surface !== PRODUCT_ACTIONS_REGISTRY_SURFACE) {
      return {
        active: false,
        scope: "workspace",
        workspaceId,
        projectId,
        sessionId,
      };
    }
    const explicitScope = text(params.get("registry_scope"));
    const scope = explicitScope
      ? normalizeProductActionsRegistryScope(explicitScope)
      : sessionId
        ? "session"
        : projectId
          ? "project"
          : "workspace";
    return {
      active: true,
      scope,
      workspaceId,
      projectId,
      sessionId,
    };
  } catch {
    return {
      active: false,
      scope: "workspace",
      workspaceId: "",
      projectId: "",
      sessionId: "",
    };
  }
}

export function buildProductActionsRegistryUrl(routeRaw = {}, options = {}) {
  const route = routeRaw && typeof routeRaw === "object" ? routeRaw : {};
  const scope = normalizeProductActionsRegistryScope(route.scope ?? route.registry_scope);
  const pathname = text(options?.pathname) || DEFAULT_APP_PATHNAME;
  const hash = text(options?.hash);
  const params = new URLSearchParams(text(options?.baseSearch));
  const workspaceId = text(route.workspaceId ?? route.workspace_id);
  const projectId = text(route.projectId ?? route.project_id);
  const sessionId = projectId ? text(route.sessionId ?? route.session_id) : "";

  params.set("surface", PRODUCT_ACTIONS_REGISTRY_SURFACE);
  params.set("registry_scope", scope);
  if (workspaceId) params.set("workspace", workspaceId);
  else if (Object.prototype.hasOwnProperty.call(route, "workspaceId") || Object.prototype.hasOwnProperty.call(route, "workspace_id")) {
    params.delete("workspace");
  }

  if (scope === "workspace") {
    params.delete("project");
    params.delete("session");
  } else if (scope === "project") {
    if (projectId) params.set("project", projectId);
    else params.delete("project");
    params.delete("session");
  } else {
    if (projectId) params.set("project", projectId);
    else params.delete("project");
    if (sessionId) params.set("session", sessionId);
    else params.delete("session");
  }

  const search = params.toString();
  return `${pathname}${search ? `?${search}` : ""}${hash}`;
}

export function buildProductActionsRegistryCloseUrl(routeRaw = {}, options = {}) {
  const route = routeRaw && typeof routeRaw === "object" ? routeRaw : {};
  const pathname = text(options?.pathname) || DEFAULT_APP_PATHNAME;
  const hash = text(options?.hash);
  const params = new URLSearchParams(text(options?.baseSearch));
  params.delete("surface");
  params.delete("registry_scope");
  const workspaceId = text(route.workspaceId ?? route.workspace_id);
  const projectId = text(route.projectId ?? route.project_id);
  const sessionId = projectId ? text(route.sessionId ?? route.session_id) : "";
  if (workspaceId) params.set("workspace", workspaceId);
  if (projectId) params.set("project", projectId);
  else params.delete("project");
  if (sessionId) params.set("session", sessionId);
  else params.delete("session");
  const search = params.toString();
  return `${pathname}${search ? `?${search}` : ""}${hash}`;
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

export function readProcessMapProjectContextFromHistory(win = typeof window !== "undefined" ? window : undefined) {
  const state = win?.history?.state;
  if (!state || typeof state !== "object") return null;
  return normalizeProcessMapProjectContext(state[PROCESS_MAP_PROJECT_CONTEXT_STATE_KEY]);
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
  const prevStateRaw = win.history.state && typeof win.history.state === "object" ? win.history.state : {};
  const {
    [PROCESS_MAP_PROJECT_CONTEXT_STATE_KEY]: _prevProjectContext,
    ...prevState
  } = prevStateRaw;
  const projectContext = normalizeProcessMapProjectContext(routeRaw?.projectContext ?? options?.projectContext);
  const currentUrl = `${win.location.pathname || ""}${win.location.search || ""}${win.location.hash || ""}`;
  if (url === currentUrl && options?.force !== true && !projectContext) {
    return { ok: true, action: "none", url, route };
  }
  const state = {
    ...prevState,
    [PROCESS_MAP_ROUTE_STATE_KEY]: route,
  };
  if (projectContext) {
    state[PROCESS_MAP_PROJECT_CONTEXT_STATE_KEY] = projectContext;
  }
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
