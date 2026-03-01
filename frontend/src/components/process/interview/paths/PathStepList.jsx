function toText(value) {
  return String(value || "").trim();
}

export default function PathStepList({
  title = "Маршрут",
  children,
}) {
  return (
    <div className="interviewPathSteps">
      <div className="interviewPathStepsHead">
        <div className="interviewPathsRailTitle">{toText(title) || "Маршрут"}</div>
      </div>
      <div className="interviewPathsRouteStack" data-testid="interview-paths-route-stack">
        {children}
      </div>
    </div>
  );
}
