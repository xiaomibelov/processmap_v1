import { useCallback, useEffect, useState } from "react";
import TopBar from "./TopBar";
import ProcessStage from "./ProcessStage";
import {
  ANALYTICS_MODULE_OVERVIEW,
  buildAnalyticsPath,
} from "../app/processMapRouteModel.js";
import SidebarHandle from "./sidebar/SidebarHandle";
import { resolveSessionNavNoticeCopy } from "../features/process/navigation/sessionNavNoticeUi";
import { appVersionInfo } from "../config/appVersion.js";
import AppUpdateBanner from "../features/appUpdate/AppUpdateBanner.jsx";
import BuildBadge from "./BuildBadge.jsx";
import useAppUpdateAvailable from "../features/appUpdate/useAppUpdateAvailable.js";
import useSidebarWidth from "./sidebar/useSidebarWidth.js";

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
  orgs,
  activeOrgId,
  canInviteWorkspaceUsers,
  canManageSharedTemplates,
  onOrgChange,
  onOpenOrgSettings,
  projects,
  projectId,
  projectWorkspaceId,
  projectRouteContext,
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
  isChangingSessionStatus = false,
  onNewProject,
  onNewBackendSession,
  selectedBpmnElement,
  onBpmnElementSelect,
  onBpmnModelerExtensionChange = null,
  onOpenElementNotes,
  onElementNotesRemap,
  onSessionSync,
  onRecalculateRtiers,
  snapshotRestoreNotice,
  onSnapshotRestoreNoticeConsumed,
  selectedPropertiesOverlayPreview,
  propertiesOverlayAlwaysEnabled = false,
  propertiesOverlayAlwaysPreviewByElementId = null,
  overlayHiddenFields = null,
  v2OverlaysEnabled = false,
  v2OverlaysExpanded = false,
  onShowV2OverlaysExpandedChange,
  toBeLayerEnabled = false,
  toBeDocuments = [],
  onTobeDocumentClick = null,
  onTobeDocumentChange = null,
  tobeGhostDocument = null,
  onTobeGhostFix = null,
  onTobeGhostCancel = null,
  drawioCompanionFocusIntent = null,
  discussionLinkedElementFocusIntent = null,
  onDiscussionLinkedElementFocusResult = null,
  sessionNavNotice,
  onDismissSessionNavNotice,
  onReturnToSessionList,
  onNavigateToSubprocess,
  childSessionDiscussionAggregates,
  mentionNotifications,
  noteNotifications,
  noteNotificationsAvailable = false,
  onOpenMentionNotification,
  onRefreshMentionNotifications,
  subprocessBreadcrumbs = [],
  onBreadcrumbNavigate = null,
  onReturnToParent = null,
  bpmnStageRef = null,
  bpmnXmlCacheRef = null,
  focusElementId = "",
  onFocusElementApplied = null,
  restoreViewportSnapshot = null,
  onRestoreViewportSnapshotApplied = null,
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
  const [isAnalyticsActive, setIsAnalyticsActive] = useState(() => {
    if (typeof window === "undefined") return false;
    return String(window.location.pathname || "").startsWith("/analytics");
  });
  const appUpdate = useAppUpdateAvailable();
  const { width: sidebarWidth, startDragging } = useSidebarWidth();
  const showResizeHandle = !effectiveLeftHidden && !leftCompact;

  useEffect(() => {
    function handle() {
      setIsAnalyticsActive(
        typeof window !== "undefined" && String(window.location.pathname || "").startsWith("/analytics"),
      );
    }
    window.addEventListener("popstate", handle);
    return () => window.removeEventListener("popstate", handle);
  }, []);

  const onOpenAnalyticsHub = useCallback(() => {
    if (typeof window === "undefined") return;
    const sid = String(shellSessionId || sessionId || "").trim();
    const pid = String(projectId || "").trim();
    const wid = String(projectWorkspaceId || "").trim();
    let path = "/analytics";
    if (sid) {
      path = buildAnalyticsPath("session", sid, ANALYTICS_MODULE_OVERVIEW);
    } else if (pid) {
      path = buildAnalyticsPath("project", pid, ANALYTICS_MODULE_OVERVIEW);
    } else if (wid) {
      path = buildAnalyticsPath("workspace", wid, ANALYTICS_MODULE_OVERVIEW);
    }
    window.history.pushState({}, "", path);
    window.dispatchEvent(new PopStateEvent("popstate"));
  }, [shellSessionId, sessionId, projectId, projectWorkspaceId]);

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
      <div className="appTopStack">
        <TopBar
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
          isChangingSessionStatus={isChangingSessionStatus}
          onOpenSession={onOpenSession}
          onOpenWorkspace={workspaceBackHandler}
          onOpenDiscussionNotifications={onOpenDiscussionNotifications}
          onNewProject={onNewProject}
          onNewBackendSession={onNewBackendSession}
          onOpenAnalyticsHub={onOpenAnalyticsHub}
          isAnalyticsActive={isAnalyticsActive}
          draft={draft}
          mentionNotifications={mentionNotifications}
          noteNotifications={noteNotifications}
          noteNotificationsAvailable={noteNotificationsAvailable}
          onOpenMentionNotification={onOpenMentionNotification}
          onRefreshMentionNotifications={onRefreshMentionNotifications}
        />

        <AppUpdateBanner
          visible={appUpdate.visible}
          runtime={appUpdate.runtime}
          refreshRisk={appUpdate.refreshRisk}
          refreshBusy={appUpdate.refreshBusy}
          refreshError={appUpdate.refreshError}
          onRefresh={appUpdate.refresh}
          onDismiss={appUpdate.dismiss}
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
      </div>

      <div
        className={workspaceClass}
        style={{ "--left-panel-width": `${sidebarWidth}px` }}
      >
        <div className={effectiveLeftHidden ? "workspaceLeft workspaceLeft--rail" : `workspaceLeft ${leftCompact ? "workspaceLeft--compact" : "flex min-w-0 flex-col"}`.trim()}>
          <div className={effectiveLeftHidden ? "workspaceLeftContent workspaceLeftContent--hidden" : "workspaceLeftContent relative"}>
            {left}
            {showResizeHandle ? (
              <div
                className="sidebarResizeHandle"
                data-testid="sidebar-resize-handle"
                onMouseDown={startDragging}
                onTouchStart={startDragging}
                title="Изменить ширину панели"
                aria-label="Изменить ширину панели"
                role="separator"
              />
            ) : null}
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
              activeProjectRouteContext={projectRouteContext}
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
              onBpmnModelerExtensionChange={onBpmnModelerExtensionChange}
              onOpenElementNotes={onOpenElementNotes}
              onElementNotesRemap={onElementNotesRemap}
              snapshotRestoreNotice={snapshotRestoreNotice}
              onSnapshotRestoreNoticeConsumed={onSnapshotRestoreNoticeConsumed}
              onRecalculateRtiers={onRecalculateRtiers}
              selectedPropertiesOverlayPreview={selectedPropertiesOverlayPreview}
              propertiesOverlayAlwaysEnabled={propertiesOverlayAlwaysEnabled}
              propertiesOverlayAlwaysPreviewByElementId={propertiesOverlayAlwaysPreviewByElementId}
              overlayHiddenFields={overlayHiddenFields}
              v2OverlaysEnabled={v2OverlaysEnabled}
              v2OverlaysExpanded={v2OverlaysExpanded}
              toBeLayerEnabled={toBeLayerEnabled}
              toBeDocuments={toBeDocuments}
              onTobeDocumentClick={onTobeDocumentClick}
              onTobeDocumentChange={onTobeDocumentChange}
              tobeGhostDocument={tobeGhostDocument}
              onTobeGhostFix={onTobeGhostFix}
              onTobeGhostCancel={onTobeGhostCancel}
              drawioCompanionFocusIntent={drawioCompanionFocusIntent}
              discussionLinkedElementFocusIntent={discussionLinkedElementFocusIntent}
              onDiscussionLinkedElementFocusResult={onDiscussionLinkedElementFocusResult}
              onOpenNotesDiscussions={onOpenNotesDiscussions}
              onNavigateToSubprocess={onNavigateToSubprocess}
              childSessionDiscussionAggregates={childSessionDiscussionAggregates}
              sessions={sessions}
              subprocessBreadcrumbs={subprocessBreadcrumbs}
              onBreadcrumbNavigate={onBreadcrumbNavigate}
              onReturnToParent={onReturnToParent}
              bpmnXmlCacheRef={bpmnXmlCacheRef}
              bpmnStageRef={bpmnStageRef}
              focusElementId={focusElementId}
              onFocusElementApplied={onFocusElementApplied}
              restoreViewportSnapshot={restoreViewportSnapshot}
              onRestoreViewportSnapshotApplied={onRestoreViewportSnapshotApplied}
            />
          )}
        </div>
      </div>

      <div className="footerHint flex flex-wrap items-center border-t border-border px-4 py-2 text-xs text-muted" data-testid="app-version-footer">
        <a className="font-semibold text-info underline underline-offset-4 hover:text-info/80" href="#updates" data-testid="app-version-link">
          Версия {appVersionInfo.currentVersion}
        </a>
        {latestChangeSummary ? <span> · {latestChangeSummary}</span> : null}
        <BuildBadge />
      </div>
    </div>
  );
}
