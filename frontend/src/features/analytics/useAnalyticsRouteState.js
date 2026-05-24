import { useCallback, useEffect, useRef, useState } from "react";
import {
  buildAnalyticsHubCloseUrl,
  buildAnalyticsHubUrl,
  buildProductActionsRegistryCloseUrl,
  buildProductActionsRegistryUrl,
  readAnalyticsHubRoute,
  readProductActionsRegistryRoute,
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

  const scopeKeyRef = useRef("");

  const syncAnalyticsHubRoute = useCallback(() => {
    setAnalyticsHubRoute(readAnalyticsHubRoute());
  }, []);

  const syncProductActionsRegistryRoute = useCallback(() => {
    setProductActionsRegistryRoute(readProductActionsRegistryRoute());
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
    const scopeKey = `${text(workspaceId)}::${text(projectId)}::${text(sessionId)}`;
    if (scopeKeyRef.current === scopeKey) return;
    scopeKeyRef.current = scopeKey;
    setAnalyticsHubRoute(readAnalyticsHubRoute());
    setProductActionsRegistryRoute(readProductActionsRegistryRoute());
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
  }, [workspaceId, projectId, sessionId, analyticsHubRoute.workspaceId]);

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
