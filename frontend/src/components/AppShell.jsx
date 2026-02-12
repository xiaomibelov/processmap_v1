import TopBar from "./TopBar";
import BottomDock from "./BottomDock";
import ProcessStage from "./ProcessStage";

export default function AppShell({
  sessionId,
  apiOk,
  apiBase,
  sessions,
  onSelectSession,
  onNewLocalSession,
  onNewApiSession,
  left,
  locked,
  draft,
  onPatchDraft,
  bpmnReloadKey,
}) {
  return (
    <div className="app">
      <TopBar
        apiOk={apiOk}
        apiBase={apiBase}
        sessions={sessions}
        sessionId={sessionId}
        onSelectSession={onSelectSession}
        onNewLocalSession={onNewLocalSession}
        onNewApiSession={onNewApiSession}
      />

      <div className="workspace">
        <div className="leftCol">{left}</div>

        <div className="stage">
          <ProcessStage
            sessionId={sessionId}
            locked={locked}
            draft={draft}
            onPatchDraft={onPatchDraft}
            reloadKey={bpmnReloadKey}
          />
        </div>
      </div>

      <BottomDock />
    </div>
  );
}
