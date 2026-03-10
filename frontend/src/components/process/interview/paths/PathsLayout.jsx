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
      className={[
        "interviewPathsWorkbench",
        hasActiveStep ? "hasSelection" : "isNoSelection",
        detailsCollapsed ? "isDetailsCollapsed" : "",
      ].join(" ")}
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
        {detailsCollapsed ? (
          <div className="interviewPathsPaneCollapsed">
            <button
              type="button"
              className="secondaryBtn tinyBtn interviewPathsPaneCollapsedBtn"
              onClick={() => onToggleDetails?.(false)}
              title={hasActiveStep ? "Показать детали шага" : "Показать панель деталей"}
            >
              Показать
            </button>
          </div>
        ) : (
          <>
            <div className="interviewPathsPaneHead">
              <div className="interviewPathsRailTitle">Детали шага</div>
              <button
                type="button"
                className="secondaryBtn tinyBtn"
                onClick={() => onToggleDetails?.(true)}
                title="Свернуть детали"
              >
                Свернуть
              </button>
            </div>
            {right}
          </>
        )}
      </aside>
    </div>
  );
}
