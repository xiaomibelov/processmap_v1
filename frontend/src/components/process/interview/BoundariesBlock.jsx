import { useEffect, useMemo, useRef, useState } from "react";
import { laneColor, laneLabel, normalizeLoose, toText } from "./utils";
import BoundsSummaryRow from "./BoundsSummaryRow";
import BoundsCardStart from "./BoundsCardStart";
import BoundsCardIntermediateMultiSelect from "./BoundsCardIntermediateMultiSelect";
import BoundsCardFinish from "./BoundsCardFinish";

function parseCsvList(raw) {
  const out = [];
  const seen = new Set();
  String(raw || "")
    .split(",")
    .map((item) => toText(item))
    .filter(Boolean)
    .forEach((name) => {
      const key = normalizeLoose(name);
      if (!key || seen.has(key)) return;
      seen.add(key);
      out.push(name);
    });
  return out;
}

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
  resetBoundaries,
}) {
  const [showAllOptions, setShowAllOptions] = useState(false);
  const [saveNotice, setSaveNotice] = useState("");
  const [focusCard, setFocusCard] = useState("");
  const startRef = useRef(null);
  const intermediateRef = useRef(null);
  const finishRef = useRef(null);

  useEffect(() => {
    if (!saveNotice) return undefined;
    const timer = window.setTimeout(() => setSaveNotice(""), 1800);
    return () => window.clearTimeout(timer);
  }, [saveNotice]);

  useEffect(() => {
    if (!focusCard) return undefined;
    const timer = window.setTimeout(() => setFocusCard(""), 1100);
    return () => window.clearTimeout(timer);
  }, [focusCard]);

  const laneByName = useMemo(() => {
    const map = {};
    const options = Array.isArray(boundaryLaneOptions) ? boundaryLaneOptions : [];
    options.forEach((lane, idx) => {
      const key = normalizeLoose(lane?.name);
      if (!key || map[key]) return;
      map[key] = {
        label: toText(lane?.label) || laneLabel(lane?.name, lane?.idx),
        color: toText(lane?.color) || laneColor(key, Number(lane?.idx) || idx + 1),
      };
    });
    return map;
  }, [boundaryLaneOptions]);

  const startShop = toText(boundaries?.start_shop);
  const finishShop = toText(boundaries?.finish_shop);
  const trigger = toText(boundaries?.trigger);
  const finishState = toText(boundaries?.finish_state);
  const intermediateList = useMemo(
    () => parseCsvList(toText(boundaries?.intermediate_roles) || intermediateRolesAuto),
    [boundaries?.intermediate_roles, intermediateRolesAuto],
  );

  const startMeta = laneByName[normalizeLoose(startShop)] || null;
  const finishMeta = laneByName[normalizeLoose(finishShop)] || null;
  const startFilled = !!trigger && !!startShop;
  const finishFilled = !!finishState && !!finishShop;
  const intermediateFilled = intermediateList.length > 0;

  function setIntermediateList(nextList) {
    patchBoundary("intermediate_roles", parseCsvList(nextList.join(", ")).join(", "));
  }

  function toggleIntermediateLane(laneName) {
    const lane = toText(laneName);
    if (!lane) return;
    const has = intermediateList.some((item) => normalizeLoose(item) === normalizeLoose(lane));
    const next = has
      ? intermediateList.filter((item) => normalizeLoose(item) !== normalizeLoose(lane))
      : [...intermediateList, lane];
    setIntermediateList(next);
  }

  function selectAllIntermediate() {
    const all = (Array.isArray(boundaryLaneOptions) ? boundaryLaneOptions : [])
      .map((lane) => toText(lane?.name))
      .filter(Boolean);
    setIntermediateList(all);
  }

  function clearIntermediate() {
    patchBoundary("intermediate_roles", "");
  }

  function scrollToCard(kind) {
    const key = toText(kind);
    const ref = key === "start" ? startRef : key === "finish" ? finishRef : intermediateRef;
    if (collapsed) {
      toggleBlock("boundaries");
      window.setTimeout(() => {
        ref.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
        setFocusCard(key);
      }, 80);
      return;
    }
    ref.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    setFocusCard(key);
  }

  function handleSaveBoundaries() {
    saveUiPrefs?.();
    setSaveNotice("Границы сохранены");
  }

  function handleResetBoundaries() {
    resetBoundaries?.();
    setBoundariesLaneFilter("");
    setShowAllOptions(false);
    setSaveNotice("Границы сброшены");
  }

  return (
    <div className="interviewBlock interviewBoundsPanel">
      <div className="interviewBoundsHead sticky top-0 z-20">
        <div>
          <div className="interviewBlockTitle">A. Границы процесса</div>
          <div className="interviewBoundsSubTitle">
            START · INTERMEDIATE · FINISH
          </div>
        </div>
        <div className="interviewBlockTools interviewBoundsActions">
          <button
            type="button"
            className="primaryBtn smallBtn interviewBoundsAction interviewBoundsAction--primary"
            onClick={handleSaveBoundaries}
            title={uiPrefsSavedAt ? `Сохранено: ${new Date(uiPrefsSavedAt).toLocaleTimeString()}` : ""}
          >
            {uiPrefsDirty ? "Сохранить границы*" : "Сохранить границы"}
          </button>
          <button
            type="button"
            className="secondaryBtn smallBtn interviewBoundsAction interviewBoundsAction--secondary"
            onClick={handleResetBoundaries}
          >
            Сбросить
          </button>
          <button
            type="button"
            className="secondaryBtn smallBtn interviewBoundsAction interviewBoundsAction--tertiary interviewCollapseBtn"
            onClick={() => toggleBlock("boundaries")}
          >
            {collapsed ? "Показать" : "Скрыть"}
          </button>
          <span className={`badge interviewBoundsStatusBadge ${boundariesComplete ? "ok" : "warn"}`}>
            {boundariesComplete ? "Границы заполнены" : "Не заполнено"}
          </span>
        </div>
      </div>

      <BoundsSummaryRow
        startLabel={startMeta?.label || startShop || "не выбрано"}
        intermediateCount={intermediateList.length}
        finishLabel={finishMeta?.label || finishShop || "не выбрано"}
        onFocusStart={() => scrollToCard("start")}
        onFocusIntermediate={() => scrollToCard("intermediate")}
        onFocusFinish={() => scrollToCard("finish")}
        onEdit={() => scrollToCard("intermediate")}
      />

      {saveNotice ? <div className="interviewBoundsSaveNotice">{saveNotice}</div> : null}

      {collapsed ? (
        <div className="interviewBoundsCollapsedLine">
          Start: {startMeta?.label || startShop || "—"} • Intermediate: {intermediateList.length || 0} • Finish: {finishMeta?.label || finishShop || "—"}
        </div>
      ) : (
        <div className="interviewBoundsGrid">
          <BoundsCardStart
            cardRef={startRef}
            missing={!startFilled}
            focused={focusCard === "start"}
            startShop={startShop}
            trigger={trigger}
            laneOptions={boundaryLaneOptionsFiltered}
            onStartShopChange={(value) => patchBoundary("start_shop", value)}
            onTriggerChange={(value) => patchBoundary("trigger", value)}
          />

          <BoundsCardIntermediateMultiSelect
            cardRef={intermediateRef}
            missing={!intermediateFilled}
            focused={focusCard === "intermediate"}
            laneFilter={boundariesLaneFilter}
            onLaneFilterChange={(value) => {
              setBoundariesLaneFilter(value);
              setUiPrefsDirty(true);
            }}
            laneOptions={boundaryLaneOptionsFiltered}
            selectedList={intermediateList}
            onToggleLane={toggleIntermediateLane}
            onSelectAll={selectAllIntermediate}
            onClear={clearIntermediate}
            rawValue={toText(boundaries?.intermediate_roles) || intermediateRolesAuto}
            onRawValueChange={(value) => patchBoundary("intermediate_roles", value)}
            showAllOptions={showAllOptions}
            onToggleShowAllOptions={setShowAllOptions}
          />

          <BoundsCardFinish
            cardRef={finishRef}
            missing={!finishFilled}
            focused={focusCard === "finish"}
            finishShop={finishShop}
            finishState={finishState}
            laneOptions={boundaryLaneOptionsFiltered}
            onFinishShopChange={(value) => patchBoundary("finish_shop", value)}
            onFinishStateChange={(value) => patchBoundary("finish_state", value)}
          />
        </div>
      )}
    </div>
  );
}
