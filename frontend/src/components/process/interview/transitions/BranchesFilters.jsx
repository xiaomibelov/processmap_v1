export default function BranchesFilters({
  search,
  filterFrom,
  filterTo,
  conditionMode,
  problematicOnly,
  groupByFrom,
  fromOptions,
  toOptions,
  onSearchChange,
  onFilterFromChange,
  onFilterToChange,
  onConditionModeChange,
  onProblematicOnlyChange,
  onGroupByFromChange,
  onReset,
  totalFilteredCount,
}) {
  return (
    <div className="interviewBranchesFilters">
      <label className="interviewField">
        <span>Поиск</span>
        <input
          className="input"
          value={search}
          onChange={(event) => onSearchChange?.(event.target.value)}
          placeholder="Поиск по шагам / условию"
          data-testid="interview-transition-filter-search"
        />
      </label>
      <label className="interviewField">
        <span>From</span>
        <select
          className="select"
          value={filterFrom}
          onChange={(event) => onFilterFromChange?.(event.target.value)}
          data-testid="interview-transition-filter-from"
        >
          <option value="all">Все</option>
          {fromOptions.map((item) => (
            <option key={`from_opt_${item.value}`} value={item.value}>
              {item.label}
            </option>
          ))}
        </select>
      </label>
      <label className="interviewField">
        <span>To</span>
        <select
          className="select"
          value={filterTo}
          onChange={(event) => onFilterToChange?.(event.target.value)}
          data-testid="interview-transition-filter-to"
        >
          <option value="all">Все</option>
          {toOptions.map((item) => (
            <option key={`to_opt_${item.value}`} value={item.value}>
              {item.label}
            </option>
          ))}
        </select>
      </label>
      <label className="interviewField">
        <span>Условия</span>
        <select
          className="select"
          value={conditionMode}
          onChange={(event) => onConditionModeChange?.(event.target.value)}
          data-testid="interview-transition-filter-condition"
        >
          <option value="all">Все</option>
          <option value="with">Только с условием</option>
          <option value="without">Без условий</option>
        </select>
      </label>
      <div className="interviewBranchesFilterToggles">
        <label className="interviewColsItem">
          <input
            type="checkbox"
            checked={problematicOnly}
            onChange={(event) => onProblematicOnlyChange?.(event.target.checked)}
            data-testid="interview-transition-filter-problematic"
          />
          Проблемные
        </label>
        <label className="interviewColsItem">
          <input
            type="checkbox"
            checked={groupByFrom}
            onChange={(event) => onGroupByFromChange?.(event.target.checked)}
            data-testid="interview-transition-group-by-from"
          />
          Группировать по From
        </label>
      </div>
      <div className="interviewBranchesFilterActions">
        <button type="button" className="secondaryBtn smallBtn" onClick={onReset}>
          Сбросить
        </button>
        <span className="badge">Переходов: {totalFilteredCount}</span>
      </div>
    </div>
  );
}
