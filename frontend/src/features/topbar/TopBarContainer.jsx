import { useCallback, useEffect, useState } from "react";
import TopBar from "../../components/TopBar";
import { buildAnalyticsPath, ANALYTICS_MODULE_OVERVIEW } from "../../app/processMapRouteModel.js";

function isAnalyticsPath() {
  if (typeof window === "undefined") return false;
  return String(window.location.pathname || "").startsWith("/analytics");
}

function resolveAnalyticsScope(sessionId, projectId, workspaceId) {
  if (sessionId) return { scope: "session", scopeId: sessionId };
  if (projectId) return { scope: "project", scopeId: projectId };
  if (workspaceId) return { scope: "workspace", scopeId: workspaceId };
  return null;
}

export default function TopBarContainer({ ctl }) {
  const sessionId = ctl?.draft?.session_id || "";
  const projectId = ctl?.projectId || "";
  const workspaceId = ctl?.workspaceId || "";
  const [isAnalyticsActive, setIsAnalyticsActive] = useState(() => isAnalyticsPath());

  useEffect(() => {
    const handle = () => setIsAnalyticsActive(isAnalyticsPath());
    window.addEventListener("popstate", handle);
    return () => window.removeEventListener("popstate", handle);
  }, []);

  const onOpenAnalyticsHub = useCallback(() => {
    if (typeof window === "undefined") return;
    const target = resolveAnalyticsScope(sessionId, projectId, workspaceId);
    const next = target
      ? buildAnalyticsPath(target.scope, target.scopeId, ANALYTICS_MODULE_OVERVIEW)
      : "/analytics";
    window.history.pushState({}, "", next);
    window.dispatchEvent(new PopStateEvent("popstate"));
    setIsAnalyticsActive(true);
  }, [sessionId, projectId, workspaceId]);

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
