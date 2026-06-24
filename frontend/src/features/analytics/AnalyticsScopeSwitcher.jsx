const SCOPE_LABELS = {
  workspace: "Workspace",
  project: "Проект",
  session: "Сессия",
};

export default function AnalyticsScopeSwitcher({
  scope = "workspace",
  scopeId = "",
  workspaceId = "",
  projectId = "",
  sessionId = "",
  onChange,
}) {
  const scopes = [];
  if (workspaceId) scopes.push({ key: "workspace", id: workspaceId });
  if (projectId) scopes.push({ key: "project", id: projectId });
  if (sessionId) scopes.push({ key: "session", id: sessionId });

  if (scopes.length < 2) {
    return (
      <div className="text-xs text-muted uppercase tracking-wide">
        {SCOPE_LABELS[scope] || "Scope"}: <span className="font-medium text-fg">{scopeId}</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1 rounded-lg border border-border bg-panel p-1">
      {scopes.map((item) => {
        const active = scope === item.key;
        return (
          <button
            key={item.key}
            type="button"
            onClick={() => onChange?.(item.key, item.id)}
            className={`rounded-md px-3 py-1 text-xs font-medium transition ${
              active
                ? "bg-accent text-white"
                : "text-muted hover:text-fg hover:bg-panel2"
            }`}
          >
            {SCOPE_LABELS[item.key]}
          </button>
        );
      })}
    </div>
  );
}
