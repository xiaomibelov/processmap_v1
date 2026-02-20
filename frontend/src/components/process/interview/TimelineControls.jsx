import { STEP_TYPES, TIMELINE_OPTIONAL_COLUMNS } from "./utils";

export default function TimelineControls({
  quickStepDraft,
  setQuickStepDraft,
  addQuickStepFromInput,
  addStep,
  subprocessDraft,
  setSubprocessDraft,
  addSubprocessLabel,
  filteredTimelineCount,
  timelineCount,
  isTimelineFiltering,
  resetTimelineFilters,
  saveUiPrefs,
  uiPrefsSavedAt,
  uiPrefsDirty,
  showTimelineColsMenu,
  setShowTimelineColsMenu,
  resetTimelineColumns,
  hiddenTimelineCols,
  toggleTimelineColumn,
  timelineFilters,
  patchTimelineFilter,
  timelineLaneOptions,
  timelineSubprocessOptions,
}) {
  return (
    <>
      <div className="interviewActions" style={{ marginBottom: 10 }}>
        <input
          className="input interviewQuickStepInput"
          value={quickStepDraft}
          onChange={(e) => setQuickStepDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addQuickStepFromInput();
            }
          }}
          placeholder="Быстрый ввод шага: введите действие и нажмите Enter"
        />
        <button type="button" className="secondaryBtn smallBtn" onClick={() => addStep("operation")}>+ Добавить шаг</button>
        <button type="button" className="secondaryBtn smallBtn" onClick={() => addStep("movement")}>+ Перемещение</button>
        <button type="button" className="secondaryBtn smallBtn" onClick={() => addStep("waiting")}>+ Ожидание</button>
        <button type="button" className="secondaryBtn smallBtn" onClick={() => addStep("qc")}>+ QC</button>
        <input
          className="input interviewSubprocessInput"
          value={subprocessDraft}
          onChange={(e) => setSubprocessDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addSubprocessLabel();
            }
          }}
          placeholder="Название подпроцесса"
        />
        <button type="button" className="secondaryBtn smallBtn" onClick={addSubprocessLabel}>+ Подпроцесс</button>
      </div>

      <div className="interviewTimelineToolbar">
        <div className="interviewTimelineToolbarTop">
          <span className="badge">
            Шаги: {filteredTimelineCount}/{timelineCount}
          </span>
          <span className={"badge " + (isTimelineFiltering ? "warn" : "ok")}>
            {isTimelineFiltering ? "Фильтры активны" : "Без фильтров"}
          </span>
          {isTimelineFiltering ? (
            <button type="button" className="secondaryBtn smallBtn" onClick={resetTimelineFilters}>Сбросить фильтры</button>
          ) : null}
          <button type="button" className="secondaryBtn smallBtn" onClick={saveUiPrefs} title={uiPrefsSavedAt ? `Сохранено: ${new Date(uiPrefsSavedAt).toLocaleTimeString()}` : ""}>
            {uiPrefsDirty ? "Сохранить фильтр*" : "Сохранить фильтр"}
          </button>
          <div className="interviewColsMenuWrap">
            <button type="button" className="secondaryBtn smallBtn" onClick={() => setShowTimelineColsMenu((v) => !v)}>
              Фильтр
            </button>
            {showTimelineColsMenu ? (
              <div className="interviewColsMenu">
                <div className="interviewColsMenuHead">
                  <span>Скрыть/показать столбцы</span>
                  <button type="button" className="secondaryBtn smallBtn" onClick={resetTimelineColumns}>Сброс</button>
                </div>
                <div className="interviewColsMenuList">
                  {TIMELINE_OPTIONAL_COLUMNS.map((col) => (
                    <label key={col.key} className="interviewColsItem">
                      <input
                        type="checkbox"
                        checked={!hiddenTimelineCols[col.key]}
                        onChange={() => toggleTimelineColumn(col.key)}
                      />
                      <span>{col.label}</span>
                    </label>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </div>
        <div className="interviewTimelineFilters">
          <input
            className="input interviewFilterControl"
            value={timelineFilters.query}
            onChange={(e) => patchTimelineFilter("query", e.target.value)}
            placeholder="Поиск: шаг, аннотация, узел, роль..."
          />
          <select className="select interviewFilterControl" value={timelineFilters.lane} onChange={(e) => patchTimelineFilter("lane", e.target.value)}>
            <option value="all">Все лайны</option>
            {timelineLaneOptions.map((lane) => (
              <option key={lane.key || lane.name} value={lane.key || lane.name}>
                {lane.label || lane.name}
              </option>
            ))}
          </select>
          <select className="select interviewFilterControl" value={timelineFilters.type} onChange={(e) => patchTimelineFilter("type", e.target.value)}>
            <option value="all">Все типы</option>
            {STEP_TYPES.map((x) => (
              <option key={x.value} value={x.value}>{x.label}</option>
            ))}
          </select>
          <select className="select interviewFilterControl" value={timelineFilters.subprocess} onChange={(e) => patchTimelineFilter("subprocess", e.target.value)}>
            <option value="all">Все подпроцессы</option>
            {timelineSubprocessOptions.map((sp) => (
              <option key={sp} value={sp}>{sp}</option>
            ))}
          </select>
          <select className="select interviewFilterControl" value={timelineFilters.bind} onChange={(e) => patchTimelineFilter("bind", e.target.value)}>
            <option value="all">Все привязки</option>
            <option value="bound">Только привязанные</option>
            <option value="missing">Только без привязки</option>
          </select>
          <select className="select interviewFilterControl" value={timelineFilters.annotation} onChange={(e) => patchTimelineFilter("annotation", e.target.value)}>
            <option value="all">Аннотация BPMN: все</option>
            <option value="with">Аннотация BPMN: заполнена</option>
            <option value="without">Аннотация BPMN: пустая</option>
          </select>
        </div>
        {timelineLaneOptions.length ? (
          <div className="interviewLaneFilterChips">
            <button
              type="button"
              className={"interviewLaneFilterChip " + (timelineFilters.lane === "all" ? "on" : "")}
              onClick={() => patchTimelineFilter("lane", "all")}
            >
              <span className="interviewLaneDot" style={{ "--lane-accent": "hsl(var(--accent2))" }} />
              Все лайны
            </button>
            {timelineLaneOptions.map((lane) => {
              const laneValue = lane.key || lane.name;
              const selected = timelineFilters.lane === laneValue || timelineFilters.lane === lane.name;
              return (
                <button
                  key={`chip_${laneValue}`}
                  type="button"
                  className={"interviewLaneFilterChip " + (selected ? "on" : "")}
                  style={{ "--lane-accent": lane.color }}
                  onClick={() => patchTimelineFilter("lane", selected ? "all" : laneValue)}
                  title={lane.label || lane.name}
                >
                  <span className="interviewLaneDot" />
                  {lane.label || lane.name}
                </button>
              );
            })}
          </div>
        ) : null}
        <div className="interviewFilterChips">
          <button
            type="button"
            className={"interviewFilterChip " + (timelineFilters.bind === "bound" ? "on" : "")}
            onClick={() => patchTimelineFilter("bind", timelineFilters.bind === "bound" ? "all" : "bound")}
          >
            Только привязанные
          </button>
          <button
            type="button"
            className={"interviewFilterChip " + (timelineFilters.bind === "missing" ? "on" : "")}
            onClick={() => patchTimelineFilter("bind", timelineFilters.bind === "missing" ? "all" : "missing")}
          >
            Только без привязки
          </button>
          <button
            type="button"
            className={"interviewFilterChip " + (timelineFilters.annotation === "with" ? "on" : "")}
            onClick={() => patchTimelineFilter("annotation", timelineFilters.annotation === "with" ? "all" : "with")}
          >
            С аннотацией
          </button>
          <button
            type="button"
            className={"interviewFilterChip " + (timelineFilters.annotation === "without" ? "on" : "")}
            onClick={() => patchTimelineFilter("annotation", timelineFilters.annotation === "without" ? "all" : "without")}
          >
            Без аннотации
          </button>
        </div>
      </div>
    </>
  );
}
