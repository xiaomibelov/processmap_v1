import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "../features/auth/AuthProvider";
import { getManualSessionStatusMeta, MANUAL_SESSION_STATUSES } from "../features/workspace/workspacePermissions";
import {
  buildAccountDiscussionNotificationGroups,
  filterDiscussionNotificationGroups,
} from "../features/notes/discussionNotificationCenterDropdownModel.js";
import DiscussionNotificationCenterPanel from "../features/notes/DiscussionNotificationCenterPanel.jsx";
import {
  apiAcknowledgeNoteThreadAttention,
  apiMarkNoteThreadRead,
} from "../lib/api.js";
import { useSessionNoteAggregate, useSessionNoteAggregates } from "../lib/sessionNoteAggregates.js";

function asArray(x) {
  return Array.isArray(x) ? x : [];
}

function toText(v) {
  return String(v || "").trim();
}

function projectIdFrom(p) {
  return String((p && (p.id || p.project_id || p.slug)) || "").trim();
}

function projectTitleFrom(p) {
  return String((p && (p.title || p.name || p.id || p.project_id || p.slug)) || "").trim() || "—";
}

function sessionIdFrom(s) {
  return String((s && (s.id || s.session_id)) || "").trim();
}

function sessionTitleFrom(s) {
  return String((s && (s.title || s.name || s.id || s.session_id)) || "").trim() || "—";
}

function orgIdFrom(o) {
  return String((o && (o.org_id || o.id)) || "").trim();
}

function shortLabel(value, max = 34) {
  const text = String(value || "").trim();
  if (!text) return "";
  if (text.length <= max) return text;
  return `${text.slice(0, Math.max(8, max - 1)).trim()}…`;
}

function normalizedNotificationLabel(value) {
  return toText(value).replace(/\s+/g, " ").toLowerCase();
}

function compactNotificationContext(sessionTitle, projectTitle) {
  const session = toText(sessionTitle);
  const project = toText(projectTitle);
  if (session && project && normalizedNotificationLabel(session) === normalizedNotificationLabel(project)) return session;
  if (session && project) return `${session} · ${project}`;
  return session || project || "Сессия";
}

function rowsFromNotificationCenter(center) {
  return asArray(center?.groups).flatMap((group) => (
    asArray(group?.rows).map((row) => {
      const sessionTitle = toText(row?.sessionTitle) || toText(group?.sessionTitle);
      const projectTitle = toText(row?.projectTitle) || toText(group?.projectTitle);
      return {
        ...row,
        sessionTitle,
        projectTitle,
        contextLabel: toText(row?.contextLabel) || compactNotificationContext(sessionTitle, projectTitle),
        primaryLabel: toText(row?.primaryLabel || row?.title) || "Обсуждение",
        secondaryLabel: toText(row?.secondaryLabel || row?.excerpt),
      };
    })
  ));
}

function userTitleFrom(user) {
  return String(user?.name || user?.email || user?.id || "").trim() || "Пользователь";
}

function notificationActionErrorText(result, fallback) {
  return String(result?.message || result?.error || result?.detail || fallback || "Не удалось выполнить действие.").trim();
}

function UserAvatarIcon({ className = "" }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className}>
      <path
        fill="currentColor"
        d="M12 12a4.25 4.25 0 1 0 0-8.5 4.25 4.25 0 0 0 0 8.5Zm0 2.1c-4.63 0-8.25 2.4-8.25 5.47 0 .52.42.93.93.93h14.64c.51 0 .93-.41.93-.93 0-3.07-3.62-5.47-8.25-5.47Z"
      />
    </svg>
  );
}

export default function TopBar({
  orgs,
  activeOrgId,
  onOrgChange,
  onOpenOrgSettings,
  projects,
  projectId,
  onProjectChange,
  onDeleteProject,
  canManageProjectEntities = true,
  sessions,
  sessionId,
  sessionStatus = "draft",
  onOpenSession,
  onOpenWorkspace,
  onOpen,
  onDeleteSession,
  onChangeSessionStatus,
  onNewProject,
  onOpenDiscussionNotifications,
  draft,
  mentionNotifications = [],
  noteNotifications = [],
  noteNotificationsAvailable = false,
  onOpenMentionNotification,
  onRefreshMentionNotifications,
}) {
  const { logout, user } = useAuth();
  const orgList = useMemo(() => asArray(orgs), [orgs]);
  const projList = useMemo(() => asArray(projects), [projects]);
  const sessList = useMemo(() => asArray(sessions), [sessions]);
  const openSessionHandler = onOpenSession || onOpen;
  const draftProjectId = toText(draft?.project_id || draft?.projectId);
  const draftSessionId = toText(draft?.session_id || draft?.id);
  const effectiveProjectId = toText(projectId || draftProjectId);
  const effectiveSessionId = toText(sessionId || draftSessionId);
  const hasActiveSession = effectiveSessionId.length > 0;
  const [uiTheme, setUiTheme] = useState("dark");
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [notificationCenterOpen, setNotificationCenterOpen] = useState(false);
  const [notificationFilter, setNotificationFilter] = useState("unviewed");
  const [notificationActionPending, setNotificationActionPending] = useState("");
  const [notificationActionError, setNotificationActionError] = useState({ rowId: "", text: "" });
  const [projectMenuOpen, setProjectMenuOpen] = useState(false);
  const [sessionMenuOpen, setSessionMenuOpen] = useState(false);
  const [statusMenuOpen, setStatusMenuOpen] = useState(false);
  const notesAggregate = useSessionNoteAggregate(effectiveSessionId);
  const sessionAggregateIds = useMemo(
    () => ((accountMenuOpen || notificationCenterOpen) ? sessList.map((item) => sessionIdFrom(item)).filter(Boolean) : []),
    [accountMenuOpen, notificationCenterOpen, sessList],
  );
  const sessionAggregatesBySessionId = useSessionNoteAggregates(sessionAggregateIds);
  const accountMenuRef = useRef(null);
  const accountButtonRef = useRef(null);
  const projectMenuRef = useRef(null);
  const projectMenuButtonRef = useRef(null);
  const sessionMenuRef = useRef(null);
  const sessionMenuButtonRef = useRef(null);
  const statusMenuRef = useRef(null);
  const statusMenuButtonRef = useRef(null);

  useEffect(() => {
    try {
      const root = document.documentElement;
      const isLight = root.classList.contains("light");
      setUiTheme(isLight ? "light" : "dark");
    } catch {
      setUiTheme("dark");
    }
  }, []);

  useEffect(() => {
    if (!accountMenuOpen) return undefined;
    function onPointerDown(event) {
      const target = event.target;
      if (!(target instanceof Node)) return;
      const menu = accountMenuRef.current;
      const button = accountButtonRef.current;
      if (menu?.contains(target) || button?.contains(target)) return;
      setAccountMenuOpen(false);
    }
    function onKeyDown(event) {
      if (event.key === "Escape") {
        setAccountMenuOpen(false);
        setNotificationCenterOpen(false);
      }
    }
    window.addEventListener("mousedown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("mousedown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [accountMenuOpen]);

  useEffect(() => {
    if (!notificationCenterOpen) return undefined;
    function onKeyDown(event) {
      if (event.key === "Escape") setNotificationCenterOpen(false);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [notificationCenterOpen]);

  useEffect(() => {
    if (!projectMenuOpen) return undefined;
    function onPointerDown(event) {
      const target = event.target;
      if (!(target instanceof Node)) return;
      const menu = projectMenuRef.current;
      const button = projectMenuButtonRef.current;
      if (menu?.contains(target) || button?.contains(target)) return;
      setProjectMenuOpen(false);
    }
    function onKeyDown(event) {
      if (event.key === "Escape") setProjectMenuOpen(false);
    }
    window.addEventListener("mousedown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("mousedown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [projectMenuOpen]);

  useEffect(() => {
    if (!sessionMenuOpen) return undefined;
    function onPointerDown(event) {
      const target = event.target;
      if (!(target instanceof Node)) return;
      const menu = sessionMenuRef.current;
      const button = sessionMenuButtonRef.current;
      if (menu?.contains(target) || button?.contains(target)) return;
      setSessionMenuOpen(false);
    }
    function onKeyDown(event) {
      if (event.key === "Escape") setSessionMenuOpen(false);
    }
    window.addEventListener("mousedown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("mousedown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [sessionMenuOpen]);

  useEffect(() => {
    if (!statusMenuOpen) return undefined;
    function onPointerDown(event) {
      const target = event.target;
      if (!(target instanceof Node)) return;
      const menu = statusMenuRef.current;
      const button = statusMenuButtonRef.current;
      if (menu?.contains(target) || button?.contains(target)) return;
      setStatusMenuOpen(false);
    }
    function onKeyDown(event) {
      if (event.key === "Escape") setStatusMenuOpen(false);
    }
    window.addEventListener("mousedown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("mousedown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [statusMenuOpen]);

  function toggleTheme() {
    const next = uiTheme === "dark" ? "light" : "dark";
    setUiTheme(next);
    try {
      document.documentElement.classList.remove("dark", "light");
      document.documentElement.classList.add(next);
      window.localStorage.setItem("fpc_theme", next);
    } catch {
      // ignore
    }
  }

  const selectedProjectTitle = useMemo(() => {
    const id = effectiveProjectId;
    if (!id) return "";
    const found = projList.find((item) => projectIdFrom(item) === id);
    return projectTitleFrom(found || { title: id });
  }, [effectiveProjectId, projList]);
  const selectedSessionTitle = useMemo(() => {
    const id = effectiveSessionId;
    if (!id) return "";
    const found = sessList.find((item) => sessionIdFrom(item) === id);
    const fallback = {
      title: toText(draft?.title || draft?.name || id),
      id,
    };
    return sessionTitleFrom(found || fallback);
  }, [draft?.name, draft?.title, effectiveSessionId, sessList]);
  const activeOrgRole = useMemo(() => {
    const id = String(activeOrgId || "").trim();
    if (!id) return "";
    const found = orgList.find((item) => orgIdFrom(item) === id);
    return String(found?.role || "").trim().toLowerCase();
  }, [activeOrgId, orgList]);
  const currentOrg = useMemo(() => {
    const id = String(activeOrgId || "").trim();
    if (!id) return null;
    return orgList.find((item) => orgIdFrom(item) === id) || null;
  }, [activeOrgId, orgList]);
  const currentOrgLabel = useMemo(
    () => String(currentOrg?.name || currentOrg?.org_name || activeOrgId || "").trim() || "Организация",
    [activeOrgId, currentOrg],
  );
  const hasMultiOrg = orgList.length > 1;
  const sessionStatusMeta = getManualSessionStatusMeta(sessionStatus);
  const canOpenOrgSettings = Boolean(user?.is_admin) || ["org_owner", "org_admin", "auditor"].includes(activeOrgRole);
  const mentionItems = asArray(mentionNotifications);
  const noteNotificationItems = asArray(noteNotifications);
  const hasBackendNotificationFeed = noteNotificationsAvailable === true;
  const accountNotificationCenter = useMemo(() => {
    const aggregates = new Map(sessionAggregatesBySessionId);
    if (effectiveSessionId && notesAggregate && !aggregates.has(effectiveSessionId)) {
      aggregates.set(effectiveSessionId, notesAggregate);
    }
    return buildAccountDiscussionNotificationGroups({
      noteNotifications: hasBackendNotificationFeed ? noteNotificationItems : [],
      mentionNotifications: hasBackendNotificationFeed ? [] : mentionItems,
      sessionAggregates: hasBackendNotificationFeed ? new Map() : aggregates,
      currentSession: {
        id: effectiveSessionId,
        title: selectedSessionTitle,
        project_id: effectiveProjectId,
        aggregate: notesAggregate,
      },
      currentProject: {
        id: effectiveProjectId,
        title: selectedProjectTitle,
      },
      knownSessions: sessList,
    });
  }, [
    effectiveProjectId,
    effectiveSessionId,
    hasBackendNotificationFeed,
    mentionItems,
    noteNotificationItems,
    notesAggregate,
    selectedProjectTitle,
    selectedSessionTitle,
    sessList,
    sessionAggregatesBySessionId,
  ]);
  const accountNotificationCount = accountNotificationCenter.badgeCount;
  const hasAccountNotifications = accountNotificationCenter.rowCount > 0;
  const visibleNotificationCenter = useMemo(
    () => filterDiscussionNotificationGroups(accountNotificationCenter, notificationFilter),
    [accountNotificationCenter, notificationFilter],
  );
  const visibleNotificationRows = useMemo(
    () => rowsFromNotificationCenter(visibleNotificationCenter),
    [visibleNotificationCenter],
  );
  const accountNotificationPreviewRows = useMemo(
    () => rowsFromNotificationCenter(accountNotificationCenter).slice(0, 3),
    [accountNotificationCenter],
  );
  const notificationSummary = hasAccountNotifications
    ? `${accountNotificationCenter.unviewedCount} непросмотренных · ${accountNotificationCenter.attentionCount} требуют внимания · ${accountNotificationCenter.viewedCount} просмотренных`
    : "Нет уведомлений";
  const notificationFilters = useMemo(() => ([
    { key: "unviewed", label: "Не просмотренные", count: accountNotificationCenter.unviewedCount },
    { key: "attention", label: "Требуют внимания", count: accountNotificationCenter.attentionCount },
    { key: "viewed", label: "Просмотренные", count: accountNotificationCenter.viewedCount },
  ]), [
    accountNotificationCenter.attentionCount,
    accountNotificationCenter.rowCount,
    accountNotificationCenter.unviewedCount,
    accountNotificationCenter.viewedCount,
  ]);

  async function handleLogout() {
    if (typeof window !== "undefined") {
      const confirmed = window.confirm("Выйти из аккаунта?");
      if (!confirmed) return;
    }
    await logout();
    window.location.assign("/");
  }

  function openAdminConsole() {
    if (typeof window === "undefined") return;
    window.location.assign("/admin/dashboard");
  }

  function openProfileSoon() {
    setAccountMenuOpen(false);
    setNotificationCenterOpen(false);
    if (typeof window === "undefined") return;
    window.alert("Раздел «Профиль» будет доступен в следующих релизах.");
  }

  function preferredNotificationFilter() {
    if (accountNotificationCenter.unviewedCount > 0) return "unviewed";
    if (accountNotificationCenter.attentionCount > 0) return "attention";
    return "viewed";
  }

  function openNotificationCenterPanel() {
    setNotificationFilter(preferredNotificationFilter());
    setNotificationActionError({ rowId: "", text: "" });
    setNotificationCenterOpen(true);
    setAccountMenuOpen(false);
  }

  async function handleAccountNotificationOpen(row) {
    const item = row && typeof row === "object" ? row : {};
    setAccountMenuOpen(false);
    setNotificationCenterOpen(false);
    const openDiscussionTarget = () => onOpenDiscussionNotifications?.({
      threadId: item.threadId || item.thread_id || item.target?.thread_id || "",
      commentId: item.commentId || item.comment_id || item.target?.comment_id || "",
    });
    if (item.type === "mention" || (item.reason === "mention" && item.mention)) {
      if (typeof onOpenMentionNotification === "function") {
        await Promise.resolve(onOpenMentionNotification(item.mention || item));
      }
      return;
    }

    const targetSessionId = toText(item.sessionId);
    if (targetSessionId && targetSessionId === effectiveSessionId) {
      openDiscussionTarget();
      return;
    }

    if (targetSessionId && typeof openSessionHandler === "function") {
      const opened = await Promise.resolve(openSessionHandler(
        targetSessionId,
        { openTab: "diagram", source: "note_notification" },
      ));
      if (opened?.ok === false) return;
      openDiscussionTarget();
      return;
    }

    openDiscussionTarget();
  }

  async function refreshAccountNotificationsAfterAction() {
    if (typeof onRefreshMentionNotifications === "function") {
      await Promise.resolve(onRefreshMentionNotifications());
    }
  }

  async function handleNotificationRowAction(row, action) {
    const item = row && typeof row === "object" ? row : {};
    const rowId = toText(item.id);
    const threadId = toText(item.threadId || item.thread_id || item.target?.thread_id);
    const pendingKey = `${rowId}:${action}`;
    setNotificationActionError({ rowId: "", text: "" });
    setNotificationActionPending(pendingKey);
    try {
      let result = null;
      if (action === "read") {
        if (!item.canMarkRead || !threadId) return;
        result = await apiMarkNoteThreadRead(threadId);
      } else if (action === "attention") {
        if (!item.canAcknowledgeAttention || !threadId) return;
        result = await apiAcknowledgeNoteThreadAttention(threadId);
      }
      if (!result?.ok) {
        setNotificationActionError({
          rowId,
          text: notificationActionErrorText(result, "Не удалось обновить уведомление."),
        });
        return;
      }
      await refreshAccountNotificationsAfterAction();
    } catch {
      setNotificationActionError({ rowId, text: "Не удалось обновить уведомление." });
    } finally {
      setNotificationActionPending("");
    }
  }

  return (
    <div className="topbar sticky left-0 right-0 top-0 z-40 flex h-auto min-h-12 w-full min-w-0 shrink-0 items-center gap-2 border-b border-border bg-panel/95 px-3 py-2 backdrop-blur md:gap-3">
      <div className="topbarNavLeft flex min-w-0 shrink-0 items-center gap-2">
        <div
          className="brand mr-1 inline-flex shrink-0 items-center text-xl font-black uppercase tracking-[0.08em] text-fg"
          data-testid="topbar-brand-text"
        >
          <span className="bg-gradient-to-r from-fg via-fg to-accent bg-clip-text text-transparent [text-shadow:0_1px_0_rgba(0,0,0,.14)]">ProcessMap</span>
        </div>
        <button
          type="button"
          className="secondaryBtn h-9 min-h-0 whitespace-nowrap px-3 py-0 text-sm"
          onClick={() => onOpenWorkspace?.()}
          title={hasActiveSession ? "Вернуться к проекту" : "Вернуться к списку проектов"}
          data-testid="topbar-back-projects"
        >
          {hasActiveSession ? "← К проекту" : "← Проекты"}
        </button>
      </div>

      <div className="topbarNavCenter flex min-w-0 flex-1 items-center justify-end gap-1.5 overflow-visible md:gap-2">
        {hasActiveSession ? (
          <>
            <div
              className="topGroup relative flex min-w-[100px] max-w-[180px] flex-1 items-center gap-1.5 rounded-full border border-border/70 bg-panel2/40 px-2 py-1"
              title={selectedProjectTitle}
            >
              <span className="shrink-0 text-[9px] font-semibold uppercase tracking-[0.1em] text-muted">ПРОЕКТ</span>
              <div className="min-w-0 flex-1 truncate px-1 text-[13px] font-semibold text-fg" data-testid="topbar-project-title">
                {effectiveProjectId ? shortLabel(selectedProjectTitle, 48) : "Проект не выбран"}
              </div>
              <button
                ref={projectMenuButtonRef}
                type="button"
                className="inline-flex h-6 w-6 min-w-6 items-center justify-center rounded-full text-[12px] text-muted transition hover:text-fg"
                onClick={() => setProjectMenuOpen((prev) => !prev)}
                title="Действия проекта"
                data-testid="topbar-project-actions-button"
                aria-label="Действия проекта"
              >
                ▾
              </button>
              {projectMenuOpen ? (
                <div
                  ref={projectMenuRef}
                  className="absolute right-1 top-[calc(100%+8px)] z-[130] grid min-w-[220px] gap-1 rounded-xl border border-border bg-panel p-1.5 shadow-panel"
                  data-testid="topbar-project-actions-menu"
                >
                  <button
                    type="button"
                    className="secondaryBtn h-9 w-full justify-start px-3 text-left text-sm"
                    onClick={() => {
                      setProjectMenuOpen(false);
                      onOpenWorkspace?.();
                    }}
                  >
                    ← Проекты
                  </button>
                  <button
                    type="button"
                    className="secondaryBtn h-9 w-full justify-start px-3 text-left text-sm"
                    onClick={() => {
                      setProjectMenuOpen(false);
                      onNewProject?.();
                    }}
                    data-testid="topbar-new-project"
                  >
                    Новый проект
                  </button>
                  {canManageProjectEntities ? (
                    <button
                      type="button"
                      className="secondaryBtn h-9 w-full justify-start border-danger/45 bg-danger/10 px-3 text-left text-sm text-danger hover:border-danger/60 hover:bg-danger/20"
                      onClick={() => {
                        setProjectMenuOpen(false);
                        onDeleteProject?.();
                      }}
                      disabled={!effectiveProjectId}
                    >
                      Удалить проект
                    </button>
                  ) : null}
                </div>
              ) : null}
            </div>

            <div
              className="topGroup relative flex min-w-[120px] max-w-[200px] flex-1 items-center gap-1.5 rounded-full border border-border/70 bg-panel2/40 px-2 py-1"
              title={selectedSessionTitle}
            >
              <span className="shrink-0 text-[9px] font-semibold uppercase tracking-[0.1em] text-muted">СЕССИЯ</span>
              <div className="min-w-0 flex-1 truncate px-1 text-[13px] font-semibold text-fg" data-testid="topbar-session-title">
                {shortLabel(selectedSessionTitle, 36)}
              </div>
              <button
                ref={sessionMenuButtonRef}
                type="button"
                className="inline-flex h-6 w-6 min-w-6 items-center justify-center rounded-full text-[12px] text-muted transition hover:text-fg"
                onClick={() => setSessionMenuOpen((prev) => !prev)}
                title="Действия сессии"
                data-testid="topbar-session-actions-button"
                aria-label="Действия сессии"
              >
                ▾
              </button>
              {sessionMenuOpen ? (
                <div
                  ref={sessionMenuRef}
                  className="absolute right-1 top-[calc(100%+8px)] z-[130] grid min-w-[220px] gap-1 rounded-xl border border-border bg-panel p-1.5 shadow-panel"
                  data-testid="topbar-session-actions-menu"
                >
                  <button
                    type="button"
                    className="secondaryBtn h-9 w-full justify-start px-3 text-left text-sm"
                    onClick={() => {
                      setSessionMenuOpen(false);
                      onOpenWorkspace?.();
                    }}
                  >
                    К списку сессий
                  </button>
                  {canManageProjectEntities ? (
                    <button
                      type="button"
                      className="secondaryBtn h-9 w-full justify-start border-danger/45 bg-danger/10 px-3 text-left text-sm text-danger hover:border-danger/60 hover:bg-danger/20"
                      onClick={() => {
                        setSessionMenuOpen(false);
                        onDeleteSession?.();
                      }}
                      disabled={!effectiveSessionId}
                    >
                      Удалить сессию
                    </button>
                  ) : null}
                </div>
              ) : null}
            </div>

            <div className="relative shrink-0">
              <button
                ref={statusMenuButtonRef}
                type="button"
                className={`statusComboPill inline-flex h-8 items-center rounded-md border px-2.5 text-[11px] font-medium transition hover:opacity-80 ${sessionStatusMeta.badgeClass}`}
                title="Статус сессии — нажмите чтобы изменить"
                data-testid="topbar-session-status"
                onClick={() => setStatusMenuOpen((prev) => !prev)}
              >
                {sessionStatusMeta.label}
                <svg viewBox="0 0 10 6" className="ml-1 h-2.5 w-2.5 opacity-70" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M1 1l4 4 4-4" />
                </svg>
              </button>
              {statusMenuOpen ? (
                <div
                  ref={statusMenuRef}
                  className="absolute left-0 top-[calc(100%+6px)] z-[130] grid min-w-[160px] gap-0.5 rounded-xl border border-border bg-panel p-1.5 shadow-panel"
                  data-testid="topbar-status-change-menu"
                >
                  {MANUAL_SESSION_STATUSES.map((s) => (
                    <button
                      key={s.value}
                      type="button"
                      className={`secondaryBtn h-8 w-full justify-start px-3 text-left text-sm ${sessionStatus === s.value ? "ring-1 ring-accent/60" : ""}`}
                      onClick={() => {
                        setStatusMenuOpen(false);
                        onChangeSessionStatus?.(s.value);
                      }}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          </>
        ) : null}
      </div>

      <div className="topCenter hidden min-w-[140px] justify-center md:flex" />

      <div className="topbarNavRight relative flex min-w-0 shrink-0 items-center justify-end gap-1.5 overflow-visible whitespace-nowrap">
        <div className="topGroup flex shrink-0 items-center gap-1.5">
          {hasMultiOrg ? (
            <label className="inline-flex min-w-[210px] items-center gap-2 rounded-full border border-border/70 bg-panel2/40 px-3 py-1 text-xs text-muted">
              <span className="shrink-0 text-[10px] font-semibold uppercase tracking-[0.12em]">Org</span>
              <select
                className="h-7 min-h-0 flex-1 border-0 bg-transparent px-0 text-sm font-medium text-fg outline-none"
                value={toText(activeOrgId)}
                onChange={(event) => onOrgChange?.(event.target.value)}
                data-testid="topbar-org-switcher"
                aria-label="Organization switcher"
              >
                {orgList.map((item, index) => {
                  const id = orgIdFrom(item);
                  const label = String(item?.name || item?.org_name || id || `Org ${index + 1}`).trim();
                  return <option key={id || `org_${index}`} value={id}>{label}</option>;
                })}
              </select>
            </label>
          ) : currentOrgLabel ? (
            <div className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-panel2/40 px-3 py-1 text-xs text-muted">
              <span className="text-[10px] font-semibold uppercase tracking-[0.12em]">Org</span>
              <span className="max-w-[190px] truncate text-sm font-medium text-fg" title={currentOrgLabel}>{currentOrgLabel}</span>
            </div>
          ) : null}
          {canOpenOrgSettings ? (
            <button
              type="button"
              className="secondaryBtn h-9 min-h-0 whitespace-nowrap px-2.5 py-0 text-sm"
              onClick={openAdminConsole}
              data-testid="topbar-admin-button"
              title="Открыть admin dashboard"
            >
              Админ-панель
            </button>
          ) : null}
        </div>

        <div className="topGroup relative flex shrink-0 items-center gap-2">
          <button
            type="button"
            ref={accountButtonRef}
            className={`iconBtn relative h-9 w-9 min-w-9 rounded-full border ${accountNotificationCount > 0 ? "border-danger/55 bg-danger/15 text-danger" : "border-border bg-panel2/70 text-fg"}`}
            onClick={() => {
              const nextOpen = !accountMenuOpen;
              setAccountMenuOpen(nextOpen);
              if (nextOpen) setNotificationCenterOpen(false);
              if (nextOpen && typeof onRefreshMentionNotifications === "function") void onRefreshMentionNotifications();
            }}
            title={accountNotificationCount > 0 ? `Профиль и уведомления: ${accountNotificationCount}` : "Профиль"}
            aria-label={accountNotificationCount > 0 ? `Профиль и уведомления: ${accountNotificationCount}` : "Профиль"}
            aria-expanded={accountMenuOpen ? "true" : "false"}
            data-testid="topbar-account-button"
          >
            <UserAvatarIcon className="h-5 w-5" />
            {accountNotificationCount > 0 ? (
              <span
                className="absolute -right-1 -top-1 min-w-4 rounded-full border border-white bg-rose-600 px-1 text-[10px] font-black leading-4 text-white shadow-sm"
                data-testid="topbar-account-notification-count"
              >
                {accountNotificationCount > 9 ? "9+" : accountNotificationCount}
              </span>
            ) : null}
          </button>

          {accountMenuOpen ? (
            <div
              ref={accountMenuRef}
              className="fixed right-3 top-14 z-[140] flex max-h-[calc(100vh-4.25rem)] w-[360px] max-w-[calc(100vw-1.5rem)] min-w-0 flex-col overflow-hidden rounded-xl border border-border bg-panel shadow-panel backdrop-blur"
              data-testid="topbar-account-menu"
            >
              <div className="min-w-0 border-b border-border/70 px-4 py-3">
                <div className="truncate text-sm font-semibold text-fg" title={userTitleFrom(user)}>
                  {shortLabel(userTitleFrom(user), 46)}
                </div>
                <div className="mt-0.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">Аккаунт</div>
              </div>
              <div className="min-w-0 border-b border-border/70 px-4 py-3" data-testid="topbar-mentions-menu">
                <div className="flex min-w-0 items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-bold leading-tight text-fg">Уведомления</div>
                    <div className="mt-0.5 truncate text-xs text-muted" data-testid="topbar-notification-summary">
                      {notificationSummary}
                    </div>
                  </div>
                </div>
                {hasAccountNotifications ? (
                  <div className="mt-2 grid gap-1.5" data-testid="topbar-notification-preview-list">
                    {accountNotificationPreviewRows.map((row) => (
                      <button
                        key={row.id}
                        type="button"
                        className="group grid min-w-0 gap-1 rounded-md border border-border/65 bg-panel2/30 px-2.5 py-2 text-left transition hover:border-info/35 hover:bg-panel2/55"
                        onClick={openNotificationCenterPanel}
                        data-testid="topbar-notification-preview-row"
                      >
                        <span className="min-w-0 truncate text-[12px] font-semibold text-fg" title={row.primaryLabel || row.title || "Обсуждение"}>
                          {shortLabel(row.primaryLabel || row.title || "Обсуждение", 42)}
                        </span>
                        {row.secondaryLabel ? (
                          <span className="min-w-0 truncate text-[11px] text-muted" title={row.secondaryLabel}>
                            {shortLabel(row.secondaryLabel, 64)}
                          </span>
                        ) : null}
                        <span className="flex min-w-0 items-center gap-1.5 text-[10px] leading-4 text-muted/85" data-testid="topbar-notification-preview-context">
                          <span className="min-w-0 truncate" title={row.contextLabel || compactNotificationContext(row.sessionTitle, row.projectTitle)}>
                            {shortLabel(row.contextLabel || compactNotificationContext(row.sessionTitle, row.projectTitle), 58)}
                          </span>
                          {row.badges?.[0]?.label ? (
                            <span className="shrink-0 rounded-full border border-border/70 bg-bg/30 px-1.5 py-0 text-[9px] font-semibold leading-4 text-muted">
                              {shortLabel(row.badges[0].label, 18)}
                            </span>
                          ) : null}
                        </span>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div
                    className="mt-2 min-w-0 rounded-md border border-dashed border-border px-2 py-2 text-xs leading-snug text-muted break-words"
                    data-testid="topbar-notification-empty"
                  >
                    Нет уведомлений
                  </div>
                )}
                <button
                  type="button"
                  className="secondaryBtn mt-3 h-8 w-full min-w-0 justify-center px-3 text-sm"
                  onClick={openNotificationCenterPanel}
                  data-testid="topbar-open-notification-center"
                >
                  Открыть центр уведомлений
                </button>
              </div>
              <div className="grid gap-1 p-2" data-testid="topbar-account-actions">
                <button
                  type="button"
                  className="secondaryBtn h-8 w-full min-w-0 justify-start gap-2 overflow-hidden px-2.5 text-left text-sm"
                  onClick={openProfileSoon}
                  title="Профиль пользователя"
                  data-testid="topbar-account-profile-soon"
                >
                  <span className="min-w-0 flex-1 truncate">Профиль</span>
                  <span className="ml-auto shrink-0 text-[11px] text-muted">скоро</span>
                </button>
                <button
                  type="button"
                  role="switch"
                  aria-checked={uiTheme === "light" ? "true" : "false"}
                  className="secondaryBtn h-9 w-full min-w-0 justify-start gap-2 overflow-hidden px-2.5 text-left text-sm"
                  onClick={() => {
                    toggleTheme();
                  }}
                  data-testid="topbar-theme-toggle"
                  title={uiTheme === "dark" ? "Включить светлую тему" : "Включить тёмную тему"}
                >
                  <span className="shrink-0">Тема</span>
                  <span className="ml-auto min-w-0 flex-1 truncate text-right text-[11px] text-muted">{uiTheme === "dark" ? "Тёмная" : "Светлая"}</span>
                  <span className={`relative h-5 w-9 shrink-0 rounded-full border transition ${uiTheme === "light" ? "border-sky-300 bg-sky-100" : "border-border bg-bg/70"}`} aria-hidden="true">
                    <span className={`absolute top-0.5 h-3.5 w-3.5 rounded-full bg-fg transition ${uiTheme === "light" ? "left-4" : "left-0.5"}`} />
                  </span>
                </button>
                <button
                  type="button"
                  className="secondaryBtn h-8 w-full min-w-0 justify-start overflow-hidden border-danger/45 bg-danger/10 px-2.5 text-left text-sm text-danger hover:border-danger/60 hover:bg-danger/20"
                  onClick={() => {
                    setAccountMenuOpen(false);
                    setNotificationCenterOpen(false);
                    void handleLogout();
                  }}
                  title="Выйти из аккаунта"
                  data-testid="topbar-account-logout"
                >
                  <span className="min-w-0 truncate">Выйти</span>
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </div>

      <DiscussionNotificationCenterPanel
        open={notificationCenterOpen}
        rows={visibleNotificationRows}
        totalCount={accountNotificationCenter.rowCount}
        filters={notificationFilters}
        activeFilter={notificationFilter}
        onFilterChange={(key) => {
          setNotificationFilter(key);
          setNotificationActionError({ rowId: "", text: "" });
        }}
        onClose={() => setNotificationCenterOpen(false)}
        onRefresh={() => {
          setNotificationActionError({ rowId: "", text: "" });
          if (typeof onRefreshMentionNotifications === "function") void onRefreshMentionNotifications();
        }}
        onOpenNotification={(row) => void handleAccountNotificationOpen(row)}
        onRowAction={(row, action) => void handleNotificationRowAction(row, action)}
        actionPendingKey={notificationActionPending}
        actionError={notificationActionError}
      />
    </div>
  );
}
