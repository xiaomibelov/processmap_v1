const SCOPE_LABELS = {
  workspace: "Workspace",
  project: "Проект",
  session: "Сессия",
};

const ALL_SCOPES = ["workspace", "project", "session"];

export default function AnalyticsScopeSwitcher({
  scope = "workspace",
  scopeId = "",
  workspaceId = "",
  projectId = "",
  sessionId = "",
  onChange,
}) {
  const ids = { workspace: workspaceId, project: projectId, session: sessionId };

  return (
    <div className="analyticsScopeSwitcher" role="tablist" aria-label="Переключение scope">
      {ALL_SCOPES.map((key) => {
        const active = scope === key;
        const available = Boolean(ids[key]);
        return (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={active}
            disabled={!available}
            title={available ? undefined : `Нет доступного ${SCOPE_LABELS[key]}`}
            onClick={() => available && onChange?.(key, ids[key])}
            className={`analyticsScopeSwitcherBtn ${active ? "analyticsScopeSwitcherBtn--active" : ""} ${!available ? "analyticsScopeSwitcherBtn--disabled" : ""}`}
          >
            {SCOPE_LABELS[key]}
          </button>
        );
      })}
    </div>
  );
}
