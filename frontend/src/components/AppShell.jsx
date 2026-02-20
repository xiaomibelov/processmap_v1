import { useEffect } from "react";
import TopBar from "./TopBar";
import ProcessStage from "./ProcessStage";

export default function AppShell({
  draft,
  locked,
  left,
  leftHidden,
  onToggleLeft,
  onPatchDraft,
  processTabIntent,
  reloadKey,
  backendStatus,
  backendHint,
  projects,
  projectId,
  onProjectChange,
  onDeleteProject,
  sessions,
  sessionId,
  onOpenSession,
  onDeleteSession,
  onRefresh,
  onNewProject,
  onNewBackendSession,
  llmHasApiKey,
  llmBaseUrl,
  llmSaving,
  llmErr,
  llmVerifyState,
  llmVerifyMsg,
  llmVerifyAt,
  llmVerifyBusy,
  onSaveLlmSettings,
  onVerifyLlmSettings,
  selectedBpmnElement,
  onBpmnElementSelect,
  onOpenElementNotes,
  onElementNotesRemap,
  onSessionSync,
  snapshotRestoreNotice,
}) {
  const sid = String(sessionId || draft?.session_id || "").trim();
  const sessionTitle = String(draft?.title || draft?.name || "").trim();
  const hasSession = !!sid;
  const workspaceClass = `workspace ${leftHidden ? "workspace--leftHidden" : ""}`.trim();

  useEffect(() => {
    // eslint-disable-next-line no-console
    console.debug(`[UI] sidebar.render collapsed=${leftHidden ? 1 : 0} class=${workspaceClass}`);
  }, [leftHidden, workspaceClass]);

  return (
    <div className={"appRoot graphite " + (leftHidden ? "leftHidden" : "")}>
      <TopBar
        backendStatus={backendStatus}
        backendHint={backendHint}
        projects={projects}
        projectId={projectId}
        onDeleteProject={onDeleteProject}
        onProjectChange={onProjectChange}
        sessions={sessions}
        sessionId={sessionId}
        onDeleteSession={onDeleteSession}
        onOpenSession={onOpenSession}
        onRefresh={onRefresh}
        onNewProject={onNewProject}
        onNewBackendSession={onNewBackendSession}
        llmHasApiKey={llmHasApiKey}
        llmBaseUrl={llmBaseUrl}
        llmSaving={llmSaving}
        llmErr={llmErr}
        llmVerifyState={llmVerifyState}
        llmVerifyMsg={llmVerifyMsg}
        llmVerifyAt={llmVerifyAt}
        llmVerifyBusy={llmVerifyBusy}
        onSaveLlmSettings={onSaveLlmSettings}
        onVerifyLlmSettings={onVerifyLlmSettings}
        leftHidden={leftHidden}
        onToggleLeft={onToggleLeft}
      />

      <div className={workspaceClass}>
        <div className={leftHidden ? "workspaceLeft workspaceLeft--hidden" : "workspaceLeft flex min-w-0 flex-col gap-3"}>
          {hasSession ? (
            <div className="workspaceLeftProcessTitle rounded-xl2 border border-border bg-panel px-3 py-2">
              <div className="workspaceLeftProcessMain truncate text-sm font-semibold text-fg" title={sessionTitle || "—"}>
                Процесс: {sessionTitle || "—"}
              </div>
              <div className="workspaceLeftSessionAccent mt-1 truncate text-xs text-muted" title={sid}>
                Сессия: {sid}
              </div>
            </div>
          ) : null}
          {left}
        </div>
        <div className="workspaceMain rounded-xl2 border border-border bg-panel">
          <ProcessStage
            sessionId={sessionId}
            locked={locked}
            draft={draft}
            onPatchDraft={onPatchDraft}
            onSessionSync={onSessionSync}
            processTabIntent={processTabIntent}
            reloadKey={reloadKey}
            selectedBpmnElement={selectedBpmnElement}
            onBpmnElementSelect={onBpmnElementSelect}
            onOpenElementNotes={onOpenElementNotes}
            onElementNotesRemap={onElementNotesRemap}
            snapshotRestoreNotice={snapshotRestoreNotice}
          />
        </div>
      </div>

      <div className="footerHint border-t border-border px-4 py-2 text-xs text-muted">
        Навигация: мышь — пан/зум на схеме · ✦ AI — подсветить узкие места на узлах
      </div>
    </div>
  );
}
