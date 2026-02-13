import TopBar from "./TopBar";
import ProcessStage from "./ProcessStage";

export default function AppShell({
  draft,
  locked,
  left,
  leftHidden,
  onToggleLeft,
  onPatchDraft,
  reloadKey,
  backendStatus,
  backendHint,
  projects,
  projectId,
  onProjectChange,
  onDeleteProject,
  modeFilter,
  onModeFilterChange,
  sessions,
  sessionId,
  onOpenSession,
  onDeleteSession,
  onRefresh,
  onNewProject,
  onNewLocalSession,
  onNewBackendSession,
}) {
  return (
    <div className={"appRoot graphite " + (leftHidden ? "leftHidden" : "")}>
      <TopBar
        backendStatus={backendStatus}
        backendHint={backendHint}
        projects={projects}
        projectId={projectId}
        onDeleteProject={onDeleteProject}
        onProjectChange={onProjectChange}
        modeFilter={modeFilter}
        onModeFilterChange={onModeFilterChange}
        sessions={sessions}
        sessionId={sessionId}
        onDeleteSession={onDeleteSession}
        onOpenSession={onOpenSession}
        onRefresh={onRefresh}
        onNewProject={onNewProject}
        onNewLocalSession={onNewLocalSession}
        onNewBackendSession={onNewBackendSession}
        leftHidden={leftHidden}
        onToggleLeft={onToggleLeft}
      />

      <div className="workspace">
        <div className="workspaceLeft">{left}</div>
        <div className="workspaceMain">
          <ProcessStage
            sessionId={sessionId}
            locked={locked}
            draft={draft}
            onPatchDraft={onPatchDraft}
            reloadKey={reloadKey}
          />
        </div>
      </div>

      <div className="footerHint">
        Навигация: мышь — пан/зум на схеме · ✦ AI — включить вопросы на узлах
      </div>
    </div>
  );
}
