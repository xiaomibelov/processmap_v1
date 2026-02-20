import { laneColor, laneLabel, normalizeLoose, toText } from "./utils";

export default function BoundariesBlock({
  boundariesComplete,
  uiPrefsDirty,
  uiPrefsSavedAt,
  saveUiPrefs,
  collapsed,
  toggleBlock,
  boundaries,
  patchBoundary,
  boundaryLaneOptions,
  boundaryLaneOptionsFiltered,
  boundariesLaneFilter,
  setBoundariesLaneFilter,
  setUiPrefsDirty,
  intermediateRolesAuto,
  toggleIntermediateBoundaryLane,
}) {
  const laneByName = {};
  const allBoundaryLaneOptions = Array.isArray(boundaryLaneOptions) ? boundaryLaneOptions : [];
  allBoundaryLaneOptions.forEach((lane, idx) => {
    const key = normalizeLoose(lane?.name);
    if (!key || laneByName[key]) return;
    laneByName[key] = {
      label: toText(lane?.label) || laneLabel(lane?.name, lane?.idx),
      color: toText(lane?.color) || laneColor(key, Number(lane?.idx) || idx + 1),
      idx: Number(lane?.idx) || idx + 1,
    };
  });

  const startShop = toText(boundaries.start_shop);
  const finishShop = toText(boundaries.finish_shop);
  const startMeta = laneByName[normalizeLoose(startShop)] || null;
  const finishMeta = laneByName[normalizeLoose(finishShop)] || null;
  const intermediateList = toText(boundaries.intermediate_roles || intermediateRolesAuto)
    .split(",")
    .map((x) => toText(x))
    .filter(Boolean);

  return (
    <div className="interviewBlock">
      <div className="interviewBlockHead">
        <div>
          <div className="interviewBlockTitle">A. Границы процесса</div>
        </div>
        <div className="interviewBlockTools">
          <span className={"badge " + (boundariesComplete ? "ok" : "warn")}>{boundariesComplete ? "Границы заполнены" : "Границы неполные (можно продолжать)"}</span>
          <button type="button" className="secondaryBtn smallBtn" onClick={saveUiPrefs} title={uiPrefsSavedAt ? `Сохранено: ${new Date(uiPrefsSavedAt).toLocaleTimeString()}` : ""}>
            {uiPrefsDirty ? "Сохранить фильтры*" : "Сохранить фильтры"}
          </button>
          <button type="button" className="secondaryBtn smallBtn interviewCollapseBtn" onClick={() => toggleBlock("boundaries")}>
            {collapsed ? "Показать" : "Скрыть"}
          </button>
        </div>
      </div>

      {!collapsed ? (
        <div className="interviewGrid interviewGrid3">
          <div className="interviewBoundaryStatusRow md:col-span-2 xl:col-span-3">
            <span
              className={"interviewBoundaryStatusChip " + (startShop ? "on" : "")}
              style={startMeta ? { "--lane-accent": startMeta.color } : undefined}
            >
              <span className="interviewLaneDot" />
              Start: {startMeta?.label || startShop || "не задан"}
            </span>
            <span
              className={"interviewBoundaryStatusChip " + (finishShop ? "on" : "")}
              style={finishMeta ? { "--lane-accent": finishMeta.color } : undefined}
            >
              <span className="interviewLaneDot" />
              Finish: {finishMeta?.label || finishShop || "не задан"}
            </span>
            {intermediateList.length ? (
              intermediateList.map((name, idx) => {
                const meta = laneByName[normalizeLoose(name)] || null;
                return (
                  <span
                    key={`mid_status_${normalizeLoose(name) || idx}`}
                    className="interviewBoundaryStatusChip on"
                    style={{ "--lane-accent": meta?.color || laneColor(name, idx + 1) }}
                  >
                    <span className="interviewLaneDot" />
                    Intermediate: {meta?.label || name}
                  </span>
                );
              })
            ) : (
              <span className="interviewBoundaryStatusChip">Intermediate: не заданы</span>
            )}
          </div>
          <label className="interviewField">
            <span>Стартовое событие (trigger)</span>
            <input className="input" value={boundaries.trigger} onChange={(e) => patchBoundary("trigger", e.target.value)} placeholder="Напр.: поступила партия сырья" />
          </label>
          <label className="interviewField">
            <span>Стартовый цех</span>
            {/* Keep this exact select class stack to prevent value clipping in Interview boundaries. */}
            <select className="select interviewBoundaryLaneSelect" value={toText(boundaries.start_shop)} onChange={(e) => patchBoundary("start_shop", e.target.value)}>
              <option value="">Выберите лайн</option>
              {boundaryLaneOptionsFiltered.map((lane) => (
                <option key={`start_${lane.name}`} value={lane.name}>
                  ● {lane.label}
                </option>
              ))}
            </select>
          </label>
          <label className="interviewField">
            <span>Финишное состояние (готово)</span>
            <input className="input" value={boundaries.finish_state} onChange={(e) => patchBoundary("finish_state", e.target.value)} placeholder="Напр.: упакованная партия" />
          </label>
          <label className="interviewField">
            <span>Финишный цех</span>
            {/* Keep this exact select class stack to prevent value clipping in Interview boundaries. */}
            <select className="select interviewBoundaryLaneSelect" value={toText(boundaries.finish_shop)} onChange={(e) => patchBoundary("finish_shop", e.target.value)}>
              <option value="">Выберите лайн</option>
              {boundaryLaneOptionsFiltered.map((lane) => (
                <option key={`finish_${lane.name}`} value={lane.name}>
                  ● {lane.label}
                </option>
              ))}
            </select>
          </label>
          <label className="interviewField">
            <span>Промежуточные роли/участки</span>
            <div className="interviewBoundaryLanePicker">
              <input
                className="input"
                value={boundariesLaneFilter}
                onChange={(e) => {
                  setBoundariesLaneFilter(e.target.value);
                  setUiPrefsDirty(true);
                }}
                placeholder="Фильтр лайнов: L1, Бригадир..."
              />
              <div className="interviewBoundaryLaneList">
                {boundaryLaneOptionsFiltered.map((lane) => {
                  const selected = toText(boundaries.intermediate_roles || intermediateRolesAuto)
                    .split(",")
                    .map((x) => normalizeLoose(x))
                    .includes(normalizeLoose(lane.name));
                  return (
                    <button
                      key={`mid_${lane.name}`}
                      type="button"
                      className={"interviewBoundaryLaneBtn " + (selected ? "selected" : "")}
                      style={{ "--lane-accent": lane.color }}
                      onClick={() => toggleIntermediateBoundaryLane(lane.name)}
                    >
                      <span className="interviewLaneDot" />
                      {lane.label}
                    </button>
                  );
                })}
              </div>
              <input
                className="input"
                value={toText(boundaries.intermediate_roles) || intermediateRolesAuto}
                onChange={(e) => patchBoundary("intermediate_roles", e.target.value)}
                placeholder="Авто по BPMN-лайнам"
              />
            </div>
          </label>
        </div>
      ) : null}
    </div>
  );
}
