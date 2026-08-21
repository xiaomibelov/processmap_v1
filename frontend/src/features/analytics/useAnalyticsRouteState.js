import { useCallback, useEffect, useRef, useState } from "react";
import {
  ANALYTICS_MODULE_ACTIONS,
  ANALYTICS_MODULE_OVERVIEW,
  ANALYTICS_MODULE_PROPERTIES,
  buildAnalyticsPath,
  buildProcessMapUrl,
  readAnalyticsHubRoute,
  readProductActionsRegistryRoute,
  readPropertiesRegistryRoute,
} from "../../app/processMapRouteModel.js";

function text(value) {
  return String(value || "").trim();
}

function navigateToPath(path) {
  if (typeof window === "undefined" || !path) return;
  window.history.pushState({}, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
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

export function useAnalyticsRouteState({
  sessionId = "",
  projectId = "",
  workspaceId = "",
} = {}) {
  const [analyticsHubRoute, setAnalyticsHubRoute] = useState(() => readAnalyticsHubRoute());
  const [productActionsRegistryRoute, setProductActionsRegistryRoute] = useState(
    () => readProductActionsRegistryRoute(),
  );
  const [propertiesRegistryRoute, setPropertiesRegistryRoute] = useState(
    () => readPropertiesRegistryRoute(),
  );

  const scopeKeyRef = useRef("");

  const syncAnalyticsHubRoute = useCallback(() => {
    setAnalyticsHubRoute(readAnalyticsHubRoute());
  }, []);

  const syncProductActionsRegistryRoute = useCallback(() => {
    setProductActionsRegistryRoute(readProductActionsRegistryRoute());
  }, []);

  const syncPropertiesRegistryRoute = useCallback(() => {
    setPropertiesRegistryRoute(readPropertiesRegistryRoute());
  }, []);

  useEffect(() => {
    window.addEventListener("popstate", syncAnalyticsHubRoute);
    return () => window.removeEventListener("popstate", syncAnalyticsHubRoute);
  }, [syncAnalyticsHubRoute]);

  useEffect(() => {
    window.addEventListener("popstate", syncProductActionsRegistryRoute);
    return () => window.removeEventListener("popstate", syncProductActionsRegistryRoute);
  }, [syncProductActionsRegistryRoute]);

  useEffect(() => {
    window.addEventListener("popstate", syncPropertiesRegistryRoute);
    return () => window.removeEventListener("popstate", syncPropertiesRegistryRoute);
  }, [syncPropertiesRegistryRoute]);

  useEffect(() => {
    const scopeKey = `${text(workspaceId)}::${text(projectId)}::${text(sessionId)}`;
    if (scopeKeyRef.current === scopeKey) return;
    scopeKeyRef.current = scopeKey;
    setAnalyticsHubRoute(readAnalyticsHubRoute());
    setProductActionsRegistryRoute(readProductActionsRegistryRoute());
    setPropertiesRegistryRoute(readPropertiesRegistryRoute());
  }, [sessionId, projectId, workspaceId]);

  const openAnalyticsHub = useCallback((options = {}) => {
    const { scope, scopeId } = resolveScopeId(options, sessionId, projectId, workspaceId);
    if (!scopeId) return;
    navigateToPath(buildAnalyticsPath(scope, scopeId, ANALYTICS_MODULE_OVERVIEW));
    setAnalyticsHubRoute(readAnalyticsHubRoute(window.location));
    setProductActionsRegistryRoute(readProductActionsRegistryRoute(window.location));
    setPropertiesRegistryRoute(readPropertiesRegistryRoute(window.location));
  }, [workspaceId, projectId, sessionId]);

  const closeAnalyticsHub = useCallback(() => {
    const nextUrl = buildProcessMapUrl({
      workspaceId: analyticsHubRoute.workspaceId || workspaceId,
      projectId: analyticsHubRoute.projectId || projectId,
      sessionId: analyticsHubRoute.sessionId || sessionId,
    });
    navigateToPath(nextUrl);
    setAnalyticsHubRoute(readAnalyticsHubRoute(window.location));
    setProductActionsRegistryRoute(readProductActionsRegistryRoute(window.location));
    setPropertiesRegistryRoute(readPropertiesRegistryRoute(window.location));
  }, [workspaceId, projectId, sessionId, analyticsHubRoute.workspaceId, analyticsHubRoute.projectId, analyticsHubRoute.sessionId]);

  const openPropertiesRegistry = useCallback((options = {}) => {
    const { scope, scopeId } = resolveScopeId(options, sessionId, projectId, workspaceId);
    if (!scopeId) return;
    navigateToPath(buildAnalyticsPath(scope, scopeId, ANALYTICS_MODULE_PROPERTIES));
    setPropertiesRegistryRoute(readPropertiesRegistryRoute(window.location));
    setAnalyticsHubRoute(readAnalyticsHubRoute(window.location));
    setProductActionsRegistryRoute(readProductActionsRegistryRoute(window.location));
  }, [workspaceId, projectId, sessionId]);

  const closePropertiesRegistry = useCallback(() => {
    const nextUrl = buildProcessMapUrl({
      workspaceId: propertiesRegistryRoute.workspaceId || workspaceId,
      projectId: propertiesRegistryRoute.projectId || projectId,
      sessionId: propertiesRegistryRoute.sessionId || sessionId,
    });
    navigateToPath(nextUrl);
    setPropertiesRegistryRoute(readPropertiesRegistryRoute(window.location));
    setAnalyticsHubRoute(readAnalyticsHubRoute(window.location));
    setProductActionsRegistryRoute(readProductActionsRegistryRoute(window.location));
  }, [workspaceId, projectId, sessionId, propertiesRegistryRoute.workspaceId, propertiesRegistryRoute.projectId, propertiesRegistryRoute.sessionId]);

  const openProductActionsRegistry = useCallback((options = {}) => {
    const { scope, scopeId } = resolveScopeId(options, sessionId, projectId, workspaceId);
    if (!scopeId) return;
    navigateToPath(buildAnalyticsPath(scope, scopeId, ANALYTICS_MODULE_ACTIONS));
    setProductActionsRegistryRoute(readProductActionsRegistryRoute(window.location));
    setAnalyticsHubRoute(readAnalyticsHubRoute(window.location));
    setPropertiesRegistryRoute(readPropertiesRegistryRoute(window.location));
  }, [workspaceId, projectId, sessionId]);

  const closeProductActionsRegistry = useCallback(() => {
    const url = new URL(window.location.href || "https://processmap.local/app");
    const returnTo = url.searchParams.get("return_to");
    let nextUrl;
    if (returnTo === "analytics") {
      const { scope, scopeId } = resolveScopeId(
        { scope: productActionsRegistryRoute.scope },
        sessionId,
        projectId,
        workspaceId,
      );
      nextUrl = scopeId
        ? buildAnalyticsPath(scope, scopeId, ANALYTICS_MODULE_OVERVIEW)
        : buildProcessMapUrl({ workspaceId, projectId, sessionId });
    } else {
      nextUrl = buildProcessMapUrl({
        workspaceId: productActionsRegistryRoute.workspaceId || workspaceId,
        projectId: productActionsRegistryRoute.projectId || projectId,
        sessionId: productActionsRegistryRoute.sessionId || sessionId,
      });
    }
    navigateToPath(nextUrl);
    setProductActionsRegistryRoute(readProductActionsRegistryRoute(window.location));
    setAnalyticsHubRoute(readAnalyticsHubRoute(window.location));
    setPropertiesRegistryRoute(readPropertiesRegistryRoute(window.location));
  }, [workspaceId, projectId, sessionId, productActionsRegistryRoute.scope, productActionsRegistryRoute.workspaceId, productActionsRegistryRoute.projectId, productActionsRegistryRoute.sessionId]);

  return {
    analyticsHubRoute,
    productActionsRegistryRoute,
    propertiesRegistryRoute,
    setAnalyticsHubRoute,
    setProductActionsRegistryRoute,
    setPropertiesRegistryRoute,
    openAnalyticsHub,
    closeAnalyticsHub,
    openProductActionsRegistry,
    closeProductActionsRegistry,
    openPropertiesRegistry,
    closePropertiesRegistry,
  };
}
