import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import AiToolsModal from "./AiToolsModal";
import { useAuth } from "../features/auth/AuthProvider";

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

function orgTitleFrom(o) {
  return String((o && (o.name || o.org_name || o.org_id || o.id)) || "").trim() || "—";
}

function shortActor(raw) {
  const value = String(raw || "").trim();
  if (!value) return "—";
  if (value.length <= 14) return value;
  return `${value.slice(0, 6)}…${value.slice(-4)}`;
}

function sanitizeAiStatusMessage(msg) {
  const raw = String(msg || "").trim();
  if (!raw) return "";
  if (raw.includes("Нажмите «Проверить AI»")) return "";
  if (raw.includes("Ключ сохранён")) return "";
  return raw;
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
  onOpenSession,
  onOpen,
  onDeleteSession,
  onNewProject,
  onNewBackendSession,
  onNewBackend,
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
}) {
  const { logout, user } = useAuth();
  const orgList = useMemo(() => asArray(orgs), [orgs]);
  const projList = useMemo(() => asArray(projects), [projects]);
  const sessList = useMemo(() => asArray(sessions), [sessions]);
  const isApiOk = backendStatus === true || backendStatus === "ok";
  const openSessionHandler = onOpenSession || onOpen;
  const newBackendHandler = onNewBackendSession || onNewBackend;
  const [uiTheme, setUiTheme] = useState("dark");
  const [aiToolsOpen, setAiToolsOpen] = useState(false);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [accountMenuPos, setAccountMenuPos] = useState({ left: 8, top: 56, width: 220 });
  const accountMenuRef = useRef(null);
  const accountButtonRef = useRef(null);

  const updateAccountMenuPos = useCallback(() => {
    if (typeof window === "undefined") return;
    const button = accountButtonRef.current;
    if (!button) return;
    const rect = button.getBoundingClientRect();
    const margin = 8;
    const viewportW = Math.max(0, Number(window.innerWidth || 0));
    const viewportH = Math.max(0, Number(window.innerHeight || 0));
    const width = Math.min(220, Math.max(170, viewportW - margin * 2));
    const left = Math.max(
      margin,
      Math.min(rect.right - width, viewportW - width - margin),
    );
    const top = Math.max(margin, Math.min(rect.bottom + 8, viewportH - 48));
    setAccountMenuPos({
      left: Number.isFinite(left) ? left : margin,
      top: Number.isFinite(top) ? top : 56,
      width: Number.isFinite(width) ? width : 220,
    });
  }, []);

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
    updateAccountMenuPos();
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
    function onViewportChange() {
      updateAccountMenuPos();
    }
    window.addEventListener("mousedown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("resize", onViewportChange);
    window.addEventListener("scroll", onViewportChange, true);
    return () => {
      window.removeEventListener("mousedown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("resize", onViewportChange);
      window.removeEventListener("scroll", onViewportChange, true);
    };
  }, [accountMenuOpen, updateAccountMenuPos]);

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
    const id = String(projectId || "").trim();
    if (!id) return "";
    const found = projList.find((item) => projectIdFrom(item) === id);
    const createdBy = shortActor(found?.created_by || found?.owner_user_id);
    const updatedBy = shortActor(found?.updated_by || found?.created_by || found?.owner_user_id);
    return `${projectTitleFrom(found)} · Created by ${createdBy} · Updated by ${updatedBy}`;
  }, [projList, projectId]);
  const selectedSessionTitle = useMemo(() => {
    const id = String(sessionId || "").trim();
    if (!id) return "";
    const found = sessList.find((item) => sessionIdFrom(item) === id);
    const createdBy = shortActor(found?.created_by || found?.owner_user_id);
    const updatedBy = shortActor(found?.updated_by || found?.created_by || found?.owner_user_id);
    return `${sessionTitleFrom(found)} · Created by ${createdBy} · Updated by ${updatedBy}`;
  }, [sessList, sessionId]);
  const selectedOrgTitle = useMemo(() => {
    const id = String(activeOrgId || "").trim();
    if (!id) return "";
    const found = orgList.find((item) => orgIdFrom(item) === id);
    return orgTitleFrom(found);
  }, [orgList, activeOrgId]);
  const activeOrgRole = useMemo(() => {
    const id = String(activeOrgId || "").trim();
    if (!id) return "";
    const found = orgList.find((item) => orgIdFrom(item) === id);
    return String(found?.role || "").trim().toLowerCase();
  }, [activeOrgId, orgList]);
  const canOpenOrgSettings = Boolean(user?.is_admin) || ["org_owner", "org_admin", "auditor"].includes(activeOrgRole);

  async function handleLogout() {
    if (typeof window !== "undefined") {
      const confirmed = window.confirm("Выйти из аккаунта?");
      if (!confirmed) return;
    }
    await logout();
    window.location.assign("/");
  }

  return (
    <div className="topbar sticky left-0 right-0 top-0 z-40 flex h-12 w-full min-w-0 shrink-0 items-center gap-3 border-b border-border bg-panel/95 px-3 backdrop-blur">
      <div className="topLeft flex min-w-0 flex-1 items-center gap-2 overflow-x-auto whitespace-nowrap">
        <div
          className="brand mr-1 inline-flex shrink-0 items-center text-xl font-black uppercase tracking-[0.08em] text-fg"
          data-testid="topbar-brand-text"
        >
          <span className="bg-gradient-to-r from-fg via-fg to-accent bg-clip-text text-transparent [text-shadow:0_1px_0_rgba(0,0,0,.14)]">PROCESSMAP</span>
        </div>

        <div className="topGroup flex shrink-0 items-center gap-2">
          <button
            type="button"
            className="secondaryBtn h-9 min-h-0 whitespace-nowrap px-3 py-0 text-sm"
            onClick={onNewProject}
            data-testid="topbar-new-project"
          >
            Новый проект
          </button>
          <button
            type="button"
            className="primaryBtn h-9 min-h-0 whitespace-nowrap px-3 py-0 text-sm"
            onClick={newBackendHandler}
            disabled={!projectId}
            title={!projectId ? "Сначала выбери проект" : "Открыть мастер создания сессии"}
            data-testid="topbar-new-session"
          >
            Создать сессию
          </button>
        </div>

        <div className="topGroup flex shrink-0 items-center gap-2">
          <select
            className="select topSelect topSelect--org h-9 min-h-0 w-36 min-w-[9rem] max-w-[12rem] py-0 text-sm md:w-44 md:max-w-[14rem]"
            value={activeOrgId || ""}
            title={selectedOrgTitle}
            onChange={(e) => onOrgChange?.(e.target.value)}
            disabled={!orgList.length || orgList.length < 2}
            data-testid="topbar-org-select"
          >
            <option value="">{orgList.length ? "— выбрать org —" : "Org: default"}</option>
            {orgList.map((org, idx) => {
              const id = orgIdFrom(org);
              return (
                <option key={`${id || "org"}_${idx}`} value={id}>
                  {orgTitleFrom(org)}
                </option>
              );
            })}
          </select>
          {canOpenOrgSettings ? (
            <button
              type="button"
              className="secondaryBtn h-9 min-h-0 whitespace-nowrap px-3 py-0 text-sm"
              onClick={() => onOpenOrgSettings?.()}
              data-testid="topbar-org-settings-btn"
              title="Настройки организации"
            >
              Организация
            </button>
          ) : null}
        </div>

        <div className="topGroup flex shrink-0 items-center gap-2">
          <select
            className="select topSelect topSelect--project h-9 min-h-0 w-40 min-w-[9.5rem] max-w-[12rem] py-0 text-sm md:w-48 md:max-w-[14rem]"
            value={projectId || ""}
            title={selectedProjectTitle}
            onChange={(e) => onProjectChange?.(e.target.value)}
            data-testid="topbar-project-select"
          >
            <option value="">{projList.length ? "— выбрать проект —" : "Нет проектов"}</option>
            {projList.map((p, idx) => {
              const id = projectIdFrom(p);
              const createdBy = shortActor(p?.created_by || p?.owner_user_id);
              const updatedBy = shortActor(p?.updated_by || p?.created_by || p?.owner_user_id);
              return (
                <option key={`${id || "p"}_${idx}`} value={id}>
                  {`${projectTitleFrom(p)} · C:${createdBy} · U:${updatedBy}`}
                </option>
              );
            })}
          </select>
          {canManageProjectEntities ? (
            <button type="button" className="iconBtn h-8 w-8 min-w-8" onClick={() => onDeleteProject?.()} title="Удалить проект" disabled={!projectId}>
              🗑
            </button>
          ) : null}
        </div>

        <div className="topGroup flex shrink-0 items-center gap-2">
          <select
            className="select topSelect topSelect--session h-9 min-h-0 w-44 min-w-[10.5rem] max-w-[13rem] py-0 text-sm md:w-52 md:max-w-[15rem]"
            value={sessionId || ""}
            title={selectedSessionTitle}
            onChange={(e) => openSessionHandler?.(e.target.value)}
            data-testid="topbar-session-select"
          >
            <option value="">{sessList.length ? "— выбрать сессию —" : "Нет сессий"}</option>
            {sessList.map((s, idx) => {
              const id = sessionIdFrom(s);
              const createdBy = shortActor(s?.created_by || s?.owner_user_id);
              const updatedBy = shortActor(s?.updated_by || s?.created_by || s?.owner_user_id);
              return (
                <option key={`${id || "s"}_${idx}`} value={id}>
                  {`${sessionTitleFrom(s)} · C:${createdBy} · U:${updatedBy}`}
                </option>
              );
            })}
          </select>
          {canManageProjectEntities ? (
            <button type="button" className="iconBtn h-8 w-8 min-w-8" onClick={() => onDeleteSession?.()} title="Удалить сессию" disabled={!sessionId}>
              🗑
            </button>
          ) : null}
        </div>
      </div>

      <div className="topCenter hidden min-w-[140px] justify-center md:flex">
        {topCenterHint ? (
          <span className="truncate text-[11px] text-muted" title={topCenterHint}>
            {topCenterHint}
          </span>
        ) : null}
      </div>

      <div className="topRight relative flex min-w-0 shrink-0 items-center justify-end gap-2 overflow-visible whitespace-nowrap">
        <div className="topGroup flex shrink-0 items-center gap-2">
          <button type="button" className="secondaryBtn h-9 min-h-0 whitespace-nowrap px-3 py-0 text-sm" onClick={toggleTheme} title="Переключить тему">
            {uiTheme === "dark" ? "Light" : "Dark"}
          </button>
          <button
            type="button"
            className={`inline-flex h-9 min-h-0 items-center rounded-full border px-3 py-0 text-sm font-semibold ${aiButtonClass}`}
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
            title="Профиль (скоро)"
            aria-label="Профиль (скоро)"
            aria-expanded={accountMenuOpen ? "true" : "false"}
            data-testid="topbar-account-button"
          >
            <UserAvatarIcon className="h-5 w-5" />
          </button>

          {accountMenuOpen ? (
            <div
              ref={accountMenuRef}
              className="fixed z-[120] rounded-xl border border-border bg-panel p-1.5 shadow-panel backdrop-blur"
              style={{
                left: `${Math.round(Number(accountMenuPos.left || 8))}px`,
                top: `${Math.round(Number(accountMenuPos.top || 56))}px`,
                width: `${Math.round(Number(accountMenuPos.width || 220))}px`,
                maxWidth: "calc(100vw - 16px)",
              }}
              data-testid="topbar-account-menu"
            >
              <button
                type="button"
                className="secondaryBtn h-9 w-full justify-start px-3 text-left text-sm opacity-60"
                disabled
                title="Профиль (скоро)"
                data-testid="topbar-account-profile-soon"
              >
                Профиль (скоро)
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
