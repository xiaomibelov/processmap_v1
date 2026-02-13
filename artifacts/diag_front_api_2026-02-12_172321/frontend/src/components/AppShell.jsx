import TopBar from "./TopBar";
import ProcessStage from "./ProcessStage";

export default function AppShell({
  backendStatus,
  backendHint,
  projects,
  projectId,
  onProjectChange,
  modeFilter,
  onModeFilterChange,
  sessions,
  selectedId,
  onOpen,
  onRefreshSessions,
  onNewProject,
  onNewLocal,
  onNewApiSession,
  draft,
  setDraft,
  bpmnReloadKey,
  setBpmnReloadKey,
  patchDraftToBackend,
}) {
  return (
    <div className="app">
      <TopBar
        backendStatus={backendStatus}
        backendHint={backendHint}
        projects={projects}
        projectId={projectId}
        onProjectChange={onProjectChange}
        modeFilter={modeFilter}
        onModeFilterChange={onModeFilterChange}
        sessions={sessions}
        sessionId={selectedId}
        onOpen={onOpen}
        onRefresh={onRefreshSessions}
        onNewProject={onNewProject}
        onNewLocal={onNewLocal}
        onNewBackend={onNewApiSession}
      />
      <ProcessStage
        selectedId={selectedId}
        draft={draft}
        setDraft={setDraft}
        bpmnReloadKey={bpmnReloadKey}
        setBpmnReloadKey={setBpmnReloadKey}
        patchDraftToBackend={patchDraftToBackend}
      />
    </div>
  );
}
