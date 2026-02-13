import { useMemo } from "react";

function asArray(x) {
  return Array.isArray(x) ? x : [];
}

export default function TopBar({
  backendStatus,
  backendHint,
  projects,
  projectId,
  onProjectChange,
  onDeleteProject,
  modeFilter,
  onModeFilterChange,
  sessions,
  sessionId,
  onOpenSession,
  onDeleteSession,
  onRefresh,
  onNewProject,
  onNewLocalSession,
  onNewBackendSession,
  leftHidden,
  onToggleLeft,
}) {
  const projList = useMemo(() => asArray(projects), [projects]);
  const sessList = useMemo(() => asArray(sessions), [sessions]);

  const modeOptions = [
    { v: "quick_skeleton", t: "Quick" },
    { v: "deep_audit", t: "Deep" },
  ];

  return (
    <div className="topBar">
      <div className="topBarLeft">
        <div className="brand">
          <b>Food Process Copilot</b>
          <span className={"apiPill " + (backendStatus ? "ok" : "fail")} title={backendHint || ""}>
            {backendStatus ? "API OK" : "API FAIL"}
          </span>
        </div>
      </div>

      <div className="topBarMain">
        <div className="iconBtns" style={{ marginRight: 10 }}>
          <button className="iconBtn" onClick={onToggleLeft} title={leftHidden ? "Показать меню" : "Скрыть меню"}>
            {leftHidden ? "⟩" : "⟨"}
          </button>
        </div>

        <div className="selectWrap">
          <select className="select" value={projectId || ""} onChange={(e) => onProjectChange?.(e.target.value)}>
            <option value="">{projList.length ? "— выбрать проект —" : "Нет проектов"}</option>
            {projList.map((p) => (
              <option key={p.id} value={p.id}>
                {p.title || p.id}
              </option>
            ))}
          </select>
        </div>

        <div className="iconBtns">
          <button className="iconBtn" onClick={() => onDeleteProject?.()} title="Удалить проект" disabled={!projectId}>
            🗑
          </button>
        </div>

        <div className="selectWrap">
          <select className="select" value={modeFilter || "quick_skeleton"} onChange={(e) => onModeFilterChange?.(e.target.value)}>
            {modeOptions.map((m) => (
              <option key={m.v} value={m.v}>
                {m.t}
              </option>
            ))}
          </select>
        </div>

        <div className="selectWrap">
          <select className="select" value={sessionId || ""} onChange={(e) => onOpenSession?.(e.target.value)}>
            <option value="">{sessList.length ? "— выбрать сессию —" : "Нет сессий"}</option>
            {sessList.map((s) => (
              <option key={s.id} value={s.id}>
                {s.title || s.id}
              </option>
            ))}
          </select>
        </div>

        <div className="iconBtns">
          <button className="iconBtn" onClick={() => onDeleteSession?.()} title="Удалить сессию" disabled={!sessionId}>
            🗑
          </button>
        </div>

        <button className="secondaryBtn smallBtn" onClick={onRefresh} title="Обновить списки">
          Обновить
        </button>

        <button className="secondaryBtn smallBtn" onClick={onNewProject}>
          Новый проект
        </button>

        <button className="secondaryBtn smallBtn" onClick={onNewLocalSession} title="Локальная сессия без API">
          Новая (Local)
        </button>

        <button className="primaryBtn smallBtn" onClick={onNewBackendSession} disabled={!projectId} title={!projectId ? "Сначала выбери проект" : "Создать API-сессию"}>
          Новая (API)
        </button>
      </div>
    </div>
  );
}
