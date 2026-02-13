import TopBar from "../../components/TopBar";

export default function TopBarContainer({ ctl }) {
  const sessionId = ctl?.draft?.session_id || "";

  return (
    <TopBar
      backendStatus={ctl.backendStatus}
      backendHint={ctl.backendHint}
      projects={ctl.projects}
      projectId={ctl.projectId}
      onProjectChange={(pid) => ctl.setProjectId?.(pid || "")}
      modeFilter={ctl.modeFilter}
      onModeFilterChange={(v) => ctl.setModeFilter?.(v || "")}
      sessionId={sessionId}
      sessions={ctl.sessions}
      onOpen={(sid) => ctl.openSession?.(sid)}
      onRefresh={() => ctl.refreshAll?.()}
      onNewProject={() => ctl.setWizardOpen?.(true)}
      onNewLocal={() => ctl.createLocalSession?.()}
      onNewBackend={(mode) => ctl.createBackendSession?.(mode)}
    />
  );
}
