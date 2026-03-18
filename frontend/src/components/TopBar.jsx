import { useEffect, useMemo, useRef, useState } from "react";
import AiToolsModal from "./AiToolsModal";
import { useAuth } from "../features/auth/AuthProvider";
import { getManualSessionStatusMeta } from "../features/workspace/workspacePermissions";

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

function sanitizeAiStatusMessage(msg) {
  const raw = String(msg || "").trim();
  if (!raw) return "";
  if (raw.includes("Нажмите «Проверить AI»")) return "";
  if (raw.includes("Ключ сохранён")) return "";
  return raw;
}

function shortLabel(value, max = 34) {
  const text = String(value || "").trim();
  if (!text) return "";
  if (text.length <= max) return text;
  return `${text.slice(0, Math.max(8, max - 1)).trim()}…`;
}

function userTitleFrom(user) {
  return String(user?.name || user?.email || user?.id || "").trim() || "Пользователь";
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
  draft,
}) {
  const { logout, user } = useAuth();
  const orgList = useMemo(() => asArray(orgs), [orgs]);
  const projList = useMemo(() => asArray(projects), [projects]);
  const sessList = useMemo(() => asArray(sessions), [sessions]);
  const isApiOk = backendStatus === true || backendStatus === "ok";
  const openSessionHandler = onOpenSession || onOpen;
  const draftProjectId = toText(draft?.project_id || draft?.projectId);
  const draftSessionId = toText(draft?.session_id || draft?.id);
  const effectiveProjectId = toText(projectId || draftProjectId);
  const effectiveSessionId = toText(sessionId || draftSessionId);
  const hasActiveSession = effectiveSessionId.length > 0;
  const [uiTheme, setUiTheme] = useState("dark");
  const [aiToolsOpen, setAiToolsOpen] = useState(false);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [projectMenuOpen, setProjectMenuOpen] = useState(false);
  const [sessionMenuOpen, setSessionMenuOpen] = useState(false);
  const accountMenuRef = useRef(null);
  const accountButtonRef = useRef(null);
  const projectMenuRef = useRef(null);
  const projectMenuButtonRef = useRef(null);
  const sessionMenuRef = useRef(null);
  const sessionMenuButtonRef = useRef(null);

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
      if (event.key === "Escape") setAccountMenuOpen(false);
    }
    window.addEventListener("mousedown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("mousedown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [accountMenuOpen]);

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

  const verifyState = String(llmVerifyState || "off");
  const aiOk = verifyState === "ok" || (isApiOk && llmHasApiKey);
  const aiPillClass = aiOk
    ? "border-success/45 bg-success/15 text-success"
    : "border-warning/45 bg-warning/15 text-warning";
  const safeVerifyMsg = sanitizeAiStatusMessage(llmVerifyMsg);
  const topCenterHint = useMemo(() => {
    const text = toText(safeVerifyMsg);
    if (!text) return "";
    if (text.toUpperCase() === "API OK") return "";
    return text;
  }, [safeVerifyMsg]);
  const aiHasError = verifyState === "fail" || !!toText(llmErr);
  const aiLoading = !!llmVerifyBusy || !!llmSaving;
  const aiButtonLabel = aiLoading ? "AI …" : aiHasError ? "AI !" : "AI";
  const aiButtonClass = aiLoading
    ? "border-accent/45 bg-accentSoft/60 text-fg"
    : aiHasError
      ? "border-danger/50 bg-danger/15 text-danger"
      : aiPillClass;
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
    if (typeof window === "undefined") return;
    window.alert("Раздел «Профиль» будет доступен в следующих релизах.");
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
              className="topGroup relative flex min-w-[180px] max-w-[320px] flex-1 items-center gap-1.5 rounded-full border border-border/70 bg-panel2/40 px-2 py-1"
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
              className="topGroup relative flex min-w-[200px] max-w-[360px] flex-1 items-center gap-1.5 rounded-full border border-border/70 bg-panel2/40 px-2 py-1"
              title={selectedSessionTitle}
            >
              <span className="shrink-0 text-[9px] font-semibold uppercase tracking-[0.1em] text-muted">СЕССИЯ</span>
              <div className="min-w-0 flex-1 truncate px-1 text-[13px] font-semibold text-fg" data-testid="topbar-session-title">
                {shortLabel(selectedSessionTitle, 56)}
              </div>
              <span
                className={`inline-flex items-center rounded-full border px-2 py-1 text-[11px] font-medium ${sessionStatusMeta.badgeClass}`}
                title="Статус сессии"
                data-testid="topbar-session-status"
              >
                {sessionStatusMeta.label}
              </span>
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
          </>
        ) : null}
      </div>

      <div className="topCenter hidden min-w-[140px] justify-center md:flex">
        {topCenterHint ? (
          <span className="truncate text-[11px] text-muted" title={topCenterHint}>
            {topCenterHint}
          </span>
        ) : null}
      </div>

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
          <button
            type="button"
            className={`inline-flex h-9 min-h-0 items-center rounded-full border px-2.5 py-0 text-sm font-semibold ${aiButtonClass}`}
            onClick={() => setAiToolsOpen(true)}
            title={safeVerifyMsg || backendHint || "AI инструменты"}
            data-testid="topbar-ai-button"
          >
            <span
              className={"mr-1 inline-block h-2 w-2 rounded-full " + (aiHasError ? "bg-danger" : aiLoading ? "bg-accent" : (aiOk ? "bg-success" : "bg-warning"))}
              aria-hidden
            />
            {aiButtonLabel}
          </button>
        </div>

        <div className="topGroup relative flex shrink-0 items-center">
          <button
            type="button"
            ref={accountButtonRef}
            className="iconBtn h-9 w-9 min-w-9 rounded-full border border-border bg-panel2/70 text-fg"
            onClick={() => setAccountMenuOpen((prev) => !prev)}
            title="Профиль"
            aria-label="Профиль"
            aria-expanded={accountMenuOpen ? "true" : "false"}
            data-testid="topbar-account-button"
          >
            <UserAvatarIcon className="h-5 w-5" />
          </button>

          {accountMenuOpen ? (
            <div
              ref={accountMenuRef}
              className="absolute right-0 top-[calc(100%+8px)] z-[140] grid min-w-[220px] gap-1 rounded-xl border border-border bg-panel p-1.5 shadow-panel backdrop-blur"
              data-testid="topbar-account-menu"
            >
              <div className="mb-1 rounded-lg border border-border/60 bg-panel2/50 px-3 py-2">
                <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted">Аккаунт</div>
                <div className="truncate text-sm font-semibold text-fg" title={userTitleFrom(user)}>
                  {shortLabel(userTitleFrom(user), 28)}
                </div>
              </div>
              <button
                type="button"
                className="secondaryBtn h-9 w-full justify-start px-3 text-left text-sm"
                onClick={openProfileSoon}
                title="Профиль пользователя"
                data-testid="topbar-account-profile-soon"
              >
                Профиль
                <span className="ml-auto text-[11px] text-muted">скоро</span>
              </button>
              <button
                type="button"
                className="secondaryBtn h-9 w-full justify-start px-3 text-left text-sm"
                onClick={() => {
                  setAccountMenuOpen(false);
                  toggleTheme();
                }}
                data-testid="topbar-account-settings"
                title="Настройки интерфейса"
              >
                Настройки
                <span className="ml-auto text-[11px] text-muted">{uiTheme === "dark" ? "Dark" : "Light"}</span>
              </button>
              <button
                type="button"
                className="secondaryBtn mt-1 h-9 w-full justify-start border-danger/45 bg-danger/10 px-3 text-left text-sm text-danger hover:border-danger/60 hover:bg-danger/20"
                onClick={() => {
                  setAccountMenuOpen(false);
                  void handleLogout();
                }}
                title="Выйти из аккаунта"
                data-testid="topbar-account-logout"
              >
                Выйти
              </button>
            </div>
          ) : null}
        </div>
      </div>

      <AiToolsModal
        open={aiToolsOpen}
        onClose={() => setAiToolsOpen(false)}
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
    </div>
  );
}
