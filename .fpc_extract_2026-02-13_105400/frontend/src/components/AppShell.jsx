import TopBar from "./TopBar";
import ProcessStage from "./ProcessStage";

export default function AppShell({
  sessionId,
  roles,
  mode,
  left,
  locked,
  notes,
  onAddNote,
  onNewLocalSession,
  sessions,
  backendStatus,
  onRefreshSessions,
  onNewBackendSession,
  onOpenSession,
}) {
  return (
    <div className="shell">
      <TopBar
        sessionId={sessionId}
        sessions={sessions}
        backendStatus={backendStatus}
        onRefreshSessions={onRefreshSessions}
        onNewBackendSession={onNewBackendSession}
        onOpenSession={onOpenSession}
      />

      <div className="workspace">
        {left}
        <ProcessStage mode={mode} sessionId={sessionId} roles={roles} onAddNote={onAddNote} />
      </div>
    </div>
  );
}
