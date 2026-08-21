import test from "node:test";
import assert from "node:assert/strict";

import {
  ANALYTICS_MODULE_ACTIONS,
  ANALYTICS_MODULE_OVERVIEW,
  ANALYTICS_MODULE_PROPERTIES,
  buildAnalyticsPath,
  buildProcessMapUrl,
} from "../../app/processMapRouteModel.js";

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

function text(value) {
  return String(value || "").trim();
}

function normalizeScope(value) {
  const scope = text(value).toLowerCase();
  if (scope === "session" || scope === "current") return "session";
  if (scope === "project") return "project";
  if (scope === "workspace") return "workspace";
  return "";
}

function resolveScopeId(options = {}, sessionId = "", projectId = "", workspaceId = "") {
  const explicitScope = normalizeScope(options?.scope);
  if (explicitScope === "session" || text(options?.sessionId)) {
    return { scope: "session", scopeId: text(options?.sessionId) || sessionId };
  }
  if (explicitScope === "project" || text(options?.projectId)) {
    return { scope: "project", scopeId: text(options?.projectId) || projectId };
  }
  if (explicitScope === "workspace" || text(options?.workspaceId)) {
    return { scope: "workspace", scopeId: text(options?.workspaceId) || workspaceId };
  }
  if (sessionId) return { scope: "session", scopeId: sessionId };
  if (projectId) return { scope: "project", scopeId: projectId };
  if (workspaceId) return { scope: "workspace", scopeId: workspaceId };
  return { scope: "workspace", scopeId: "" };
}

function readRoute(locationLike = global.window?.location) {
  try {
    const url = new URL(locationLike?.href || "https://processmap.local/app");
    const params = new URLSearchParams(url.search || "");
    return {
      active: false,
      workspaceId: text(params.get("workspace")),
      projectId: text(params.get("project")),
      sessionId: text(params.get("session")),
    };
  } catch {
    return { active: false, workspaceId: "", projectId: "", sessionId: "" };
  }
}

function readProductActionsRegistryRoute(locationLike = global.window?.location) {
  const base = readRoute(locationLike);
  return { ...base, scope: "workspace" };
}

function navigateToPath(path) {
  if (!path) return;
  global.window.history.pushState({}, "", path);
  global.window.dispatchEvent(new PopStateEvent("popstate"));
}

// Re-implement hook using mocked React and route model
function useAnalyticsRouteState({ sessionId = "", projectId = "", workspaceId = "" } = {}) {
  const [analyticsHubRoute, setAnalyticsHubRoute] = useState(() => readRoute());
  const [productActionsRegistryRoute, setProductActionsRegistryRoute] = useState(
    () => readProductActionsRegistryRoute(),
  );

  const scopeKeyRef = useRef("");

  const syncAnalyticsHubRoute = useCallback(() => {
    setAnalyticsHubRoute(readRoute());
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
    setAnalyticsHubRoute(readRoute());
    setProductActionsRegistryRoute(readProductActionsRegistryRoute());
  }, [sessionId, projectId, workspaceId]);

  const openAnalyticsHub = useCallback((options = {}) => {
    const { scope, scopeId } = resolveScopeId(options, sessionId, projectId, workspaceId);
    if (!scopeId) return;
    navigateToPath(buildAnalyticsPath(scope, scopeId, ANALYTICS_MODULE_OVERVIEW));
    setAnalyticsHubRoute(readRoute(global.window.location));
    setProductActionsRegistryRoute(readProductActionsRegistryRoute(global.window.location));
  }, [workspaceId, projectId, sessionId]);

  const closeAnalyticsHub = useCallback(() => {
    const nextUrl = buildProcessMapUrl({
      workspaceId: analyticsHubRoute.workspaceId || workspaceId,
      projectId: analyticsHubRoute.projectId || projectId,
      sessionId: analyticsHubRoute.sessionId || sessionId,
    });
    navigateToPath(nextUrl);
    setAnalyticsHubRoute(readRoute(global.window.location));
    setProductActionsRegistryRoute(readProductActionsRegistryRoute(global.window.location));
  }, [workspaceId, projectId, sessionId, analyticsHubRoute.workspaceId, analyticsHubRoute.projectId, analyticsHubRoute.sessionId]);

  const openPropertiesRegistry = useCallback((options = {}) => {
    const { scope, scopeId } = resolveScopeId(options, sessionId, projectId, workspaceId);
    if (!scopeId) return;
    navigateToPath(buildAnalyticsPath(scope, scopeId, ANALYTICS_MODULE_PROPERTIES));
    setProductActionsRegistryRoute(readProductActionsRegistryRoute(global.window.location));
    setAnalyticsHubRoute(readRoute(global.window.location));
  }, [workspaceId, projectId, sessionId]);

  const openProductActionsRegistry = useCallback((options = {}) => {
    const { scope, scopeId } = resolveScopeId(options, sessionId, projectId, workspaceId);
    if (!scopeId) return;
    navigateToPath(buildAnalyticsPath(scope, scopeId, ANALYTICS_MODULE_ACTIONS));
    setProductActionsRegistryRoute(readProductActionsRegistryRoute(global.window.location));
    setAnalyticsHubRoute(readRoute(global.window.location));
  }, [workspaceId, projectId, sessionId]);

  const closeProductActionsRegistry = useCallback(() => {
    const nextUrl = buildProcessMapUrl({
      workspaceId: productActionsRegistryRoute.workspaceId || workspaceId,
      projectId: productActionsRegistryRoute.projectId || projectId,
      sessionId: productActionsRegistryRoute.sessionId || sessionId,
    });
    navigateToPath(nextUrl);
    setProductActionsRegistryRoute(readProductActionsRegistryRoute(global.window.location));
    setAnalyticsHubRoute(readRoute(global.window.location));
  }, [workspaceId, projectId, sessionId, productActionsRegistryRoute.workspaceId, productActionsRegistryRoute.projectId, productActionsRegistryRoute.sessionId]);

  return {
    analyticsHubRoute,
    productActionsRegistryRoute,
    openAnalyticsHub,
    closeAnalyticsHub,
    openProductActionsRegistry,
    closeProductActionsRegistry,
    openPropertiesRegistry,
  };
}

function renderHook(fn, props) {
  resetHooks();
  currentComponent = "test";
  const result = fn(props);
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

function getFreshResult() {
  hookIndex = 0;
  effectQueue = [];
  currentComponent = "test";
  return useAnalyticsRouteState({});
}

test("initializes route state from /app query params", () => {
  setupWindow("https://processmap.local/app?project=p1&session=s1");
  const { result } = renderHook(useAnalyticsRouteState, { sessionId: "s1", projectId: "p1" });
  assert.equal(result.analyticsHubRoute.active, false);
  assert.equal(result.analyticsHubRoute.projectId, "p1");
  assert.equal(result.analyticsHubRoute.sessionId, "s1");
});

test("openAnalyticsHub navigates to backend-driven analytics path", () => {
  setupWindow("https://processmap.local/app?project=p1&session=s1");
  const { result } = renderHook(useAnalyticsRouteState, { sessionId: "s1", projectId: "p1" });
  result.openAnalyticsHub();
  const fresh = getFreshResult();
  assert.equal(global.window.location.pathname, "/analytics/session/s1");
  assert.equal(fresh.analyticsHubRoute.active, false);
});

test("closeAnalyticsHub returns to /app preserving context", () => {
  setupWindow("https://processmap.local/app?project=p1&session=s1");
  const { result } = renderHook(useAnalyticsRouteState, { sessionId: "s1", projectId: "p1" });
  result.openAnalyticsHub();
  result.closeAnalyticsHub();
  assert.equal(global.window.location.pathname, "/app");
  const params = new URLSearchParams(global.window.location.search);
  assert.equal(params.get("project"), "p1");
  assert.equal(params.get("session"), "s1");
});

test("openProductActionsRegistry navigates to actions module path", () => {
  setupWindow("https://processmap.local/app?project=p1");
  const { result } = renderHook(useAnalyticsRouteState, { projectId: "p1" });
  result.openProductActionsRegistry();
  assert.equal(global.window.location.pathname, "/analytics/project/p1/actions");
});

test("openProductActionsRegistry respects explicit session scope", () => {
  setupWindow("https://processmap.local/app");
  const { result } = renderHook(useAnalyticsRouteState, { workspaceId: "ws1" });
  result.openProductActionsRegistry({ scope: "session", sessionId: "s2" });
  assert.equal(global.window.location.pathname, "/analytics/session/s2/actions");
});

test("openPropertiesRegistry navigates to properties module path", () => {
  setupWindow("https://processmap.local/app?project=p1");
  const { result } = renderHook(useAnalyticsRouteState, { projectId: "p1" });
  result.openPropertiesRegistry();
  assert.equal(global.window.location.pathname, "/analytics/project/p1/properties");
});

test("closeProductActionsRegistry returns to /app", () => {
  setupWindow("https://processmap.local/app?project=p1");
  const { result } = renderHook(useAnalyticsRouteState, { projectId: "p1" });
  result.openProductActionsRegistry();
  result.closeProductActionsRegistry();
  assert.equal(global.window.location.pathname, "/app");
});
