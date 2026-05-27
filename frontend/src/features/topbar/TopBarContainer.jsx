import { useCallback, useEffect, useState } from "react";
import TopBar from "../../components/TopBar";

function isAnalyticsSurface() {
  if (typeof window === "undefined") return false;
  const surface = new URL(window.location.href).searchParams.get("surface");
  return ["analytics", "product-actions-registry", "process-properties-registry", "dashboards"].includes(surface);
}

export default function TopBarContainer({ ctl }) {
  const sessionId = ctl?.draft?.session_id || "";
  const [isAnalyticsActive, setIsAnalyticsActive] = useState(() => isAnalyticsSurface());

  useEffect(() => {
    const handle = () => setIsAnalyticsActive(isAnalyticsSurface());
    window.addEventListener("popstate", handle);
    return () => window.removeEventListener("popstate", handle);
  }, []);

  const onOpenAnalyticsHub = useCallback(() => {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    url.searchParams.set("surface", "analytics");
    url.searchParams.delete("registry_scope");
    window.history.pushState({ ...(window.history.state || {}), surface: "analytics" }, "", url.toString());
    window.dispatchEvent(new PopStateEvent("popstate", { state: window.history.state }));
    setIsAnalyticsActive(true);
  }, []);

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
      onOpenAnalyticsHub={onOpenAnalyticsHub}
      isAnalyticsActive={isAnalyticsActive}
    />
  );
}
