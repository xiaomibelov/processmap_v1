import { useEffect } from "react";
import TopBar from "./TopBar";
import ProcessStage from "./ProcessStage";
import SidebarHandle from "./sidebar/SidebarHandle";

export default function AppShell({
  draft,
  locked,
  left,
  leftHidden,
  leftCompact,
  sidebarHandleSections,
  onToggleLeft,
  onPatchDraft,
  processTabIntent,
  aiGenerateIntent,
  onProcessUiStateChange,
  stepTimeUnit,
  reloadKey,
  backendStatus,
  backendHint,
  orgs,
  activeOrgId,
  onOrgChange,
  onOpenOrgSettings,
  projects,
  projectId,
  onProjectChange,
  onDeleteProject,
  canManageProjectEntities,
  sessions,
  sessionId,
  onOpenSession,
  onDeleteSession,
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
  onRecalculateRtiers,
  snapshotRestoreNotice,
  sessionNavNotice,
  onDismissSessionNavNotice,
  onReturnToSessionList,
}) {
  const workspaceClass = `workspace ${leftHidden ? "workspace--leftHidden" : leftCompact ? "workspace--leftCompact" : ""}`.trim();

  useEffect(() => {
    // eslint-disable-next-line no-console
    console.debug(`[UI] sidebar.render collapsed=${leftHidden ? 1 : 0} class=${workspaceClass}`);
  }, [leftHidden, workspaceClass]);

  useEffect(() => {
    function onKeyDown(event) {
      const isHotkey = (event.ctrlKey || event.metaKey) && String(event.key || "") === "\\";
      if (!isHotkey) return;
      event.preventDefault();
      onToggleLeft?.("hotkey");
    }
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [onToggleLeft]);

  return (
    <div className={"appRoot graphite " + (leftHidden ? "leftHidden" : "")}>
      <TopBar
        backendStatus={backendStatus}
        backendHint={backendHint}
        orgs={orgs}
        activeOrgId={activeOrgId}
        onOrgChange={onOrgChange}
        onOpenOrgSettings={onOpenOrgSettings}
        projects={projects}
        projectId={projectId}
        onDeleteProject={onDeleteProject}
        canManageProjectEntities={canManageProjectEntities}
        onProjectChange={onProjectChange}
        sessions={sessions}
        sessionId={sessionId}
        onDeleteSession={onDeleteSession}
        onOpenSession={onOpenSession}
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
      />

      {sessionNavNotice ? (
        <div className="mx-3 mt-2 rounded-lg border border-warning/45 bg-warning/10 px-3 py-2 text-xs text-warning">
          <div className="flex flex-wrap items-center gap-2">
            <strong>Сессия недоступна</strong>
            <span className="text-warning/90">{String(sessionNavNotice?.message || "Не удалось открыть текущую сессию.")}</span>
            {Number(sessionNavNotice?.status || 0) > 0 ? (
              <span className="badge warn">HTTP {Number(sessionNavNotice?.status || 0)}</span>
            ) : null}
            <button type="button" className="secondaryBtn tinyBtn" onClick={() => onReturnToSessionList?.()}>
              Вернуться к списку
            </button>
            <button type="button" className="secondaryBtn tinyBtn" onClick={() => onDismissSessionNavNotice?.()}>
              Скрыть
            </button>
          </div>
        </div>
      ) : null}

      <div className={workspaceClass}>
        <div className={leftHidden ? "workspaceLeft workspaceLeft--rail" : `workspaceLeft ${leftCompact ? "workspaceLeft--compact" : "flex min-w-0 flex-col"}`.trim()}>
          <div className={leftHidden ? "workspaceLeftContent workspaceLeftContent--hidden" : "workspaceLeftContent"}>
            {left}
          </div>
          {leftHidden ? (
            <SidebarHandle
              sections={sidebarHandleSections}
              onClick={(sectionId) => onToggleLeft?.(`global_handle:${String(sectionId || "open")}`)}
            />
          ) : null}
        </div>
        <div className="workspaceMain relative rounded-xl2 border border-border bg-panel">
          <ProcessStage
            sessionId={sessionId}
            activeProjectId={projectId}
            locked={locked}
            draft={draft}
            onPatchDraft={onPatchDraft}
            onSessionSync={onSessionSync}
            onUiStateChange={onProcessUiStateChange}
            processTabIntent={processTabIntent}
            aiGenerateIntent={aiGenerateIntent}
            stepTimeUnit={stepTimeUnit}
            reloadKey={reloadKey}
            selectedBpmnElement={selectedBpmnElement}
            onBpmnElementSelect={onBpmnElementSelect}
            onOpenElementNotes={onOpenElementNotes}
            onElementNotesRemap={onElementNotesRemap}
            snapshotRestoreNotice={snapshotRestoreNotice}
            onRecalculateRtiers={onRecalculateRtiers}
          />
        </div>
      </div>

      <div className="footerHint border-t border-border px-4 py-2 text-xs text-muted">
        Навигация: мышь — пан/зум на схеме · ✦ AI — подсветить узкие места на узлах
      </div>
    </div>
  );
}
