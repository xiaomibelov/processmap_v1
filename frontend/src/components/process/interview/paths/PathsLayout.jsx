export default function PathsLayout({
  left,
  center,
  right,
  detailsCollapsed = false,
  onToggleDetails,
  hasActiveStep = false,
}) {
  return (
    <div
      className={["interviewPathsWorkbench", hasActiveStep ? "hasSelection" : "isNoSelection"].join(" ")}
      data-testid="interview-paths-layout"
    >
      <aside className="interviewPathsPane interviewPathsPane--nav" data-testid="interview-paths-left-rail">
        {left}
      </aside>

      <section className="interviewPathsPane interviewPathsPane--content" data-testid="interview-paths-center-route">
        {center}
      </section>

      <aside
        className={[
          "interviewPathsPane",
          "interviewPathsPane--details",
          detailsCollapsed ? "isCollapsed" : "",
          hasActiveStep ? "hasSelection" : "",
          hasActiveStep ? "" : "isEmpty",
        ].filter(Boolean).join(" ")}
        data-testid="interview-paths-right-details"
      >
        <div className="interviewPathsPaneHead">
          <div className="interviewPathsRailTitle">Детали шага</div>
          <button
            type="button"
            className="secondaryBtn tinyBtn"
            onClick={() => onToggleDetails?.(!detailsCollapsed)}
            title={detailsCollapsed ? "Развернуть детали" : "Свернуть детали"}
          >
            {detailsCollapsed ? "Показать" : "Свернуть"}
          </button>
        </div>
        {!detailsCollapsed ? right : (
          <div className="muted small">
            {hasActiveStep ? "Выбран шаг. Нажмите «Показать»." : "Выберите шаг в маршруте."}
          </div>
        )}
      </aside>
    </div>
  );
}
