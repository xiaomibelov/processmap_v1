import { useCallback, useEffect, useRef, useState } from "react";
import {
  buildAnalyticsHubCloseUrl,
  buildAnalyticsHubUrl,
  buildDashboardsCloseUrl,
  buildDashboardsUrl,
  buildProductActionsRegistryCloseUrl,
  buildProductActionsRegistryUrl,
  buildPropertiesRegistryCloseUrl,
  buildPropertiesRegistryUrl,
  readAnalyticsHubRoute,
  readDashboardsRoute,
  readProductActionsRegistryRoute,
  readPropertiesRegistryRoute,
} from "../../app/processMapRouteModel.js";

function text(value) {
  return String(value || "").trim();
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
  const [dashboardsRoute, setDashboardsRoute] = useState(() => readDashboardsRoute());

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

  const syncDashboardsRoute = useCallback(() => {
    setDashboardsRoute(readDashboardsRoute());
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
    window.addEventListener("popstate", syncDashboardsRoute);
    return () => window.removeEventListener("popstate", syncDashboardsRoute);
  }, [syncDashboardsRoute]);

  useEffect(() => {
    const scopeKey = `${text(workspaceId)}::${text(projectId)}::${text(sessionId)}`;
    if (scopeKeyRef.current === scopeKey) return;
    scopeKeyRef.current = scopeKey;
    setAnalyticsHubRoute(readAnalyticsHubRoute());
    setProductActionsRegistryRoute(readProductActionsRegistryRoute());
    setPropertiesRegistryRoute(readPropertiesRegistryRoute());
    setDashboardsRoute(readDashboardsRoute());
  }, [sessionId, projectId, workspaceId]);

  const openAnalyticsHub = useCallback((options = {}) => {
    if (typeof window === "undefined") return;
    const nextUrl = buildAnalyticsHubUrl({
      workspaceId: options?.workspaceId || workspaceId || analyticsHubRoute.workspaceId,
      projectId: options?.projectId ?? projectId,
      sessionId: options?.sessionId ?? sessionId,
    }, {
      pathname: window.location.pathname || "/app",
      baseSearch: window.location.search || "",
      hash: window.location.hash || "",
    });
    window.history.pushState({ ...(window.history.state || {}), surface: "analytics" }, "", nextUrl);
    setAnalyticsHubRoute(readAnalyticsHubRoute(window.location));
    setProductActionsRegistryRoute(readProductActionsRegistryRoute(window.location));
    setPropertiesRegistryRoute(readPropertiesRegistryRoute(window.location));
    setDashboardsRoute(readDashboardsRoute(window.location));
  }, [workspaceId, projectId, sessionId, analyticsHubRoute.workspaceId]);

  const closeAnalyticsHub = useCallback(() => {
    if (typeof window === "undefined") return;
    const nextUrl = buildAnalyticsHubCloseUrl({
      workspaceId: analyticsHubRoute.workspaceId || workspaceId,
      projectId: projectId,
      sessionId: sessionId,
    }, {
      pathname: window.location.pathname || "/app",
      baseSearch: window.location.search || "",
      hash: window.location.hash || "",
    });
    window.history.pushState({ ...(window.history.state || {}) }, "", nextUrl);
    setAnalyticsHubRoute(readAnalyticsHubRoute(window.location));
    setProductActionsRegistryRoute(readProductActionsRegistryRoute(window.location));
    setPropertiesRegistryRoute(readPropertiesRegistryRoute(window.location));
    setDashboardsRoute(readDashboardsRoute(window.location));
  }, [workspaceId, projectId, sessionId, analyticsHubRoute.workspaceId]);

  const openPropertiesRegistry = useCallback((options = {}) => {
    if (typeof window === "undefined") return;
    const nextUrl = buildPropertiesRegistryUrl({
      workspaceId: options?.workspaceId || workspaceId || propertiesRegistryRoute.workspaceId,
      projectId: options?.projectId ?? projectId,
      sessionId: options?.sessionId ?? sessionId,
    }, {
      pathname: window.location.pathname || "/app",
      baseSearch: window.location.search || "",
      hash: window.location.hash || "",
    });
    window.history.pushState({ ...(window.history.state || {}), surface: "process-properties-registry" }, "", nextUrl);
    setPropertiesRegistryRoute(readPropertiesRegistryRoute(window.location));
    setAnalyticsHubRoute(readAnalyticsHubRoute(window.location));
    setProductActionsRegistryRoute(readProductActionsRegistryRoute(window.location));
    setDashboardsRoute(readDashboardsRoute(window.location));
  }, [workspaceId, projectId, sessionId, propertiesRegistryRoute.workspaceId]);

  const closePropertiesRegistry = useCallback(() => {
    if (typeof window === "undefined") return;
    const nextUrl = buildPropertiesRegistryCloseUrl({
      workspaceId: propertiesRegistryRoute.workspaceId || workspaceId,
      projectId: projectId,
      sessionId: sessionId,
    }, {
      pathname: window.location.pathname || "/app",
      baseSearch: window.location.search || "",
      hash: window.location.hash || "",
    });
    window.history.pushState({ ...(window.history.state || {}) }, "", nextUrl);
    setPropertiesRegistryRoute(readPropertiesRegistryRoute(window.location));
    setAnalyticsHubRoute(readAnalyticsHubRoute(window.location));
    setProductActionsRegistryRoute(readProductActionsRegistryRoute(window.location));
    setDashboardsRoute(readDashboardsRoute(window.location));
  }, [workspaceId, projectId, sessionId, propertiesRegistryRoute.workspaceId]);

  const openDashboards = useCallback((options = {}) => {
    if (typeof window === "undefined") return;
    const nextUrl = buildDashboardsUrl({
      workspaceId: options?.workspaceId || workspaceId || dashboardsRoute.workspaceId,
      projectId: options?.projectId ?? projectId,
      sessionId: options?.sessionId ?? sessionId,
    }, {
      pathname: window.location.pathname || "/app",
      baseSearch: window.location.search || "",
      hash: window.location.hash || "",
    });
    window.history.pushState({ ...(window.history.state || {}), surface: "dashboards" }, "", nextUrl);
    setDashboardsRoute(readDashboardsRoute(window.location));
    setAnalyticsHubRoute(readAnalyticsHubRoute(window.location));
    setProductActionsRegistryRoute(readProductActionsRegistryRoute(window.location));
    setPropertiesRegistryRoute(readPropertiesRegistryRoute(window.location));
  }, [workspaceId, projectId, sessionId, dashboardsRoute.workspaceId]);

  const closeDashboards = useCallback(() => {
    if (typeof window === "undefined") return;
    const nextUrl = buildDashboardsCloseUrl({
      workspaceId: dashboardsRoute.workspaceId || workspaceId,
      projectId: projectId,
      sessionId: sessionId,
    }, {
      pathname: window.location.pathname || "/app",
      baseSearch: window.location.search || "",
      hash: window.location.hash || "",
    });
    window.history.pushState({ ...(window.history.state || {}) }, "", nextUrl);
    setDashboardsRoute(readDashboardsRoute(window.location));
    setAnalyticsHubRoute(readAnalyticsHubRoute(window.location));
    setProductActionsRegistryRoute(readProductActionsRegistryRoute(window.location));
    setPropertiesRegistryRoute(readPropertiesRegistryRoute(window.location));
  }, [workspaceId, projectId, sessionId, dashboardsRoute.workspaceId]);

  const openProductActionsRegistry = useCallback((options = {}) => {
    if (typeof window === "undefined") return;
    const scope = text(options?.scope) || (sessionId ? "session" : projectId ? "project" : "workspace");
    const currentUrl = new URL(window.location.href);
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
      pathname: window.location.pathname || "/app",
      baseSearch: currentUrl.searchParams.toString(),
      hash: window.location.hash || "",
    });
    window.history.pushState({ ...(window.history.state || {}), surface: "product-actions-registry" }, "", nextUrl);
    setProductActionsRegistryRoute(readProductActionsRegistryRoute(window.location));
    setAnalyticsHubRoute(readAnalyticsHubRoute(window.location));
    setPropertiesRegistryRoute(readPropertiesRegistryRoute(window.location));
    setDashboardsRoute(readDashboardsRoute(window.location));
  }, [workspaceId, projectId, sessionId, analyticsHubRoute.active, productActionsRegistryRoute.workspaceId]);

  const closeProductActionsRegistry = useCallback(() => {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    const returnTo = url.searchParams.get("return_to");
    let nextUrl;
    if (returnTo === "analytics") {
      url.searchParams.delete("return_to");
      nextUrl = buildAnalyticsHubUrl({
        workspaceId: productActionsRegistryRoute.workspaceId || workspaceId,
        projectId: projectId,
        sessionId: sessionId,
      }, {
        pathname: window.location.pathname || "/app",
        baseSearch: url.searchParams.toString(),
        hash: window.location.hash || "",
      });
    } else {
      nextUrl = buildProductActionsRegistryCloseUrl({
        workspaceId: productActionsRegistryRoute.workspaceId || workspaceId,
        projectId: projectId,
        sessionId: sessionId,
      }, {
        pathname: window.location.pathname || "/app",
        baseSearch: window.location.search || "",
        hash: window.location.hash || "",
      });
    }
    window.history.pushState({ ...(window.history.state || {}) }, "", nextUrl);
    setProductActionsRegistryRoute(readProductActionsRegistryRoute(window.location));
    setAnalyticsHubRoute(readAnalyticsHubRoute(window.location));
    setPropertiesRegistryRoute(readPropertiesRegistryRoute(window.location));
    setDashboardsRoute(readDashboardsRoute(window.location));
  }, [workspaceId, projectId, sessionId, productActionsRegistryRoute.workspaceId]);

  return {
    analyticsHubRoute,
    productActionsRegistryRoute,
    propertiesRegistryRoute,
    dashboardsRoute,
    setAnalyticsHubRoute,
    setProductActionsRegistryRoute,
    setPropertiesRegistryRoute,
    setDashboardsRoute,
    openAnalyticsHub,
    closeAnalyticsHub,
    openProductActionsRegistry,
    closeProductActionsRegistry,
    openPropertiesRegistry,
    closePropertiesRegistry,
    openDashboards,
    closeDashboards,
  };
}
