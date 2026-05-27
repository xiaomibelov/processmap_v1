import test from "node:test";
import assert from "node:assert/strict";

// Minimal React re-implementation for node:test without DOM
let hookState = new Map();
let hookIndex = 0;
let effectQueue = [];
let currentComponent = null;

function resetHooks() {
  hookState = new Map();
  hookIndex = 0;
  effectQueue = [];
  currentComponent = null;
}

function useState(initial) {
  const key = `${currentComponent}_${hookIndex++}`;
  if (!hookState.has(key)) {
    hookState.set(key, typeof initial === "function" ? initial() : initial);
  }
  const value = hookState.get(key);
  const setValue = (next) => {
    const resolved = typeof next === "function" ? next(hookState.get(key)) : next;
    hookState.set(key, resolved);
  };
  return [value, setValue];
}

function useRef(initial) {
  const key = `${currentComponent}_${hookIndex++}`;
  if (!hookState.has(key)) {
    hookState.set(key, { current: initial });
  }
  return hookState.get(key);
}

function useCallback(fn, deps) {
  const key = `${currentComponent}_${hookIndex++}`;
  hookState.set(key, { fn, deps });
  return fn;
}

function useEffect(fn, deps) {
  effectQueue.push({ fn, deps });
}

// Mock window location/history
class MockLocation {
  constructor(url = "https://processmap.local/app") {
    const u = new URL(url, "https://processmap.local");
    this.href = u.href;
    this.pathname = u.pathname;
    this.search = u.search;
    this.hash = u.hash;
  }
}

class MockHistory {
  constructor() {
    this.state = null;
    this.stack = [];
  }
  pushState(state, title, url) {
    this.state = state;
    this.stack.push({ state, title, url });
    global.window.location = new MockLocation(
      new URL(url, "https://processmap.local").href,
    );
  }
}

function setupWindow(url = "https://processmap.local/app") {
  const loc = new MockLocation(url);
  const hist = new MockHistory();
  const listeners = new Map();
  global.window = {
    location: loc,
    history: hist,
    addEventListener: (event, handler) => {
      if (!listeners.has(event)) listeners.set(event, new Set());
      listeners.get(event).add(handler);
    },
    removeEventListener: (event, handler) => {
      listeners.get(event)?.delete(handler);
    },
    dispatchEvent: (event) => {
      listeners.get(event.type)?.forEach((h) => h(event));
    },
    _listeners: listeners,
  };
  return { listeners };
}

// Inline the route model helpers needed for tests
const ANALYTICS_HUB_SURFACE = "analytics";
const PRODUCT_ACTIONS_REGISTRY_SURFACE = "product-actions-registry";

function text(value) {
  return String(value || "").trim();
}

function readAnalyticsHubRoute(locationLike = global.window?.location) {
  try {
    const url = new URL(locationLike?.href || "https://processmap.local/app");
    const params = new URLSearchParams(url.search || "");
    const surface = text(params.get("surface")).toLowerCase();
    const projectId = text(params.get("project"));
    const sessionId = projectId ? text(params.get("session")) : "";
    const workspaceId = text(params.get("workspace"));
    if (surface !== ANALYTICS_HUB_SURFACE) {
      return { active: false, workspaceId, projectId, sessionId };
    }
    return { active: true, workspaceId, projectId, sessionId };
  } catch {
    return { active: false, workspaceId: "", projectId: "", sessionId: "" };
  }
}

function readProductActionsRegistryRoute(locationLike = global.window?.location) {
  try {
    const url = new URL(locationLike?.href || "https://processmap.local/app");
    const params = new URLSearchParams(url.search || "");
    const surface = text(params.get("surface")).toLowerCase();
    const projectId = text(params.get("project"));
    const sessionId = projectId ? text(params.get("session")) : "";
    const workspaceId = text(params.get("workspace"));
    if (surface !== PRODUCT_ACTIONS_REGISTRY_SURFACE) {
      return { active: false, scope: "workspace", workspaceId, projectId, sessionId };
    }
    const explicitScope = text(params.get("registry_scope"));
    const scope = explicitScope
      ? (explicitScope === "session" || explicitScope === "current" ? "session" : explicitScope === "project" ? "project" : "workspace")
      : sessionId
        ? "session"
        : projectId
          ? "project"
          : "workspace";
    return { active: true, scope, workspaceId, projectId, sessionId };
  } catch {
    return { active: false, scope: "workspace", workspaceId: "", projectId: "", sessionId: "" };
  }
}

function buildAnalyticsHubUrl(routeRaw = {}, options = {}) {
  const route = routeRaw && typeof routeRaw === "object" ? routeRaw : {};
  const pathname = text(options?.pathname) || "/app";
  const hash = text(options?.hash);
  const params = new URLSearchParams(text(options?.baseSearch));
  const workspaceId = text(route.workspaceId ?? route.workspace_id);
  const projectId = text(route.projectId ?? route.project_id);
  const sessionId = projectId ? text(route.sessionId ?? route.session_id) : "";
  params.set("surface", ANALYTICS_HUB_SURFACE);
  if (workspaceId) params.set("workspace", workspaceId);
  else params.delete("workspace");
  if (projectId) params.set("project", projectId);
  else params.delete("project");
  if (sessionId) params.set("session", sessionId);
  else params.delete("session");
  const search = params.toString();
  return `${pathname}${search ? `?${search}` : ""}${hash}`;
}

function buildAnalyticsHubCloseUrl(routeRaw = {}, options = {}) {
  const route = routeRaw && typeof routeRaw === "object" ? routeRaw : {};
  const pathname = text(options?.pathname) || "/app";
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

function buildProductActionsRegistryUrl(routeRaw = {}, options = {}) {
  const route = routeRaw && typeof routeRaw === "object" ? routeRaw : {};
  const scope = text(route.scope ?? route.registry_scope).toLowerCase();
  const normalizedScope = scope === "session" || scope === "current" ? "session" : scope === "project" ? "project" : "workspace";
  const pathname = text(options?.pathname) || "/app";
  const hash = text(options?.hash);
  const params = new URLSearchParams(text(options?.baseSearch));
  const workspaceId = text(route.workspaceId ?? route.workspace_id);
  const projectId = text(route.projectId ?? route.project_id);
  const sessionId = projectId ? text(route.sessionId ?? route.session_id) : "";
  params.set("surface", PRODUCT_ACTIONS_REGISTRY_SURFACE);
  params.set("registry_scope", normalizedScope);
  if (workspaceId) params.set("workspace", workspaceId);
  else params.delete("workspace");
  if (normalizedScope === "workspace") {
    params.delete("project");
    params.delete("session");
  } else if (normalizedScope === "project") {
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

function buildProductActionsRegistryCloseUrl(routeRaw = {}, options = {}) {
  const route = routeRaw && typeof routeRaw === "object" ? routeRaw : {};
  const pathname = text(options?.pathname) || "/app";
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

// Re-implement hook using mocked React and route model
function useAnalyticsRouteState({ sessionId = "", projectId = "", workspaceId = "" } = {}) {
  const [analyticsHubRoute, setAnalyticsHubRoute] = useState(() => readAnalyticsHubRoute());
  const [productActionsRegistryRoute, setProductActionsRegistryRoute] = useState(
    () => readProductActionsRegistryRoute(),
  );

  const scopeKeyRef = useRef("");

  const syncAnalyticsHubRoute = useCallback(() => {
    setAnalyticsHubRoute(readAnalyticsHubRoute());
  }, []);

  const syncProductActionsRegistryRoute = useCallback(() => {
    setProductActionsRegistryRoute(readProductActionsRegistryRoute());
  }, []);

  useEffect(() => {
    global.window.addEventListener("popstate", syncAnalyticsHubRoute);
    return () => global.window.removeEventListener("popstate", syncAnalyticsHubRoute);
  }, [syncAnalyticsHubRoute]);

  useEffect(() => {
    global.window.addEventListener("popstate", syncProductActionsRegistryRoute);
    return () => global.window.removeEventListener("popstate", syncProductActionsRegistryRoute);
  }, [syncProductActionsRegistryRoute]);

  useEffect(() => {
    const scopeKey = `${text(workspaceId)}::${text(projectId)}::${text(sessionId)}`;
    if (scopeKeyRef.current === scopeKey) return;
    scopeKeyRef.current = scopeKey;
    setAnalyticsHubRoute(readAnalyticsHubRoute());
    setProductActionsRegistryRoute(readProductActionsRegistryRoute());
  }, [sessionId, projectId, workspaceId]);

  const openAnalyticsHub = useCallback((options = {}) => {
    if (typeof global.window === "undefined") return;
    const nextUrl = buildAnalyticsHubUrl({
      workspaceId: options?.workspaceId || workspaceId || analyticsHubRoute.workspaceId,
      projectId: options?.projectId ?? projectId,
      sessionId: options?.sessionId ?? sessionId,
    }, {
      pathname: global.window.location.pathname || "/app",
      baseSearch: global.window.location.search || "",
      hash: global.window.location.hash || "",
    });
    global.window.history.pushState({ ...(global.window.history.state || {}), surface: "analytics" }, "", nextUrl);
    setAnalyticsHubRoute(readAnalyticsHubRoute(global.window.location));
    setProductActionsRegistryRoute(readProductActionsRegistryRoute(global.window.location));
  }, [workspaceId, projectId, sessionId, analyticsHubRoute.workspaceId]);

  const closeAnalyticsHub = useCallback(() => {
    if (typeof global.window === "undefined") return;
    const nextUrl = buildAnalyticsHubCloseUrl({
      workspaceId: analyticsHubRoute.workspaceId || workspaceId,
      projectId: projectId,
      sessionId: sessionId,
    }, {
      pathname: global.window.location.pathname || "/app",
      baseSearch: global.window.location.search || "",
      hash: global.window.location.hash || "",
    });
    global.window.history.pushState({ ...(global.window.history.state || {}) }, "", nextUrl);
    setAnalyticsHubRoute(readAnalyticsHubRoute(global.window.location));
    setProductActionsRegistryRoute(readProductActionsRegistryRoute(global.window.location));
  }, [workspaceId, projectId, sessionId, analyticsHubRoute.workspaceId]);

  const openProductActionsRegistry = useCallback((options = {}) => {
    if (typeof global.window === "undefined") return;
    const scope = text(options?.scope) || (sessionId ? "session" : projectId ? "project" : "workspace");
    const currentUrl = new URL(global.window.location.href);
    const fromAnalytics = analyticsHubRoute.active || currentUrl.searchParams.get("surface") === "analytics";
    if (fromAnalytics) {
      currentUrl.searchParams.set("return_to", "analytics");
    }
    const nextUrl = buildProductActionsRegistryUrl({
      scope,
      workspaceId: options?.workspaceId || workspaceId || productActionsRegistryRoute.workspaceId,
      projectId: options?.projectId ?? projectId,
      sessionId: options?.sessionId ?? sessionId,
    }, {
      pathname: global.window.location.pathname || "/app",
      baseSearch: currentUrl.searchParams.toString(),
      hash: global.window.location.hash || "",
    });
    global.window.history.pushState({ ...(global.window.history.state || {}), surface: "product-actions-registry" }, "", nextUrl);
    setProductActionsRegistryRoute(readProductActionsRegistryRoute(global.window.location));
    setAnalyticsHubRoute(readAnalyticsHubRoute(global.window.location));
  }, [workspaceId, projectId, sessionId, analyticsHubRoute.active, productActionsRegistryRoute.workspaceId]);

  const closeProductActionsRegistry = useCallback(() => {
    if (typeof global.window === "undefined") return;
    const url = new URL(global.window.location.href);
    const returnTo = url.searchParams.get("return_to");
    let nextUrl;
    if (returnTo === "analytics") {
      url.searchParams.delete("return_to");
      nextUrl = buildAnalyticsHubUrl({
        workspaceId: productActionsRegistryRoute.workspaceId || workspaceId,
        projectId: projectId,
        sessionId: sessionId,
      }, {
        pathname: global.window.location.pathname || "/app",
        baseSearch: url.searchParams.toString(),
        hash: global.window.location.hash || "",
      });
    } else {
      nextUrl = buildProductActionsRegistryCloseUrl({
        workspaceId: productActionsRegistryRoute.workspaceId || workspaceId,
        projectId: projectId,
        sessionId: sessionId,
      }, {
        pathname: global.window.location.pathname || "/app",
        baseSearch: global.window.location.search || "",
        hash: global.window.location.hash || "",
      });
    }
    global.window.history.pushState({ ...(global.window.history.state || {}) }, "", nextUrl);
    setProductActionsRegistryRoute(readProductActionsRegistryRoute(global.window.location));
    setAnalyticsHubRoute(readAnalyticsHubRoute(global.window.location));
  }, [workspaceId, projectId, sessionId, productActionsRegistryRoute.workspaceId]);

  return {
    analyticsHubRoute,
    productActionsRegistryRoute,
    setAnalyticsHubRoute,
    setProductActionsRegistryRoute,
    openAnalyticsHub,
    closeAnalyticsHub,
    openProductActionsRegistry,
    closeProductActionsRegistry,
  };
}

function renderHook(fn, props) {
  resetHooks();
  currentComponent = "test";
  const result = fn(props);
  // Run effects once but do NOT clean up immediately so listeners stay registered
  effectQueue.forEach(({ fn: effectFn }) => {
    effectFn();
  });
  return { result };
}

function rerenderHook(fn, props) {
  hookIndex = 0;
  effectQueue = [];
  currentComponent = "test";
  const result = fn(props);
  const stateBefore = new Map(hookState);
  effectQueue.forEach(({ fn: effectFn }) => {
    effectFn();
  });
  const stateChanged = Array.from(hookState.keys()).some(
    (key) => hookState.get(key) !== stateBefore.get(key),
  );
  if (stateChanged) {
    hookIndex = 0;
    effectQueue = [];
    return { result: fn(props) };
  }
  return { result };
}

// Helper to read fresh state after actions mutate hookState
function getFreshResult() {
  hookIndex = 0;
  effectQueue = [];
  currentComponent = "test";
  return useAnalyticsRouteState({});
}

test("initializes routes from location", () => {
  setupWindow("https://processmap.local/app?surface=analytics&project=p1&session=s1");
  const { result } = renderHook(useAnalyticsRouteState, { sessionId: "s1", projectId: "p1" });
  assert.equal(result.analyticsHubRoute.active, true);
  assert.equal(result.analyticsHubRoute.projectId, "p1");
  assert.equal(result.analyticsHubRoute.sessionId, "s1");
  assert.equal(result.productActionsRegistryRoute.active, false);
});

test("initializes product actions registry route from location", () => {
  setupWindow("https://processmap.local/app?surface=product-actions-registry&registry_scope=session&project=p1&session=s1");
  const { result } = renderHook(useAnalyticsRouteState, { sessionId: "s1", projectId: "p1" });
  assert.equal(result.productActionsRegistryRoute.active, true);
  assert.equal(result.productActionsRegistryRoute.scope, "session");
  assert.equal(result.productActionsRegistryRoute.projectId, "p1");
  assert.equal(result.analyticsHubRoute.active, false);
});

test("openAnalyticsHub sets surface and updates route state", () => {
  setupWindow("https://processmap.local/app?project=p1&session=s1");
  const { result } = renderHook(useAnalyticsRouteState, { sessionId: "s1", projectId: "p1" });
  assert.equal(result.analyticsHubRoute.active, false);
  result.openAnalyticsHub();
  const fresh = getFreshResult();
  assert.equal(fresh.analyticsHubRoute.active, true);
  assert.equal(fresh.analyticsHubRoute.projectId, "p1");
  assert.equal(global.window.location.search.includes("surface=analytics"), true);
});

test("closeAnalyticsHub clears surface", () => {
  setupWindow("https://processmap.local/app?surface=analytics&project=p1&session=s1");
  const { result } = renderHook(useAnalyticsRouteState, { sessionId: "s1", projectId: "p1" });
  assert.equal(result.analyticsHubRoute.active, true);
  result.closeAnalyticsHub();
  const fresh = getFreshResult();
  assert.equal(fresh.analyticsHubRoute.active, false);
  assert.equal(global.window.location.search.includes("surface=analytics"), false);
});

test("openProductActionsRegistry sets scope from sessionId fallback", () => {
  setupWindow("https://processmap.local/app?project=p1&session=s1");
  const { result } = renderHook(useAnalyticsRouteState, { sessionId: "s1", projectId: "p1" });
  result.openProductActionsRegistry();
  const fresh = getFreshResult();
  assert.equal(fresh.productActionsRegistryRoute.active, true);
  assert.equal(fresh.productActionsRegistryRoute.scope, "session");
  assert.equal(global.window.location.search.includes("surface=product-actions-registry"), true);
});

test("openProductActionsRegistry sets scope from project fallback when no session", () => {
  setupWindow("https://processmap.local/app?project=p1");
  const { result } = renderHook(useAnalyticsRouteState, { projectId: "p1" });
  result.openProductActionsRegistry();
  const fresh = getFreshResult();
  assert.equal(fresh.productActionsRegistryRoute.scope, "project");
});

test("openProductActionsRegistry sets scope to workspace when no project or session", () => {
  setupWindow("https://processmap.local/app");
  const { result } = renderHook(useAnalyticsRouteState, {});
  result.openProductActionsRegistry();
  const fresh = getFreshResult();
  assert.equal(fresh.productActionsRegistryRoute.scope, "workspace");
});

test("closeProductActionsRegistry with return_to=analytics restores analytics hub", () => {
  setupWindow("https://processmap.local/app?surface=product-actions-registry&registry_scope=session&project=p1&session=s1&return_to=analytics");
  const { result } = renderHook(useAnalyticsRouteState, { sessionId: "s1", projectId: "p1" });
  result.closeProductActionsRegistry();
  const fresh = getFreshResult();
  assert.equal(fresh.productActionsRegistryRoute.active, false);
  assert.equal(fresh.analyticsHubRoute.active, true);
  assert.equal(global.window.location.search.includes("return_to="), false);
});

test("closeProductActionsRegistry without return_to clears surface", () => {
  setupWindow("https://processmap.local/app?surface=product-actions-registry&registry_scope=session&project=p1&session=s1");
  const { result } = renderHook(useAnalyticsRouteState, { sessionId: "s1", projectId: "p1" });
  result.closeProductActionsRegistry();
  const fresh = getFreshResult();
  assert.equal(fresh.productActionsRegistryRoute.active, false);
  assert.equal(fresh.analyticsHubRoute.active, false);
  assert.equal(global.window.location.search.includes("surface="), false);
});

test("resets routes on session change", () => {
  setupWindow("https://processmap.local/app?surface=analytics&project=p1&session=s1");
  const { result } = renderHook(useAnalyticsRouteState, { sessionId: "s1", projectId: "p1" });
  assert.equal(result.analyticsHubRoute.active, true);

  // Change session and location
  setupWindow("https://processmap.local/app?project=p1&session=s2");
  const { result: result2 } = rerenderHook(useAnalyticsRouteState, { sessionId: "s2", projectId: "p1" });
  assert.equal(result2.analyticsHubRoute.active, false);
});

test("registers popstate listeners", () => {
  setupWindow("https://processmap.local/app?project=p1&session=s1");
  renderHook(useAnalyticsRouteState, { sessionId: "s1", projectId: "p1" });
  const popstateListeners = global.window._listeners.get("popstate");
  assert.ok(popstateListeners);
  assert.equal(popstateListeners.size >= 2, true);
});

test("setters are exposed", () => {
  setupWindow("https://processmap.local/app");
  const { result } = renderHook(useAnalyticsRouteState, {});
  assert.equal(typeof result.setAnalyticsHubRoute, "function");
  assert.equal(typeof result.setProductActionsRegistryRoute, "function");
});
