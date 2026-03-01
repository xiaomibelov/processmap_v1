import { useEffect, useMemo, useRef, useState } from "react";
import { STEP_TYPES, TIMELINE_OPTIONAL_COLUMNS, toArray, toText } from "./utils";

function dedupList(values) {
  const out = [];
  const seen = new Set();
  values.forEach((item) => {
    const value = toText(item);
    if (!value || seen.has(value)) return;
    seen.add(value);
    out.push(value);
  });
  return out;
}

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
  selectedStepCount,
  onGroupSelectedSteps,
  orderMode,
  graphOrderLocked,
  bpmnOrderFallback = false,
  bpmnOrderHint = "",
  onSetOrderMode,
  onOpenBindingAssistant,
  bindingIssueCount,
  statusCounts,
  dodSnapshot,
  timelineViewMode = "matrix",
  onSetTimelineViewMode,
  branchViewMode = "tree",
  onSetBranchViewMode,
  onToggleCollapse,
  devDebugEnabled = false,
  onToggleDebug,
}) {
  const FILTER_QUERY_DEBOUNCE_MS = 180;
  const [showMoreActions, setShowMoreActions] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [lanePickerOpen, setLanePickerOpen] = useState(false);
  const [laneSearch, setLaneSearch] = useState("");
  const [queryDraft, setQueryDraft] = useState(() => toText(timelineFilters?.query));
  const patchTimelineFilterRef = useRef(patchTimelineFilter);

  const laneByKey = useMemo(() => {
    const out = {};
    toArray(timelineLaneOptions).forEach((lane) => {
      const key = toText(lane?.key || lane?.name);
      if (!key) return;
      out[key] = lane;
    });
    return out;
  }, [timelineLaneOptions]);

  useEffect(() => {
    patchTimelineFilterRef.current = patchTimelineFilter;
  }, [patchTimelineFilter]);

  useEffect(() => {
    setQueryDraft(toText(timelineFilters?.query));
  }, [timelineFilters?.query]);

  useEffect(() => {
    const currentQuery = toText(timelineFilters?.query);
    if (queryDraft === currentQuery) return undefined;
    const timer = window.setTimeout(() => {
      patchTimelineFilterRef.current?.("query", queryDraft);
    }, FILTER_QUERY_DEBOUNCE_MS);
    return () => {
      window.clearTimeout(timer);
    };
  }, [queryDraft, timelineFilters?.query]);

  const selectedLanes = useMemo(() => {
    const fromMulti = dedupList(toArray(timelineFilters?.lanes));
    if (fromMulti.length) return fromMulti;
    const single = toText(timelineFilters?.lane);
    if (!single || single === "all") return [];
    return [single];
  }, [timelineFilters?.lanes, timelineFilters?.lane]);

  const filteredLaneOptions = useMemo(() => {
    const q = toText(laneSearch).toLowerCase();
    if (!q) return toArray(timelineLaneOptions);
    return toArray(timelineLaneOptions).filter((lane) => {
      const label = toText(lane?.label || lane?.name).toLowerCase();
      return label.includes(q);
    });
  }, [timelineLaneOptions, laneSearch]);

  const laneSummary = useMemo(() => {
    if (!selectedLanes.length) return "Все лайны";
    const labels = selectedLanes.map((laneKey) => toText(laneByKey[laneKey]?.label || laneByKey[laneKey]?.name || laneKey));
    if (labels.length <= 3) return labels.join(" · ");
    return `${labels.slice(0, 3).join(" · ")} +${labels.length - 3}`;
  }, [selectedLanes, laneByKey]);

  const filterSummary = useMemo(() => {
    const parts = [];
    const query = toText(timelineFilters?.query);
    if (query) parts.push(`поиск="${query}"`);
    if (selectedLanes.length) parts.push(`лайны=${selectedLanes.length}`);
    if (toText(timelineFilters?.type) && timelineFilters.type !== "all") parts.push(`тип=${timelineFilters.type}`);
    if (toText(timelineFilters?.subprocess) && timelineFilters.subprocess !== "all") parts.push(`подпроцесс=${timelineFilters.subprocess}`);
    if (toText(timelineFilters?.bind) && timelineFilters.bind !== "all") parts.push(`привязки=${timelineFilters.bind}`);
    if (toText(timelineFilters?.annotation) && timelineFilters.annotation !== "all") parts.push(`аннотации=${timelineFilters.annotation}`);
    if (toText(timelineFilters?.ai) && timelineFilters.ai !== "all") parts.push(`AI=${timelineFilters.ai}`);
    const tiers = dedupList(toArray(timelineFilters?.tiers));
    if (tiers.length && tiers.length < 4) parts.push(`tiers=${tiers.join("/")}`);
    return parts.length ? parts.join(" · ") : "Фильтры не заданы";
  }, [timelineFilters, selectedLanes.length]);

  const selectedTiers = useMemo(() => {
    const raw = dedupList(toArray(timelineFilters?.tiers).map((x) => String(x || "").toUpperCase()));
    const normalized = raw.map((tier) => (tier === "NONE" ? "None" : tier)).filter((tier) => (
      tier === "P0" || tier === "P1" || tier === "P2" || tier === "None"
    ));
    return normalized.length ? normalized : ["P0", "P1", "P2", "None"];
  }, [timelineFilters?.tiers]);

  const tierCounts = useMemo(() => {
    const source = (dodSnapshot && typeof dodSnapshot === "object")
      ? (dodSnapshot?.counts?.tiers || {})
      : {};
    return {
      P0: Number(source?.P0 || 0),
      P1: Number(source?.P1 || 0),
      P2: Number(source?.P2 || 0),
      None: Number(source?.None || 0),
    };
  }, [dodSnapshot]);

  const activeFilterChips = useMemo(() => {
    const chips = [];
    const query = toText(timelineFilters?.query);
    if (query) chips.push(`Поиск: ${query}`);
    if (selectedLanes.length) chips.push(`Лайны: ${selectedLanes.length}`);
    if (toText(timelineFilters?.type) && timelineFilters.type !== "all") chips.push(`Тип: ${timelineFilters.type}`);
    if (toText(timelineFilters?.subprocess) && timelineFilters.subprocess !== "all") chips.push(`Подпроцесс: ${timelineFilters.subprocess}`);
    if (toText(timelineFilters?.bind) && timelineFilters.bind !== "all") chips.push(`Привязки: ${timelineFilters.bind}`);
    if (toText(timelineFilters?.annotation) && timelineFilters.annotation !== "all") chips.push(`Аннотации: ${timelineFilters.annotation}`);
    if (toText(timelineFilters?.ai) && timelineFilters.ai !== "all") chips.push(`AI: ${timelineFilters.ai}`);
    const tiers = selectedTiers.filter((tier) => tier !== "None");
    if (tiers.length && tiers.length < 3) chips.push(`Tier: ${tiers.join(",")}`);
    if (selectedTiers.includes("None") && selectedTiers.length < 4) chips.push("Без tier");
    return chips;
  }, [timelineFilters, selectedLanes.length, selectedTiers]);

  const activeFiltersCount = activeFilterChips.length;

  function applyLaneSelection(nextList) {
    const cleaned = dedupList(nextList);
    patchTimelineFilter("lanes", cleaned);
    patchTimelineFilter("lane", cleaned.length === 1 ? cleaned[0] : "all");
  }

  function toggleLaneValue(laneValue) {
    const value = toText(laneValue);
    if (!value) return;
    const set = new Set(selectedLanes);
    if (set.has(value)) set.delete(value);
    else set.add(value);
    applyLaneSelection(Array.from(set));
  }

  function setQuickPreset(kind) {
    if (kind === "missing_bind") {
      patchTimelineFilter("bind", timelineFilters.bind === "missing" ? "all" : "missing");
      return;
    }
    if (kind === "without_annotation") {
      patchTimelineFilter("annotation", timelineFilters.annotation === "without" ? "all" : "without");
      return;
    }
    if (kind === "with_ai") {
      patchTimelineFilter("ai", timelineFilters.ai === "with" ? "all" : "with");
    }
  }

  function toggleTierValue(tierRaw) {
    const tier = String(tierRaw || "");
    if (!(tier === "P0" || tier === "P1" || tier === "P2" || tier === "None")) return;
    const set = new Set(selectedTiers);
    if (set.has(tier)) {
      if (set.size === 1) return;
      set.delete(tier);
    } else {
      set.add(tier);
    }
    patchTimelineFilter("tiers", Array.from(set));
  }

  return (
    <div className="interviewTimelineToolbar rounded-xl border border-border bg-panel2/55 p-2.5">
      <div className="interviewTimelinePrimaryRow">
        <button type="button" className="primaryBtn smallBtn" onClick={() => addStep("operation")} data-testid="interview-add-step-primary">
          + Добавить шаг
        </button>

        <input
          className="input interviewTimelinePrimarySearch"
          value={queryDraft}
          onChange={(e) => setQueryDraft(e.target.value)}
          placeholder="Поиск: шаг, аннотация, узел, роль..."
          aria-label="Поиск шагов"
        />

        <div className="interviewBranchViewToggle" role="group" aria-label="Режим отображения">
          <button
            type="button"
            className={`secondaryBtn smallBtn interviewBranchViewBtn ${timelineViewMode === "diagram" ? "isActive" : ""}`}
            data-testid="interview-view-mode-diagram-btn"
            onClick={() => onSetTimelineViewMode?.("diagram")}
          >
            Diagram
          </button>
          <button
            type="button"
            className={`secondaryBtn smallBtn interviewBranchViewBtn ${timelineViewMode === "matrix" ? "isActive" : ""}`}
            data-testid="interview-view-mode-matrix-btn"
            onClick={() => onSetTimelineViewMode?.("matrix")}
          >
            Matrix
          </button>
          <button
            type="button"
            className={`secondaryBtn smallBtn interviewBranchViewBtn ${timelineViewMode === "paths" ? "isActive" : ""}`}
            data-testid="interview-view-mode-paths-btn"
            onClick={() => onSetTimelineViewMode?.("paths")}
          >
            Paths
          </button>
        </div>

        <select
          className="select interviewSortSelect"
          value={orderMode === "bpmn" ? "bpmn" : "interview"}
          onChange={(e) => onSetOrderMode?.(e.target.value)}
          aria-label="Сортировка шагов"
          data-testid="interview-order-select"
        >
          <option value="bpmn">Сортировка: BPMN</option>
          <option value="interview">Сортировка: Creation</option>
          <option value="manual" disabled>Сортировка: Manual (скоро)</option>
        </select>

        <button type="button" className="secondaryBtn smallBtn" onClick={() => setFiltersOpen((prev) => !prev)}>
          Фильтры ({activeFiltersCount})
        </button>

        <div className="interviewColsMenuWrap">
          <button
            type="button"
            className="secondaryBtn smallBtn"
            data-testid="interview-step-more-btn"
            onClick={() => setShowMoreActions((v) => !v)}
          >
            Действия ▾
          </button>
          {showMoreActions ? (
            <div className="interviewColsMenu" style={{ minWidth: 300 }}>
              <div className="interviewColsMenuHead">
                <span>Действия</span>
                <button type="button" className="secondaryBtn smallBtn" onClick={() => setShowMoreActions(false)}>
                  Закрыть
                </button>
              </div>
              <div className="interviewColsMenuList">
                <button type="button" className="secondaryBtn smallBtn" onClick={() => addStep("movement")}>+ Перемещение</button>
                <button type="button" className="secondaryBtn smallBtn" onClick={() => addStep("waiting")}>+ Ожидание</button>
                <button type="button" className="secondaryBtn smallBtn" onClick={() => addStep("qc")}>+ QC</button>
                <button
                  type="button"
                  className="secondaryBtn smallBtn"
                  data-testid="binding-assistant-open"
                  onClick={() => onOpenBindingAssistant?.()}
                >
                  Привязки ({Number(bindingIssueCount || 0)})
                </button>
                <div className="col-span-2 flex flex-wrap items-center gap-2">
                  <span className="muted small">Ветки:</span>
                  <button
                    type="button"
                    className={`secondaryBtn smallBtn interviewBranchViewBtn ${branchViewMode === "tree" ? "isActive" : ""}`}
                    data-testid="interview-branch-view-tree-btn"
                    onClick={() => onSetBranchViewMode?.("tree")}
                  >
                    Дерево
                  </button>
                  <button
                    type="button"
                    className={`secondaryBtn smallBtn interviewBranchViewBtn ${branchViewMode === "cards" ? "isActive" : ""}`}
                    data-testid="interview-branch-view-cards-btn"
                    onClick={() => onSetBranchViewMode?.("cards")}
                  >
                    Карточки
                  </button>
                </div>
                <div className="inputRow col-span-2" style={{ alignItems: "center", gap: 8 }}>
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
                <div className="interviewMoreSection" data-testid="interview-group-selection-section">
                  <span className="muted small">Выделено шагов: {Number(selectedStepCount || 0)}</span>
                  <button
                    type="button"
                    className="secondaryBtn smallBtn"
                    data-testid="interview-group-subprocess-btn"
                    disabled={Number(selectedStepCount || 0) < 2}
                    onClick={() => {
                      onGroupSelectedSteps?.(subprocessDraft);
                      setShowMoreActions(false);
                    }}
                    title={Number(selectedStepCount || 0) < 2 ? "Выберите минимум 2 шага" : "Сгруппировать выбранные шаги в подпроцесс"}
                  >
                    Сгруппировать в подпроцесс
                  </button>
                </div>
                <div className="interviewMoreSection" style={{ alignItems: "flex-start" }}>
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <span className="muted small">Видимость колонок</span>
                    <div className="interviewColsMenuList !grid-cols-1">
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
                  <button type="button" className="secondaryBtn smallBtn" onClick={resetTimelineColumns}>Сброс</button>
                </div>
                <button
                  type="button"
                  className="secondaryBtn smallBtn"
                  onClick={saveUiPrefs}
                  title={uiPrefsSavedAt ? `Сохранено: ${new Date(uiPrefsSavedAt).toLocaleTimeString()}` : ""}
                >
                  {uiPrefsDirty ? "Сохранить фильтры*" : "Сохранить фильтры"}
                </button>
                <div className="col-span-2 mt-1 flex flex-wrap items-center gap-2">
                  <span className={"badge " + (graphOrderLocked ? "ok" : "warn")} title={graphOrderLocked ? "Reorder заблокирован (порядок из BPMN)" : "Reorder доступен"}>
                    {graphOrderLocked ? "🔒 Reorder lock" : "🔓 Reorder unlock"}
                  </span>
                  <span className="badge">Шаги: {filteredTimelineCount}/{timelineCount}</span>
                  <span className="badge">AI: {Number(statusCounts?.withAi || 0)}</span>
                  <button type="button" className="secondaryBtn smallBtn" onClick={() => onToggleCollapse?.()}>
                    Скрыть блок
                  </button>
                  {devDebugEnabled ? (
                    <button
                      type="button"
                      className="secondaryBtn smallBtn"
                      data-testid="interview-debug-toggle"
                      onClick={() => onToggleDebug?.()}
                    >
                      Debug
                    </button>
                  ) : null}
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </div>

      {activeFiltersCount > 0 ? (
        <div className="interviewActiveFiltersRow">
          <span className="muted small">Активные фильтры:</span>
          {activeFilterChips.map((chip, idx) => (
            <span key={`active_filter_chip_${idx + 1}`} className="interviewFilterChip on">{chip}</span>
          ))}
          <button type="button" className="secondaryBtn tinyBtn ml-auto" onClick={resetTimelineFilters}>
            Очистить
          </button>
        </div>
      ) : null}

      {orderMode === "bpmn" ? (
        <span className={`muted small ${bpmnOrderFallback ? "text-amber-700" : ""}`}>
          {toText(bpmnOrderHint) || "Порядок вычислен по графу диаграммы."}
        </span>
      ) : (
        <span className="muted small">Creation order: порядок шага = order_index.</span>
      )}

      {!filtersOpen ? (
        <div className="mt-2 flex flex-wrap items-center gap-2 rounded-lg border border-border/70 bg-panel/60 px-2.5 py-2 text-xs">
          <span className="muted">{filterSummary}</span>
          {isTimelineFiltering ? (
            <button type="button" className="secondaryBtn smallBtn ml-auto" onClick={resetTimelineFilters}>
              Сбросить
            </button>
          ) : null}
          <button type="button" className="secondaryBtn smallBtn" onClick={() => setFiltersOpen(true)}>
            Изменить
          </button>
        </div>
      ) : (
        <div className="interviewTimelineFilters mt-2 grid gap-2 rounded-lg border border-border/70 bg-panel/60 p-2">
          <div className="flex flex-wrap items-center gap-2">
            <input
              className="input interviewFilterControl min-w-[260px] flex-[1_1_260px]"
              value={queryDraft}
              onChange={(e) => setQueryDraft(e.target.value)}
              placeholder="Поиск: шаг, аннотация, узел, роль..."
            />
            <div className="relative min-w-[230px] flex-[1_1_230px]">
              <button type="button" className="select w-full text-left" onClick={() => setLanePickerOpen((prev) => !prev)}>
                Лайны: {laneSummary}
              </button>
              {lanePickerOpen ? (
                <div className="absolute left-0 top-[calc(100%+6px)] z-30 w-full rounded-lg border border-border bg-panel p-2 shadow-panel">
                  <input
                    className="input mb-2"
                    value={laneSearch}
                    onChange={(e) => setLaneSearch(e.target.value)}
                    placeholder="Поиск лайна"
                  />
                  <div className="max-h-56 overflow-auto pr-1">
                    {filteredLaneOptions.map((lane) => {
                      const laneValue = toText(lane?.key || lane?.name);
                      const checked = selectedLanes.includes(laneValue);
                      return (
                        <label key={`lane_${laneValue}`} className="interviewColsItem mb-1.5 flex">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleLaneValue(laneValue)}
                            data-testid="interview-lane-chip"
                          />
                          <span>{toText(lane?.label || lane?.name || laneValue)}</span>
                        </label>
                      );
                    })}
                  </div>
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <button type="button" className="secondaryBtn smallBtn" onClick={() => applyLaneSelection([])}>Очистить</button>
                    <button type="button" className="secondaryBtn smallBtn" onClick={() => setLanePickerOpen(false)}>Готово</button>
                  </div>
                </div>
              ) : null}
            </div>
            <select className="select interviewFilterControl min-w-[150px] flex-[0_1_180px]" value={timelineFilters.type} onChange={(e) => patchTimelineFilter("type", e.target.value)}>
              <option value="all">Все типы</option>
              {STEP_TYPES.map((x) => (
                <option key={x.value} value={x.value}>{x.label}</option>
              ))}
            </select>
            <select className="select interviewFilterControl min-w-[150px] flex-[0_1_190px]" value={timelineFilters.subprocess} onChange={(e) => patchTimelineFilter("subprocess", e.target.value)}>
              <option value="all">Все подпроцессы</option>
              {timelineSubprocessOptions.map((sp) => (
                <option key={sp} value={sp}>{sp}</option>
              ))}
            </select>
            <select className="select interviewFilterControl min-w-[170px] flex-[0_1_190px]" value={timelineFilters.bind} onChange={(e) => patchTimelineFilter("bind", e.target.value)}>
              <option value="all">Все привязки</option>
              <option value="bound">Только привязанные</option>
              <option value="missing">Только без привязки</option>
            </select>
            <select className="select interviewFilterControl min-w-[170px] flex-[0_1_200px]" value={timelineFilters.annotation} onChange={(e) => patchTimelineFilter("annotation", e.target.value)}>
              <option value="all">Аннотации: все</option>
              <option value="with">Аннотации: есть</option>
              <option value="without">Аннотации: нет</option>
            </select>
            <select className="select interviewFilterControl min-w-[170px] flex-[0_1_200px]" value={timelineFilters.ai} onChange={(e) => patchTimelineFilter("ai", e.target.value)}>
              <option value="all">AI: все</option>
              <option value="with">AI: есть</option>
              <option value="without">AI: нет</option>
            </select>
          </div>

          <div className="interviewFilterChips">
            <span className="muted small">Tier:</span>
            {["P0", "P1", "P2", "None"].map((tier) => {
              const active = selectedTiers.includes(tier);
              const count = Number(tierCounts?.[tier] || 0);
              return (
                <button
                  key={`tier_filter_${tier}`}
                  type="button"
                  className={`badge interviewTierFilterBtn ${active ? "active" : ""} tier-${tier.toLowerCase()}`}
                  data-testid={`interview-tier-filter-${tier.toLowerCase()}`}
                  onClick={() => toggleTierValue(tier)}
                >
                  {tier}: {count}
                </button>
              );
            })}
            <button type="button" className={"interviewFilterChip " + (timelineFilters.bind === "bound" ? "on" : "")} onClick={() => patchTimelineFilter("bind", timelineFilters.bind === "bound" ? "all" : "bound")}>
              Привязки: да
            </button>
            <button type="button" className={"interviewFilterChip " + (timelineFilters.bind === "missing" ? "on" : "")} onClick={() => setQuickPreset("missing_bind")}>
              Привязки: нет
            </button>
            <button type="button" className={"interviewFilterChip " + (timelineFilters.ai === "with" ? "on" : "")} data-testid="interview-filter-ai-with" onClick={() => setQuickPreset("with_ai")}>
              AI: да
            </button>
            <button type="button" className="interviewFilterChip" onClick={() => setFiltersOpen(false)}>
              Свернуть фильтры
            </button>
          </div>
        </div>
      )}

      <div className="interviewActions mt-2">
        <input
          className="input interviewQuickStepInput"
          value={quickStepDraft}
          onChange={(e) => setQuickStepDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addQuickStepFromInput(e.currentTarget.value);
            }
          }}
          placeholder="Быстрый ввод шага: введите действие и нажмите Enter"
        />
      </div>
    </div>
  );
}
