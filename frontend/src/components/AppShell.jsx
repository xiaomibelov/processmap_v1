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
  canInviteWorkspaceUsers,
  canManageSharedTemplates,
  onOrgChange,
  onOpenOrgSettings,
  projects,
  projectId,
  projectWorkspaceId,
  onProjectChange,
  onDeleteProject,
  canManageProjectEntities,
  sessions,
  sessionId,
  sessionStatus,
  onOpenSession,
  onOpenWorkspaceSession,
  onDeleteSession,
  onChangeSessionStatus,
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
  const hasActiveSession = String(sessionId || "").trim().length > 0;
  const effectiveLeftHidden = hasActiveSession ? !!leftHidden : true;
  const workspaceClass = `workspace ${effectiveLeftHidden ? "workspace--leftHidden" : leftCompact ? "workspace--leftCompact" : ""}`.trim();
  const workspaceBackHandler = hasActiveSession
    ? (() => onReturnToSessionList?.())
    : (() => onProjectChange?.(""));

  useEffect(() => {
    // eslint-disable-next-line no-console
    console.debug(`[UI] sidebar.render collapsed=${effectiveLeftHidden ? 1 : 0} class=${workspaceClass}`);
  }, [effectiveLeftHidden, workspaceClass]);

  useEffect(() => {
    function onKeyDown(event) {
      const isHotkey = (event.ctrlKey || event.metaKey) && String(event.key || "") === "\\";
      if (!isHotkey) return;
      if (!hasActiveSession) return;
      event.preventDefault();
      onToggleLeft?.("hotkey");
    }
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [hasActiveSession, onToggleLeft]);

  return (
    <div className={"appRoot graphite " + (hasActiveSession && effectiveLeftHidden ? "leftHidden" : "")}>
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
        sessionStatus={sessionStatus}
        onDeleteSession={onDeleteSession}
        onChangeSessionStatus={onChangeSessionStatus}
        onOpenSession={onOpenSession}
        onOpenWorkspace={workspaceBackHandler}
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
        draft={draft}
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
        <div className={effectiveLeftHidden ? "workspaceLeft workspaceLeft--rail" : `workspaceLeft ${leftCompact ? "workspaceLeft--compact" : "flex min-w-0 flex-col"}`.trim()}>
          <div className={effectiveLeftHidden ? "workspaceLeftContent workspaceLeftContent--hidden" : "workspaceLeftContent"}>
            {left}
          </div>
          {effectiveLeftHidden ? (
            <SidebarHandle
              sections={sidebarHandleSections}
              disabled={!hasActiveSession}
              onClick={(sectionId) => onToggleLeft?.(`global_handle:${String(sectionId || "open")}`)}
            />
          ) : null}
        </div>
        <div className="workspaceMain relative rounded-xl2 border border-border bg-panel">
          <ProcessStage
            sessionId={sessionId}
            activeProjectId={projectId}
            activeProjectWorkspaceId={projectWorkspaceId}
            workspaceActiveOrgId={activeOrgId}
            canInviteWorkspaceUsers={!!canInviteWorkspaceUsers}
            canManageSharedTemplates={!!canManageSharedTemplates}
            locked={locked}
            draft={draft}
            onPatchDraft={onPatchDraft}
            onSessionSync={onSessionSync}
            onOpenWorkspaceSession={onOpenWorkspaceSession}
            onClearWorkspaceProject={() => onProjectChange?.("")}
            onCreateWorkspaceProject={onNewProject}
            onCreateWorkspaceSession={onNewBackendSession}
            onOpenWorkspaceOrgSettings={onOpenOrgSettings}
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
