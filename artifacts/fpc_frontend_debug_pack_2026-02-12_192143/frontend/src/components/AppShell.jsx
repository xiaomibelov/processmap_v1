import TopBar from "./TopBar";
import ProcessStage from "./ProcessStage";
import NotesPanel from "./NotesPanel";
import BottomDock from "./BottomDock";

function isLocalSessionId(id) {
  return typeof id === "string" && (id === "local" || id.startsWith("local_"));
}

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
  patchDraftToBackend,
  onGenerate,
  generating,
  onAddNote,
  errorText,
  currentTitle,
}) {
  const locked = backendStatus === "checking";

  async function onPatchDraft(nextDraft) {
    setDraft(nextDraft);

    if (!selectedId || isLocalSessionId(selectedId)) return;
    if (typeof patchDraftToBackend !== "function") return;

    await patchDraftToBackend(selectedId, nextDraft);
  }

  const addNoteDisabled = locked;
  const canWriteApi = !!selectedId && !isLocalSessionId(selectedId);

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

      <div className="workspace">
        <div className="leftCol">
          <NotesPanel
            draft={draft}
            sessionId={selectedId}
            onGenerate={canWriteApi ? onGenerate : undefined}
            generating={!!generating}
            onAddNote={onAddNote}
            addNoteDisabled={addNoteDisabled}
            errorText={errorText}
            title={currentTitle}
          />
        </div>

        <div className="mainCol">
          <ProcessStage
            sessionId={selectedId}
            locked={locked}
            draft={draft}
            onPatchDraft={onPatchDraft}
            reloadKey={bpmnReloadKey}
          />
          <BottomDock />
        </div>
      </div>
    </div>
  );
}
