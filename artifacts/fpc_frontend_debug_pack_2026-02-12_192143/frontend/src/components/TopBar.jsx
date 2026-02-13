import { useMemo } from "react";

const MODE_OPTIONS = [
  { value: "", label: "Все режимы" },
  { value: "quick_skeleton", label: "Quick" },
  { value: "deep_audit", label: "Deep audit" },
];

export default function TopBar({
  backendStatus,
  backendHint,
  projects,
  projectId,
  onProjectChange,
  modeFilter,
  onModeFilterChange,
  sessionId,
  sessions,
  onOpen,
  onRefresh,
  onNewProject,
  onNewLocal,
  onNewBackend,
}) {
  const badge = useMemo(() => {
    if (backendStatus === "ok") return <span className="badge ok">API OK</span>;
    if (backendStatus === "fail") return <span className="badge err">API FAIL</span>;
    return <span className="badge">API …</span>;
  }, [backendStatus]);

  const hasProjects = (projects || []).length > 0;
  const canCreateApiSession = Boolean(projectId);

  return (
    <div className="topbar">
      <div className="topLeft">
        <div className="brand">Food Process Copilot</div>
        {badge}
        {backendHint ? <div className="hint">{backendHint}</div> : null}
      </div>

      <div className="topRight">
        <select
          className="select"
          value={projectId || ""}
          onChange={(e) => onProjectChange?.(e.target.value || "")}
          title="Проект"
        >
          <option value="">— проект —</option>
          {(projects || []).map((p) => (
            <option key={p.id} value={p.id}>
              {p.title || p.id}
            </option>
          ))}
        </select>

        <select
          className="select"
          value={modeFilter || ""}
          onChange={(e) => onModeFilterChange?.(e.target.value || "")}
          title="Фильтр по режиму"
          disabled={!hasProjects}
        >
          {MODE_OPTIONS.map((m) => (
            <option key={m.value} value={m.value}>
              {m.label}
            </option>
          ))}
        </select>

        <select
          className="select"
          value={sessionId || ""}
          onChange={(e) => onOpen?.(e.target.value)}
          title="Сессия"
        >
          <option value="">— выбрать сессию —</option>
          {(sessions || []).map((s) => {
            const id = s.session_id || s.id;
            const title = s.title || id;
            return (
              <option key={id} value={id}>
                {title}
              </option>
            );
          })}
        </select>

        <button className="secondaryBtn" onClick={onRefresh} title="Обновить список проектов/сессий">
          Обновить
        </button>
        <button className="secondaryBtn" onClick={onNewProject} title="Создать проект">
          Новый проект
        </button>
        <button className="secondaryBtn" onClick={onNewLocal} title="Создать локальный черновик">
          Новая (Local)
        </button>
        <button
          className="primaryBtn smallBtn"
          onClick={() => onNewBackend?.(modeFilter || "quick_skeleton")}
          disabled={!canCreateApiSession}
          title={canCreateApiSession ? "Создать сессию в проекте" : "Сначала выбери или создай проект"}
        >
          Новая (API)
        </button>
      </div>
    </div>
  );
}
