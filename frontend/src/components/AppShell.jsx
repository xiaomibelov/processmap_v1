import { useEffect, useState } from "react";
import TopBar from "./TopBar";
import ProcessStage from "./ProcessStage";
import SidebarHandle from "./sidebar/SidebarHandle";
import { resolveSessionNavNoticeCopy } from "../features/process/navigation/sessionNavNoticeUi";
import { appVersionInfo } from "../config/appVersion.js";

function isUpdatesHash() {
  if (typeof window === "undefined") return false;
  return String(window.location.hash || "").trim().toLowerCase() === "#updates";
}

function normalizeChangelogLink(raw) {
  const link = raw && typeof raw === "object" ? raw : {};
  const href = String(link.href || link.url || "").trim();
  if (!href) return null;
  return {
    href,
    label: String(link.label || "Подробнее").trim() || "Подробнее",
  };
}

function AppUpdatesPage({ onClose }) {
  const entries = Array.isArray(appVersionInfo.changelog) ? appVersionInfo.changelog : [];
  return (
    <div className="flex h-full min-h-[520px] flex-col bg-panel" data-testid="app-updates-page">
      <div className="border-b border-border px-5 py-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-xs font-semibold uppercase text-muted">Версия приложения</div>
            <h1 className="mt-1 text-xl font-black text-fg">Обновления ProcessMap</h1>
            <p className="mt-1 max-w-3xl text-sm text-muted">
              Краткая история изменений интерфейса и рабочих сценариев. У записи может быть ссылка на задачу, PR или документ с подробностями.
            </p>
          </div>
          <button type="button" className="secondaryBtn smallBtn" onClick={onClose} data-testid="app-updates-close">
            Закрыть
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto px-5 py-4">
        <div className="mx-auto flex max-w-4xl flex-col gap-3">
          {entries.map((entry) => {
            const version = String(entry?.version || "").trim();
            const changes = Array.isArray(entry?.changes) ? entry.changes : [];
            const link = normalizeChangelogLink(entry?.link);
            return (
              <section key={version || changes.join("|")} className="rounded-lg border border-border bg-bg/45 px-4 py-3" data-testid="app-updates-entry">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 className="text-sm font-black text-fg">{version || "Версия"}</h2>
                  {link ? (
                    <a
                      className="text-xs font-semibold text-info underline underline-offset-4 hover:text-info/80"
                      href={link.href}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {link.label}
                    </a>
                  ) : null}
                </div>
                <ul className="mt-2 flex flex-col gap-1 text-sm text-muted">
                  {changes.length > 0 ? changes.map((change) => (
                    <li key={String(change)}>{String(change)}</li>
                  )) : (
                    <li>Описание обновления будет добавлено позже.</li>
                  )}
                </ul>
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default function AppShell({
  draft,
  shellSessionId = "",
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
  onOpenDiscussionNotifications,
  onOpenNotesDiscussions,
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
  onSnapshotRestoreNoticeConsumed,
  selectedPropertiesOverlayPreview,
  propertiesOverlayAlwaysEnabled = false,
  propertiesOverlayAlwaysPreviewByElementId = null,
  drawioCompanionFocusIntent = null,
  discussionLinkedElementFocusIntent = null,
  onDiscussionLinkedElementFocusResult = null,
  sessionNavNotice,
  onDismissSessionNavNotice,
  onReturnToSessionList,
  mentionNotifications,
  onOpenMentionNotification,
  onRefreshMentionNotifications,
}) {
  const hasActiveSession = String(shellSessionId || sessionId || "").trim().length > 0;
  const effectiveLeftHidden = hasActiveSession ? !!leftHidden : true;
  const workspaceClass = `workspace ${effectiveLeftHidden ? "workspace--leftHidden" : leftCompact ? "workspace--leftCompact" : ""}`.trim();
  const workspaceBackHandler = hasActiveSession
    ? (() => onReturnToSessionList?.())
    : (() => onProjectChange?.(""));
  const sessionNavNoticeCopy = resolveSessionNavNoticeCopy(sessionNavNotice);
  const latestChangeEntry = Array.isArray(appVersionInfo.changelog) ? appVersionInfo.changelog[0] : null;
  const latestChangeSummary = Array.isArray(latestChangeEntry?.changes)
    ? String(latestChangeEntry.changes[0] || "").trim()
    : "";
  const [updatesOpen, setUpdatesOpen] = useState(() => isUpdatesHash());

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

  useEffect(() => {
    function syncUpdatesPageFromHash() {
      setUpdatesOpen(isUpdatesHash());
    }
    syncUpdatesPageFromHash();
    window.addEventListener("hashchange", syncUpdatesPageFromHash);
    return () => window.removeEventListener("hashchange", syncUpdatesPageFromHash);
  }, []);

  function closeUpdatesPage() {
    if (typeof window !== "undefined" && isUpdatesHash()) {
      window.history.pushState("", document.title, `${window.location.pathname || "/"}${window.location.search || ""}`);
    }
    setUpdatesOpen(false);
  }

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
        sessionId={String(shellSessionId || sessionId || "").trim()}
        sessionStatus={sessionStatus}
        onDeleteSession={onDeleteSession}
        onChangeSessionStatus={onChangeSessionStatus}
        onOpenSession={onOpenSession}
        onOpenWorkspace={workspaceBackHandler}
        onOpenDiscussionNotifications={onOpenDiscussionNotifications}
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
        mentionNotifications={mentionNotifications}
        onOpenMentionNotification={onOpenMentionNotification}
        onRefreshMentionNotifications={onRefreshMentionNotifications}
      />

      {sessionNavNotice ? (
        <div className="mx-3 mt-2 rounded-lg border border-warning/45 bg-warning/10 px-3 py-2 text-xs text-warning">
          <div className="flex flex-wrap items-center gap-2">
            <strong>{sessionNavNoticeCopy.title}</strong>
            <span className="text-warning/90">{String(sessionNavNotice?.message || sessionNavNoticeCopy.fallbackMessage)}</span>
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
          {updatesOpen ? (
            <AppUpdatesPage onClose={closeUpdatesPage} />
          ) : (
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
              onSnapshotRestoreNoticeConsumed={onSnapshotRestoreNoticeConsumed}
              onRecalculateRtiers={onRecalculateRtiers}
              selectedPropertiesOverlayPreview={selectedPropertiesOverlayPreview}
              propertiesOverlayAlwaysEnabled={propertiesOverlayAlwaysEnabled}
              propertiesOverlayAlwaysPreviewByElementId={propertiesOverlayAlwaysPreviewByElementId}
              drawioCompanionFocusIntent={drawioCompanionFocusIntent}
              discussionLinkedElementFocusIntent={discussionLinkedElementFocusIntent}
              onDiscussionLinkedElementFocusResult={onDiscussionLinkedElementFocusResult}
              onOpenNotesDiscussions={onOpenNotesDiscussions}
            />
          )}
        </div>
      </div>

      <div className="footerHint border-t border-border px-4 py-2 text-xs text-muted" data-testid="app-version-footer">
        <a className="font-semibold text-info underline underline-offset-4 hover:text-info/80" href="#updates" data-testid="app-version-link">
          Версия {appVersionInfo.currentVersion}
        </a>
        {latestChangeSummary ? <span> · {latestChangeSummary}</span> : null}
      </div>
    </div>
  );
}
