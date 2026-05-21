const MODULES = [
  {
    id: "registry",
    title: "Реестр действий",
    description: "Действия с продуктом из сессий и проектов.",
    testId: "analytics-hub-module-registry",
    actionTestId: "analytics-hub-open-registry",
    action: "Открыть",
  },
  {
    id: "properties",
    title: "Реестр свойств",
    description: "Свойства BPMN-элементов и процессных объектов.",
    testId: "analytics-hub-module-properties",
    actionTestId: "analytics-hub-open-properties",
    action: "Открыть",
  },
  {
    id: "dashboards",
    title: "Дашборды",
    description: "Сводные аналитические панели будут подключены отдельным контуром.",
    testId: "analytics-hub-module-dashboards",
    action: "Будет позже",
  },
];

export default function ProcessAnalyticsHub({
  workspaceId = "",
  projectId = "",
  sessionId = "",
  onOpenProductActionsRegistry = null,
  onOpenPropertiesRegistry = null,
  onClose = null,
}) {
  const contextLine = sessionId
    ? "Scope: сессия"
    : projectId
      ? "Scope: проект"
      : workspaceId
        ? "Scope: workspace"
        : "Scope будет выбран текущим контекстом.";

  return (
    <main className="processAnalyticsHubPage" data-testid="process-analytics-hub-page">
      <section className="processAnalyticsHubSurface">
        <header className="processAnalyticsHubHeader">
          <div>
            <h1>Аналитика</h1>
            <p>Единая точка входа для реестров и будущих аналитических панелей.</p>
            <small>{contextLine}</small>
          </div>
          {onClose ? (
            <button type="button" className="secondaryBtn smallBtn" onClick={onClose} data-testid="analytics-hub-close">
              Вернуться
            </button>
          ) : null}
        </header>

        <div className="processAnalyticsHubModules" aria-label="Модули аналитики">
          {MODULES.map((module) => {
            const handler = module.id === "registry"
              ? onOpenProductActionsRegistry
              : module.id === "properties"
                ? onOpenPropertiesRegistry
                : null;
            return (
              <article className="processAnalyticsHubModule" data-testid={module.testId} key={module.id}>
                <div>
                  <h2>{module.title}</h2>
                  <p>{module.description}</p>
                </div>
                {handler ? (
                  <button
                    type="button"
                    className="primaryBtn smallBtn"
                    onClick={() => handler({
                      scope: sessionId ? "session" : projectId ? "project" : "workspace",
                      workspaceId,
                      projectId,
                      sessionId,
                      returnTo: "analytics",
                    })}
                    data-testid={module.actionTestId}
                  >
                    {module.action}
                  </button>
                ) : (
                  <span className="processAnalyticsHubPlaceholder">{module.action}</span>
                )}
              </article>
            );
          })}
        </div>
      </section>
    </main>
  );
}
