import { useEffect, useMemo, useState } from "react";
import AiToolsModal from "./AiToolsModal";
import logoLight from "../assets/brand/logo_light.png";
import logoDark from "../assets/brand/logo_dark.png";

function asArray(x) {
  return Array.isArray(x) ? x : [];
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

function sanitizeAiStatusMessage(msg) {
  const raw = String(msg || "").trim();
  if (!raw) return "";
  if (raw.includes("Нажмите «Проверить AI»")) return "";
  return raw;
}

export default function TopBar({
  backendStatus,
  backendHint,
  projects,
  projectId,
  onProjectChange,
  onDeleteProject,
  sessions,
  sessionId,
  onOpenSession,
  onOpen,
  onDeleteSession,
  onRefresh,
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
  leftHidden,
  onToggleLeft,
}) {
  const projList = useMemo(() => asArray(projects), [projects]);
  const sessList = useMemo(() => asArray(sessions), [sessions]);
  const isApiOk = backendStatus === true || backendStatus === "ok";
  const openSessionHandler = onOpenSession || onOpen;
  const newBackendHandler = onNewBackendSession || onNewBackend;
  const [uiTheme, setUiTheme] = useState("dark");
  const [aiToolsOpen, setAiToolsOpen] = useState(false);

  useEffect(() => {
    try {
      const root = document.documentElement;
      const isLight = root.classList.contains("light");
      setUiTheme(isLight ? "light" : "dark");
    } catch {
      setUiTheme("dark");
    }
  }, []);

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
  const verifyLabel =
    verifyState === "ok"
      ? "AI READY"
      : verifyState === "checking"
        ? "AI CHECK..."
        : verifyState === "fail"
          ? "AI ERROR"
          : verifyState === "unknown"
            ? "AI ?"
            : "AI OFF";
  const verifyAtText = llmVerifyAt ? new Date(llmVerifyAt).toLocaleTimeString() : "";
  const aiOk = verifyState === "ok" || (isApiOk && llmHasApiKey);
  const aiPillClass = aiOk
    ? "border-success/45 bg-success/15 text-success"
    : "border-warning/45 bg-warning/15 text-warning";
  const aiPillLabel = aiOk ? "AI OK" : "AI WARN";
  const brandLogo = uiTheme === "dark" ? logoDark : logoLight;
  const safeVerifyMsg = sanitizeAiStatusMessage(llmVerifyMsg);
  const aiHint = safeVerifyMsg || verifyLabel || "";
  const aiHintWithTime = aiHint + (verifyAtText ? ` · ${verifyAtText}` : "");

  return (
    <div className="topbar sticky left-0 right-0 top-0 z-40 flex h-12 w-full min-w-0 shrink-0 items-center gap-2 border-b border-border bg-panel/95 px-3 backdrop-blur">
      <div className="topLeft flex min-w-0 shrink-0 items-center gap-2">
        <div className="brand flex items-center gap-2 text-sm text-fg">
          <img
            src={brandLogo}
            alt="ProcessMap"
            className="block h-8 w-auto object-contain md:h-9"
          />
          <button
            type="button"
            className={`inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-2.5 text-xs font-semibold ${aiPillClass}`}
            onClick={() => setAiToolsOpen(true)}
            title={safeVerifyMsg || backendHint || "AI инструменты"}
          >
            <span className={"h-2 w-2 rounded-full " + (aiOk ? "bg-success" : "bg-warning")} />
            {aiPillLabel}
          </button>
        </div>
      </div>

      <div className="topRight flex min-w-0 flex-1 items-center justify-end gap-2 overflow-x-auto whitespace-nowrap">
        <div className="topGroup flex shrink-0 items-center gap-2">
          {aiHintWithTime ? <span className="hidden truncate text-xs text-muted xl:inline-flex">{aiHintWithTime}</span> : null}
          <button type="button" className="secondaryBtn h-9 min-h-0 whitespace-nowrap px-3 py-0 text-sm" onClick={toggleTheme} title="Переключить тему">
            {uiTheme === "dark" ? "Light" : "Dark"}
          </button>
          <button type="button" className="iconBtn h-8 w-8 min-w-8" onClick={() => onToggleLeft?.("button")} title={leftHidden ? "Показать меню" : "Скрыть меню"}>
            {leftHidden ? "⟩" : "⟨"}
          </button>
        </div>

        <div className="topGroup flex shrink-0 items-center gap-2">
          <select className="select topSelect topSelect--project h-9 min-h-0 w-48 min-w-[11rem] py-0 text-sm md:w-56" value={projectId || ""} onChange={(e) => onProjectChange?.(e.target.value)}>
            <option value="">{projList.length ? "— выбрать проект —" : "Нет проектов"}</option>
            {projList.map((p, idx) => {
              const id = projectIdFrom(p);
              return (
                <option key={`${id || "p"}_${idx}`} value={id}>
                  {projectTitleFrom(p)}
                </option>
              );
            })}
          </select>
          <button type="button" className="iconBtn h-8 w-8 min-w-8" onClick={() => onDeleteProject?.()} title="Удалить проект" disabled={!projectId}>
            🗑
          </button>
        </div>

        <div className="topGroup flex shrink-0 items-center gap-2">
          <select className="select topSelect topSelect--session h-9 min-h-0 w-64 min-w-[14rem] py-0 text-sm lg:w-72" value={sessionId || ""} onChange={(e) => openSessionHandler?.(e.target.value)}>
            <option value="">{sessList.length ? "— выбрать сессию —" : "Нет сессий"}</option>
            {sessList.map((s, idx) => {
              const id = sessionIdFrom(s);
              return (
                <option key={`${id || "s"}_${idx}`} value={id}>
                  {sessionTitleFrom(s)}
                </option>
              );
            })}
          </select>
          <button type="button" className="iconBtn h-8 w-8 min-w-8" onClick={() => onDeleteSession?.()} title="Удалить сессию" disabled={!sessionId}>
            🗑
          </button>
        </div>

        <div className="topGroup flex shrink-0 items-center gap-2">
          <button type="button" className="secondaryBtn h-9 min-h-0 whitespace-nowrap px-3 py-0 text-sm" onClick={onRefresh} title="Обновить списки">
            Обновить
          </button>

          <button type="button" className="secondaryBtn h-9 min-h-0 whitespace-nowrap px-3 py-0 text-sm" onClick={onNewProject}>
            Новый проект
          </button>

          <button
            type="button"
            className="primaryBtn h-9 min-h-0 whitespace-nowrap px-3 py-0 text-sm"
            onClick={newBackendHandler}
            disabled={!projectId}
            title={!projectId ? "Сначала выбери проект" : "Открыть мастер создания сессии"}
          >
            Создать сессию
          </button>
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
