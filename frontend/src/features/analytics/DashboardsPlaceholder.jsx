export default function DashboardsPlaceholder({
  workspaceId = "",
  projectId = "",
  sessionId = "",
  onClose = null,
  onOpenProductActionsRegistry = null,
  onOpenPropertiesRegistry = null,
}) {
  const scopeLabel = sessionId
    ? "сессия"
    : projectId
      ? "проект"
      : workspaceId
        ? "workspace"
        : "весь workspace";

  return (
    <main className="dashboardsPlaceholderPage" data-testid="dashboards-placeholder-page">
      <section className="dashboardsPlaceholderSurface">
        <header className="dashboardsPlaceholderHeader">
          <div>
            <h1>Дашборды</h1>
            <p>Scope: {scopeLabel}</p>
          </div>
          {onClose ? (
            <button type="button" className="secondaryBtn smallBtn" onClick={onClose} data-testid="dashboards-placeholder-close">
              Вернуться
            </button>
          ) : null}
        </header>

        <div className="dashboardsPlaceholderBody" data-testid="dashboards-placeholder-body">
          <p className="dashboardsPlaceholderTitle">Будет позже</p>
          <p className="dashboardsPlaceholderHint">
            Аналитические панели и визуализации будут подключены отдельным контуром.
          </p>
          <div className="dashboardsPlaceholderLinks">
            {onOpenProductActionsRegistry ? (
              <button
                type="button"
                className="primaryBtn smallBtn"
                onClick={() => onOpenProductActionsRegistry({ workspaceId, projectId, sessionId })}
                data-testid="dashboards-link-product-actions"
              >
                Реестр действий
              </button>
            ) : null}
            {onOpenPropertiesRegistry ? (
              <button
                type="button"
                className="primaryBtn smallBtn"
                onClick={() => onOpenPropertiesRegistry({ workspaceId, projectId, sessionId })}
                data-testid="dashboards-link-properties"
              >
                Реестр свойств
              </button>
            ) : null}
          </div>
        </div>
      </section>
    </main>
  );
}
