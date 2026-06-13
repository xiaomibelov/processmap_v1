import { useCallback, useEffect, useState } from "react";
import TopBar from "../../components/TopBar";
import { useAnalyticsRouteState } from "../analytics/useAnalyticsRouteState.js";

// Feature flag: toggle to false to restore the legacy manual navigation.
const USE_ANALYTICS_ROUTE_STATE_NAV = true;

function isAnalyticsSurface() {
  if (typeof window === "undefined") return false;
  const surface = new URL(window.location.href).searchParams.get("surface");
  return ["analytics", "product-actions-registry", "process-properties-registry", "dashboards"].includes(surface);
}

function useLegacyAnalyticsNavigation(enabled) {
  const [isAnalyticsActive, setIsAnalyticsActive] = useState(() => (enabled ? isAnalyticsSurface() : false));

  useEffect(() => {
    if (!enabled) return undefined;
    const handle = () => setIsAnalyticsActive(isAnalyticsSurface());
    window.addEventListener("popstate", handle);
    return () => window.removeEventListener("popstate", handle);
  }, [enabled]);

  const openAnalyticsHub = useCallback(() => {
    if (!enabled || typeof window === "undefined") return;
    const url = new URL(window.location.href);
    url.searchParams.set("surface", "analytics");
    url.searchParams.delete("registry_scope");
    window.history.pushState({ ...(window.history.state || {}), surface: "analytics" }, "", url.toString());
    window.dispatchEvent(new PopStateEvent("popstate", { state: window.history.state }));
    setIsAnalyticsActive(true);
  }, [enabled]);

  return { isAnalyticsActive, openAnalyticsHub };
}

export default function TopBarContainer({ ctl }) {
  const sessionId = ctl?.draft?.session_id || "";
  const projectId = ctl?.projectId || "";
  const workspaceId = ctl?.draft?.workspace_id || ctl?.draft?.workspaceId || "";

  const {
    analyticsHubRoute,
    productActionsRegistryRoute,
    propertiesRegistryRoute,
    dashboardsRoute,
    openAnalyticsHub: openAnalyticsHubFromHook,
  } = useAnalyticsRouteState({ sessionId, projectId, workspaceId });

  const legacy = useLegacyAnalyticsNavigation(!USE_ANALYTICS_ROUTE_STATE_NAV);

  const isAnalyticsActive = USE_ANALYTICS_ROUTE_STATE_NAV
    ? analyticsHubRoute.active || productActionsRegistryRoute.active || propertiesRegistryRoute.active || dashboardsRoute.active
    : legacy.isAnalyticsActive;

  const openAnalyticsHub = useCallback(() => {
    if (USE_ANALYTICS_ROUTE_STATE_NAV) {
      openAnalyticsHubFromHook();
      // Keep popstate-based listeners (leave guard, context menus, etc.) in sync.
      if (typeof window !== "undefined") {
        window.dispatchEvent(new PopStateEvent("popstate", { state: window.history.state }));
      }
    } else {
      legacy.openAnalyticsHub();
    }
  }, [openAnalyticsHubFromHook, legacy]);

  return (
    <TopBar
      backendStatus={ctl.backendStatus}
      backendHint={ctl.backendHint}
      projects={ctl.projects}
      projectId={ctl.projectId}
      onProjectChange={(pid) => ctl.setProjectId?.(pid || "")}
      sessionId={sessionId}
      sessions={ctl.sessions}
      onOpen={(sid) => ctl.openSession?.(sid)}
      onRefresh={() => ctl.refreshAll?.()}
      onNewProject={() => ctl.setWizardOpen?.(true)}
      onNewLocal={() => ctl.createLocalSession?.()}
      onNewBackend={() => ctl.createBackendSession?.()}
      onOpenAnalyticsHub={openAnalyticsHub}
      isAnalyticsActive={isAnalyticsActive}
    />
  );
}
