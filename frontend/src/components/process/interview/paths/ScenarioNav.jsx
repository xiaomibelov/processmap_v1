function toArray(value) {
  return Array.isArray(value) ? value : [];
}

function toText(value) {
  return String(value || "").trim();
}

export default function ScenarioNav({
  selectedTier = "ALL",
  onSelectTier,
  search = "",
  onSearch,
  sortMode = "bpmn",
  onSortMode,
  sections,
  collapsedGroups,
  onToggleGroup,
  selectedScenarioId,
  onSelectScenario,
  scenarioTitle,
  scenarioStatusClass,
  scenarioStatusLabel,
  scenarioStatusIcon,
  scenarioDurationLabel,
}) {
  const tiers = ["ALL", "P0", "P1", "P2"];
  return (
    <div className="interviewScenarioNav">
      <div className="interviewPathsPaneHead">
        <div className="interviewPathsRailTitle">Сценарии</div>
      </div>

      <div className="interviewScenarioNavControls">
        <div className="interviewScenarioTabs" role="group" aria-label="Фильтр сценариев по tier">
          {tiers.map((tier) => (
            <button
              key={tier}
              type="button"
              className={`secondaryBtn tinyBtn ${selectedTier === tier ? "isActive" : ""}`}
              onClick={() => onSelectTier?.(tier)}
            >
              {tier}
            </button>
          ))}
        </div>

        <input
          className="input"
          value={search}
          onChange={(event) => onSearch?.(event.target.value)}
          placeholder="Поиск сценария"
          aria-label="Поиск сценария"
        />

        <select
          className="select"
          value={sortMode}
          onChange={(event) => onSortMode?.(event.target.value)}
          aria-label="Сортировка сценариев"
        >
          <option value="bpmn">Сортировка: BPMN</option>
          <option value="time">Сортировка: по времени</option>
          <option value="errors">Сортировка: по ошибкам</option>
        </select>
      </div>

      <div className="interviewPathsScenarioRail">
        {toArray(sections).map((section) => {
          const key = toText(section?.key);
          const isCollapsed = !!collapsedGroups?.[key];
          const items = toArray(section?.items);
          return (
            <div key={`scenario_nav_section_${key}`} className="interviewPathsScenarioSection">
              <button
                type="button"
                className="interviewPathsScenarioSectionToggle"
                onClick={() => onToggleGroup?.(key)}
              >
                <span>{toText(section?.title)}</span>
                <span className="muted small">{isCollapsed ? "▶" : "▼"} {items.length}</span>
              </button>

              {!isCollapsed ? items.map((scenario) => {
                const scenarioId = toText(scenario?.id);
                const isActive = scenarioId === toText(selectedScenarioId);
                return (
                  <button
                    key={`scenario_rail_${scenarioId}`}
                    type="button"
                    data-testid={`paths-scenario-item-${scenarioId}`}
                    className={`interviewPathsScenarioRailItem ${isActive ? "isActive" : ""}`}
                    onClick={() => onSelectScenario?.(scenarioId)}
                  >
                    <div className="interviewPathsScenarioRailMain">
                      <span className="interviewScenarioName">
                        <span className={`interviewScenarioDot ${toText(scenarioStatusClass?.(scenario))}`} aria-hidden="true" />
                        <span>{scenarioStatusIcon?.(scenario)} {scenarioTitle?.(scenario)}</span>
                      </span>
                      <span className={`badge ${toText(scenarioStatusClass?.(scenario))}`}>
                        {scenarioStatusLabel?.(scenario)}
                      </span>
                    </div>
                    <div className="interviewPathsScenarioRailMeta muted small">
                      steps {toArray(scenario?.sequence).length} · time {scenarioDurationLabel?.(scenario)}
                    </div>
                  </button>
                );
              }) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
