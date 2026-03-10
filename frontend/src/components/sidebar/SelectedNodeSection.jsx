import { useMemo, useState } from "react";
import SidebarSection from "./SidebarSection";
import {
  normalizeBpmnTypeLabel,
  normalizeSecondaryLine,
  normalizeTemplateLabel,
} from "./selectedNodeUi";
import {
  canonicalizeRobotMeta,
  getRobotMetaStatus,
  ROBOT_EXECUTOR_OPTIONS,
  robotMetaMissingFields,
} from "../../features/process/robotmeta/robotMeta";

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function noteText(value) {
  return String(value?.text || value?.notes || value || "").trim();
}

function noteAuthor(value) {
  return String(value?.author || value?.user || value?.created_by || "you").trim() || "you";
}

const NODE_PATH_SEQUENCE_PRESETS = [
  { key: "primary", label: "Основной" },
  { key: "primary_alt_2", label: "Основной 2" },
  { key: "primary_alt_3", label: "Основной 3" },
  { key: "mitigated_1", label: "Смягчённый 1" },
  { key: "mitigated_2", label: "Смягчённый 2" },
  { key: "mitigated_3", label: "Смягчённый 3" },
  { key: "fail_1", label: "Сбой 1" },
  { key: "fail_2", label: "Сбой 2" },
  { key: "fail_3", label: "Сбой 3" },
];

const STEP_TIME_PRESETS = {
  min: [
    { value: 1, label: "+1m" },
    { value: 2, label: "+2m" },
    { value: 5, label: "+5m" },
    { value: 10, label: "+10m" },
  ],
  sec: [
    { value: 30, label: "+30s" },
    { value: 60, label: "+1m" },
    { value: 120, label: "+2m" },
    { value: 300, label: "+5m" },
  ],
};

function compactTime(value) {
  const ts = Number(value || 0);
  if (!Number.isFinite(ts) || ts <= 0) return "";
  try {
    return new Date(ts).toLocaleString("ru-RU", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

async function copyText(value) {
  const text = String(value || "").trim();
  if (!text) return false;
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
    }
  }
  return false;
}

export default function SelectedNodeSection({
  open,
  onToggle,
  selectedElementId,
  selectedElementName,
  selectedElementType,
  selectedElementLaneName,
  noteCount,
  aiCount,
  templateTitle,
  selectedElementNotes,
  elementText,
  onElementTextChange,
  onSendElementNote,
  elementBusy,
  elementErr,
  onNodeEditorRef,
  stepTimeInput,
  onStepTimeInputChange,
  onSaveStepTime,
  stepTimeBusy,
  stepTimeErr,
  stepTimeEditable,
  stepTimeUnit = "min",
  onStepTimeUnitChange,
  flowPathTier = "",
  onSetFlowPathTier,
  flowHappyBusy = false,
  flowHappyErr = "",
  flowHappyInfo = "",
  flowHappyEditable = false,
  nodePathEditable = false,
  nodePathPaths = [],
  nodePathSequenceKey = "",
  nodePathBusy = false,
  nodePathErr = "",
  nodePathInfo = "",
  selectedNodeCount = 0,
  bulkSelectionCount = 0,
  onToggleNodePathTag,
  onNodePathSequenceChange,
  onApplyNodePath,
  onResetNodePath,
  onAutoNodePathFromColors,
  onSelectBranchUntilBoundary,
  onApplyP1ToSelected,
  showLegacyPathImportHint = false,
  robotMetaEditable = false,
  robotMetaDraft = null,
  robotMetaBusy = false,
  robotMetaErr = "",
  robotMetaInfo = "",
  onRobotMetaDraftChange,
  onSaveRobotMeta,
  onResetRobotMeta,
  disabled,
}) {
  const hasSelected = !!selectedElementId;
  const normalizedStepTimeUnit = String(stepTimeUnit || "").trim().toLowerCase() === "sec" ? "sec" : "min";
  const typeLabel = normalizeBpmnTypeLabel(selectedElementType);
  const secondaryLine = normalizeSecondaryLine(selectedElementLaneName, typeLabel);
  const normalizedTemplate = normalizeTemplateLabel(templateTitle);
  const summary = hasSelected
    ? `${selectedElementName || selectedElementId}${secondaryLine ? ` · ${secondaryLine}` : ""}`
    : "Выберите элемент на диаграмме";
  const nodeHistory = useMemo(
    () => [...asArray(selectedElementNotes)].slice(-10).reverse(),
    [selectedElementNotes],
  );
  const hasUnsavedNode = String(elementText || "").trim().length > 0;
  const canToggleHappyFlow = hasSelected && flowHappyEditable;
  const normalizedFlowPathTier = String(flowPathTier || "").trim().toUpperCase();
  const normalizedNodePathSet = new Set(asArray(nodePathPaths).map((item) => String(item || "").trim().toUpperCase()).filter(Boolean));
  const normalizedNodePathSequence = String(nodePathSequenceKey || "").trim();
  const normalizedNodePathSequenceLower = normalizedNodePathSequence.toLowerCase();
  const hasPresetSequence = NODE_PATH_SEQUENCE_PRESETS.some((preset) => preset.key === normalizedNodePathSequenceLower);
  const sequenceSelectValue = hasPresetSequence ? normalizedNodePathSequenceLower : normalizedNodePathSequence;
  const flowTierButtons = [
    { value: "", label: "Нет", title: "Без приоритета" },
    { value: "P0", label: "P0", title: "Идеальный путь" },
    { value: "P1", label: "P1", title: "Восстановление" },
    { value: "P2", label: "P2", title: "Неуспех/эскалация" },
  ];
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [timePresetOpen, setTimePresetOpen] = useState(false);
  const [robotMetaAdvancedOpen, setRobotMetaAdvancedOpen] = useState(false);
  const timePresets = STEP_TIME_PRESETS[normalizedStepTimeUnit] || STEP_TIME_PRESETS.min;
  const robotMeta = robotMetaDraft && typeof robotMetaDraft === "object"
    ? robotMetaDraft
    : {
      exec: { mode: "human", executor: "manual_ui", action_key: null, timeout_sec: null, retry: { max_attempts: 1, backoff_sec: 0 } },
      mat: { from_zone: null, to_zone: null, inputs: [], outputs: [] },
      qc: { critical: false, checks: [] },
    };

  const timeInputDisabled = !!disabled || !!stepTimeBusy || !stepTimeEditable;

  function applyTimePreset(delta) {
    const parsedDelta = Number(delta);
    if (!Number.isFinite(parsedDelta) || parsedDelta <= 0) return;
    const current = Number(stepTimeInput || 0);
    const next = Number.isFinite(current) && current >= 0 ? current + parsedDelta : parsedDelta;
    onStepTimeInputChange?.(String(next));
    setTimePresetOpen(false);
  }

  function updateRobotMeta(next) {
    onRobotMetaDraftChange?.(next);
  }

  function updateRobotExecField(field, value) {
    updateRobotMeta({
      ...robotMeta,
      exec: {
        ...(robotMeta.exec || {}),
        [field]: value,
      },
    });
  }

  function updateRobotRetryField(field, value) {
    updateRobotMeta({
      ...robotMeta,
      exec: {
        ...(robotMeta.exec || {}),
        retry: {
          ...(robotMeta.exec?.retry || {}),
          [field]: value,
        },
      },
    });
  }

  function updateRobotMatField(field, value) {
    updateRobotMeta({
      ...robotMeta,
      mat: {
        ...(robotMeta.mat || {}),
        [field]: value,
      },
    });
  }

  function updateRobotQcField(field, value) {
    updateRobotMeta({
      ...robotMeta,
      qc: {
        ...(robotMeta.qc || {}),
        [field]: value,
      },
    });
  }

  const canonicalRobotMeta = canonicalizeRobotMeta(robotMeta);
  const robotMetaJson = JSON.stringify(canonicalRobotMeta, null, 2);
  const missingRobotFields = robotMetaMissingFields(robotMeta);
  const robotMetaStatus = getRobotMetaStatus(robotMeta);
  const showRobotMetaIncompleteWarning = robotMetaStatus === "incomplete" && missingRobotFields.length > 0;
  const robotMetaStatusLabel = robotMetaStatus === "ready"
    ? "ready"
    : (robotMetaStatus === "incomplete" ? "incomplete" : "none");

  return (
    <SidebarSection
      sectionId="selected"
      title="Выбранный элемент"
      summary={summary}
      open={open}
      onToggle={onToggle}
      badge={hasSelected ? "УЗЕЛ" : ""}
    >
      <div>
        {hasSelected ? (
          <div className="selectedNodeCard text-xs text-muted">
            <div className="selectedNodeHeader">
              <div className="min-w-0 flex-1">
                <div className="selectedNodeTitle" title={selectedElementName || selectedElementId}>
                  {selectedElementName || selectedElementId}
                </div>
                {secondaryLine ? (
                  <div className="selectedNodeSecondary" title={selectedElementLaneName || selectedElementType || ""}>
                    {secondaryLine}
                  </div>
                ) : null}
              </div>
              <button
                type="button"
                className="sidebarIconBtn selectedNodeCopyBtn"
                title={`Скопировать ID: ${selectedElementId}`}
                onClick={() => {
                  void copyText(selectedElementId);
                }}
              >
                <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" aria-hidden="true">
                  <rect x="5" y="3" width="8" height="10" rx="1.4" fill="none" stroke="currentColor" strokeWidth="1.2" />
                  <rect x="3" y="5" width="8" height="8" rx="1.4" fill="none" stroke="currentColor" strokeWidth="1.2" opacity="0.78" />
                </svg>
              </button>
            </div>

            <div className="selectedNodeMetaGrid" role="list" aria-label="Свойства элемента">
              {typeLabel ? (
                <span className="selectedNodeChip" title={selectedElementType || typeLabel} role="listitem">
                  Тип: {typeLabel}
                </span>
              ) : null}
              {normalizedTemplate ? (
                <span className="selectedNodeChip selectedNodeChip--template" title={normalizedTemplate} role="listitem">
                  Шаблон: {normalizedTemplate}
                </span>
              ) : null}
              <span className="selectedNodeChip selectedNodeChip--id" title={selectedElementId} role="listitem">
                <span className="selectedNodeChipLabel">ID:</span>
                <span className="selectedNodeChipValue">{selectedElementId}</span>
              </span>
              <span className="selectedNodeChip" role="listitem">AI {Number(aiCount || 0)}</span>
              <span className="selectedNodeChip" role="listitem">Заметки {Number(noteCount || 0)}</span>
            </div>

            <div className="selectedNodeFields">
              {hasSelected && nodePathEditable ? (
                <div className="selectedNodeField">
                  <div className="selectedNodeFieldLabel">Пути и последовательность</div>
                  {showLegacyPathImportHint ? (
                    <div className="mb-2 rounded-md border border-warning/40 bg-warning/10 px-2 py-1 text-[11px] text-warning">
                      Paths пока построены из flow tier/цветов. Нажмите «Импорт из цветов», чтобы зафиксировать стабильную `node_path_meta`.
                    </div>
                  ) : null}
                  <div className="selectedNodeTierTabs" role="tablist" aria-label="Path tiers">
                    {["P0", "P1", "P2"].map((tag) => {
                      const active = normalizedNodePathSet.has(tag);
                      return (
                        <button
                          key={`node_path_tag_${tag}`}
                          type="button"
                          className={`selectedNodeTierTab ${active ? "isActive" : ""}`}
                          onClick={() => onToggleNodePathTag?.(tag)}
                          disabled={!!disabled || !!nodePathBusy}
                          title={`Привязать узел к ${tag}`}
                        >
                          {tag}
                        </button>
                      );
                    })}
                  </div>
                  <div className="selectedNodeFieldLabel mt-1.5">Последовательность</div>
                  <div className="selectedNodeTimeRow">
                    <select
                      className="input h-8 min-h-0 w-full"
                      value={sequenceSelectValue}
                      onChange={(event) => onNodePathSequenceChange?.(event.target.value)}
                      disabled={!!disabled || !!nodePathBusy}
                    >
                      <option value="">Не выбрано</option>
                      {NODE_PATH_SEQUENCE_PRESETS.map((preset) => (
                        <option key={preset.key} value={preset.key}>{preset.label}</option>
                      ))}
                      {normalizedNodePathSequence && !hasPresetSequence ? (
                        <option value={normalizedNodePathSequence}>
                          Пользовательская: {normalizedNodePathSequence}
                        </option>
                      ) : null}
                    </select>
                  </div>
                  <div className="mt-1.5 flex flex-wrap items-center gap-1">
                    <button
                      type="button"
                      className="primaryBtn h-8 px-2.5 text-[11px]"
                      onClick={() => {
                        void onApplyNodePath?.();
                      }}
                      disabled={!!disabled || !!nodePathBusy}
                    >
                      Применить
                    </button>
                    <button
                      type="button"
                      className="secondaryBtn h-8 px-2.5 text-[11px]"
                      onClick={() => {
                        void onResetNodePath?.();
                      }}
                      disabled={!!disabled || !!nodePathBusy}
                    >
                      Сбросить
                    </button>
                  </div>
                  <details className="selectedNodeAdvanced mt-1.5" open={advancedOpen} onToggle={(event) => setAdvancedOpen(!!event.currentTarget.open)}>
                    <summary className="selectedNodeAdvancedSummary">Дополнительно</summary>
                    <div className="mt-1.5 flex flex-wrap items-center gap-1">
                      <button
                        type="button"
                        className={`${showLegacyPathImportHint ? "primaryBtn" : "secondaryBtn"} h-8 px-2.5 text-[11px]`}
                        onClick={() => {
                          void onAutoNodePathFromColors?.();
                        }}
                        disabled={!!disabled || !!nodePathBusy}
                        title="Импортировать текущую цветовую разметку в явный node_path_meta"
                      >
                        Импорт из цветов
                      </button>
                      <button
                        type="button"
                        className="secondaryBtn h-8 px-2.5 text-[11px]"
                        onClick={() => onSelectBranchUntilBoundary?.()}
                        disabled={!!disabled || !!nodePathBusy}
                        title="Выделить ветку до следующего gateway или EndEvent"
                      >
                        Выделить ветку
                      </button>
                      <button
                        type="button"
                        className="secondaryBtn h-8 px-2.5 text-[11px]"
                        onClick={() => {
                          void onApplyP1ToSelected?.();
                        }}
                        disabled={!!disabled || !!nodePathBusy}
                      >
                        Применить P1 для выделенных
                      </button>
                    </div>
                  </details>
                  <div className="mt-1 text-[11px] text-muted">
                    Выбрано: {Number(bulkSelectionCount || selectedNodeCount || 1)} узлов.
                  </div>
                  {nodePathInfo ? <div className="mt-1 text-[11px] text-muted">{nodePathInfo}</div> : null}
                  {nodePathErr ? <div className="selectedNodeFieldError">{nodePathErr}</div> : null}
                </div>
              ) : null}

              {canToggleHappyFlow ? (
                <div className="selectedNodeField">
                  <div className="selectedNodeFieldLabel">Уровень пути</div>
                  <div className="selectedNodeTimeRow">
                    <div className="inline-flex flex-wrap items-center gap-1">
                      {flowTierButtons.map((btn) => {
                        const isActive = (normalizedFlowPathTier || "") === btn.value;
                        return (
                          <button
                            key={btn.value || "none"}
                            type="button"
                            data-testid={`flow-tier-btn-${btn.value || "none"}`}
                            className={`${isActive ? "primaryBtn" : "secondaryBtn"} h-8 px-2.5 text-[11px]`}
                            onClick={() => {
                              void onSetFlowPathTier?.(btn.value || null);
                            }}
                            disabled={!!disabled || !!flowHappyBusy}
                            title={btn.title}
                          >
                            {btn.label}
                          </button>
                        );
                      })}
                    </div>
                    {flowHappyBusy ? <span className="text-[11px] text-muted">Сохраняю...</span> : null}
                  </div>
                  {flowHappyInfo ? <div className="mt-1 text-[11px] text-muted">{flowHappyInfo}</div> : null}
                  {flowHappyErr ? <div className="selectedNodeFieldError">{flowHappyErr}</div> : null}
                </div>
              ) : null}

              <div className="selectedNodeField">
                <div className="flex items-center justify-between gap-2">
                  <label className="selectedNodeFieldLabel" htmlFor="selected-node-step-time">Время шага</label>
                  <div className="inline-flex items-center gap-1 rounded-md border border-border bg-panel2/40 p-0.5">
                    <button
                      type="button"
                      className={`h-6 rounded px-2 text-[10px] font-semibold ${normalizedStepTimeUnit === "min" ? "bg-accent/20 text-fg" : "text-muted"}`}
                      onClick={() => onStepTimeUnitChange?.("min")}
                      title="Показывать в минутах"
                    >
                      мин
                    </button>
                    <button
                      type="button"
                      className={`h-6 rounded px-2 text-[10px] font-semibold ${normalizedStepTimeUnit === "sec" ? "bg-accent/20 text-fg" : "text-muted"}`}
                      onClick={() => onStepTimeUnitChange?.("sec")}
                      title="Показывать в секундах"
                    >
                      сек
                    </button>
                  </div>
                </div>
                <div className="selectedNodeTimeRow selectedNodeTimeRow--compact">
                  <input
                    id="selected-node-step-time"
                    className="input selectedNodeTimeInput"
                    type="number"
                    min="0"
                    step="1"
                    inputMode="numeric"
                    placeholder="—"
                    value={stepTimeInput}
                    onChange={(event) => onStepTimeInputChange?.(event.target.value)}
                    onBlur={() => {
                      void onSaveStepTime?.();
                    }}
                    disabled={timeInputDisabled}
                  />
                  <span className="selectedNodeFieldUnit">{normalizedStepTimeUnit === "sec" ? "сек" : "мин"}</span>
                  <div className="selectedNodePresetWrap">
                    <button
                      type="button"
                      className="secondaryBtn h-8 min-w-8 px-2 text-[11px]"
                      onClick={() => setTimePresetOpen((prev) => !prev)}
                      disabled={timeInputDisabled}
                      title="Пресеты времени"
                    >
                      +
                    </button>
                    {timePresetOpen ? (
                      <div className="selectedNodePresetPopover">
                        {timePresets.map((preset) => (
                          <button
                            key={`time_preset_${preset.label}`}
                            type="button"
                            className="secondaryBtn h-7 px-2 text-[11px]"
                            onClick={() => applyTimePreset(preset.value)}
                            disabled={timeInputDisabled}
                          >
                            {preset.label}
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </div>
                  <button
                    type="button"
                    className="secondaryBtn h-8 px-2.5 text-[11px]"
                    onClick={() => {
                      void onSaveStepTime?.();
                    }}
                    disabled={timeInputDisabled}
                  >
                    {stepTimeBusy ? "Сохраняю..." : "Сохранить"}
                  </button>
                </div>
                {!stepTimeEditable ? (
                  <div className="mt-1 text-[11px] text-muted">Время шага доступно для BPMN-узлов.</div>
                ) : null}
                {stepTimeErr ? <div className="selectedNodeFieldError">{stepTimeErr}</div> : null}
              </div>

              {robotMetaEditable ? (
                <div className="selectedNodeField">
                  <div className="selectedNodeFieldLabel selectedNodeFieldLabel--withChip">
                    <span>Robot Meta</span>
                    <span
                      className={`selectedNodeChip selectedNodeChip--robotmeta ${robotMetaStatus === "ready" ? "is-ready" : ""} ${robotMetaStatus === "incomplete" ? "is-incomplete" : ""}`}
                      data-testid="robotmeta-status-chip"
                    >
                      {robotMetaStatusLabel}
                    </span>
                  </div>
                  <div className="selectedNodeTimeRow">
                    <select
                      className="input h-8 min-h-0 w-full"
                      value={String(robotMeta.exec?.mode || "human")}
                      onChange={(event) => updateRobotExecField("mode", event.target.value)}
                      disabled={!!disabled || !!robotMetaBusy}
                      data-testid="robotmeta-mode"
                    >
                      <option value="human">human</option>
                      <option value="machine">machine</option>
                      <option value="hybrid">hybrid</option>
                    </select>
                    <select
                      className="input h-8 min-h-0 w-full"
                      value={String(robotMeta.exec?.executor || "")}
                      onChange={(event) => updateRobotExecField("executor", event.target.value)}
                      disabled={!!disabled || !!robotMetaBusy}
                      data-testid="robotmeta-executor"
                    >
                      <option value="">executor</option>
                      {ROBOT_EXECUTOR_OPTIONS.map((option) => (
                        <option key={`robot_executor_${option}`} value={option}>{option}</option>
                      ))}
                    </select>
                  </div>
                  <div className="selectedNodeTimeRow selectedNodeTimeRow--compact">
                    <input
                      className="input h-8 min-h-0 flex-1"
                      placeholder="action_key"
                      value={String(robotMeta.exec?.action_key || "")}
                      onChange={(event) => updateRobotExecField("action_key", event.target.value)}
                      disabled={!!disabled || !!robotMetaBusy}
                      data-testid="robotmeta-action-key"
                    />
                    <input
                      className="input h-8 min-h-0 w-24"
                      type="number"
                      min="0"
                      step="1"
                      placeholder="timeout"
                      value={robotMeta.exec?.timeout_sec ?? ""}
                      onChange={(event) => updateRobotExecField("timeout_sec", event.target.value)}
                      disabled={!!disabled || !!robotMetaBusy}
                      data-testid="robotmeta-timeout-sec"
                    />
                  </div>
                  <div className="selectedNodeTimeRow selectedNodeTimeRow--compact">
                    <input
                      className="input h-8 min-h-0 w-24"
                      type="number"
                      min="0"
                      step="1"
                      placeholder="retry"
                      value={robotMeta.exec?.retry?.max_attempts ?? ""}
                      onChange={(event) => updateRobotRetryField("max_attempts", event.target.value)}
                      disabled={!!disabled || !!robotMetaBusy}
                      data-testid="robotmeta-retry-max"
                    />
                    <input
                      className="input h-8 min-h-0 w-24"
                      type="number"
                      min="0"
                      step="1"
                      placeholder="backoff"
                      value={robotMeta.exec?.retry?.backoff_sec ?? ""}
                      onChange={(event) => updateRobotRetryField("backoff_sec", event.target.value)}
                      disabled={!!disabled || !!robotMetaBusy}
                      data-testid="robotmeta-retry-backoff"
                    />
                    <input
                      className="input h-8 min-h-0 flex-1"
                      placeholder="from_zone"
                      value={String(robotMeta.mat?.from_zone || "")}
                      onChange={(event) => updateRobotMatField("from_zone", event.target.value)}
                      disabled={!!disabled || !!robotMetaBusy}
                      data-testid="robotmeta-from-zone"
                    />
                    <input
                      className="input h-8 min-h-0 flex-1"
                      placeholder="to_zone"
                      value={String(robotMeta.mat?.to_zone || "")}
                      onChange={(event) => updateRobotMatField("to_zone", event.target.value)}
                      disabled={!!disabled || !!robotMetaBusy}
                      data-testid="robotmeta-to-zone"
                    />
                  </div>
                  <label className="mt-1 inline-flex items-center gap-2 text-[11px] text-muted">
                    <input
                      type="checkbox"
                      checked={!!robotMeta.qc?.critical}
                      onChange={(event) => updateRobotQcField("critical", !!event.target.checked)}
                      disabled={!!disabled || !!robotMetaBusy}
                      data-testid="robotmeta-qc-critical"
                    />
                    QC critical
                  </label>
                  {showRobotMetaIncompleteWarning ? (
                    <div className="selectedNodeFieldWarn" data-testid="robotmeta-incomplete-warning">
                      incomplete: missing {missingRobotFields.join(", ")}
                    </div>
                  ) : null}
                  <div className="mt-1.5 flex flex-wrap items-center gap-1">
                    <button
                      type="button"
                      className="secondaryBtn h-7 px-2 text-[11px]"
                      onClick={() => {
                        void onSaveRobotMeta?.();
                      }}
                      disabled={!!disabled || !!robotMetaBusy}
                      data-testid="robotmeta-save"
                    >
                      {robotMetaBusy ? "Сохраняю..." : "Сохранить"}
                    </button>
                    <button
                      type="button"
                      className="secondaryBtn h-7 px-2 text-[11px]"
                      onClick={() => {
                        void onResetRobotMeta?.();
                      }}
                      disabled={!!disabled || !!robotMetaBusy}
                      data-testid="robotmeta-clear"
                    >
                      Clear Robot Meta
                    </button>
                  </div>
                  <details
                    className="selectedNodeAdvanced mt-1.5"
                    open={robotMetaAdvancedOpen}
                    onToggle={(event) => setRobotMetaAdvancedOpen(!!event.currentTarget.open)}
                    data-testid="robotmeta-advanced"
                  >
                    <summary className="selectedNodeAdvancedSummary">Advanced</summary>
                    <div className="mt-1.5">
                      <button
                        type="button"
                        className="secondaryBtn h-7 px-2 text-[11px]"
                        onClick={() => {
                          void copyText(robotMetaJson);
                        }}
                        data-testid="robotmeta-copy-json"
                      >
                        Копировать JSON
                      </button>
                      <pre className="mt-2 max-h-44 overflow-auto rounded-md border border-border/60 bg-panel2/40 p-2 text-[10px] text-fg" data-testid="robotmeta-json-readonly">
                        {robotMetaJson}
                      </pre>
                    </div>
                  </details>
                  {robotMetaInfo ? <div className="mt-1 text-[11px] text-muted">{robotMetaInfo}</div> : null}
                  {robotMetaErr ? <div className="selectedNodeFieldError">{robotMetaErr}</div> : null}
                </div>
              ) : null}

              <div className="selectedNodeField">
                <div className="selectedNodeFieldLabel">Заметки</div>
                {nodeHistory.length ? (
                  <div className="sidebarMiniList">
                    {nodeHistory.map((item, idx) => (
                      <div key={item?.id || `node_note_${idx + 1}`} className="sidebarMiniItem">
                        <div className="sidebarMiniItemText">{noteText(item)}</div>
                        <div className="sidebarMiniItemMeta">
                          {noteAuthor(item)}
                          {compactTime(item?.updatedAt || item?.createdAt || item?.ts || item?.created_at)
                            ? ` · ${compactTime(item?.updatedAt || item?.createdAt || item?.ts || item?.created_at)}`
                            : ""}
                          <span className="ml-1 text-[10px] text-muted/80">#{Math.max(1, Number(noteCount || 0) - idx)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="sidebarEmptyHint">Пока нет заметок для выбранного узла.</div>
                )}

                {elementErr ? <div className="selectedNodeFieldError">{elementErr}</div> : null}
                <textarea
                  ref={(node) => onNodeEditorRef?.(node)}
                  className="input mt-2"
                  placeholder="Заметка для выбранного узла..."
                  value={elementText}
                  onChange={(event) => onElementTextChange?.(event.target.value)}
                  rows={3}
                  style={{ resize: "vertical" }}
                  onKeyDown={(event) => {
                    if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
                      event.preventDefault();
                      void onSendElementNote?.();
                    }
                  }}
                  disabled={!!disabled || !!elementBusy}
                />
                <div className="mt-2 flex items-center justify-between gap-2">
                  <span className="text-[11px] text-muted">
                    {hasUnsavedNode ? "Есть несохранённые изменения" : "Сохранено"}
                  </span>
                  <button
                    type="button"
                    className="primaryBtn h-8 px-3 text-[11px]"
                    onClick={() => {
                      void onSendElementNote?.();
                    }}
                    disabled={!!disabled || !!elementBusy}
                  >
                    {elementBusy ? "Сохраняю..." : "Сохранить заметку"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="sidebarNodeEmptyCard" role="status" aria-live="polite">
            <div className="sidebarNodeEmptyIcon" aria-hidden="true">
              <svg viewBox="0 0 16 16" className="h-4 w-4">
                <path d="M3 8h10M8 3v10" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
              </svg>
            </div>
            <div className="min-w-0">
              <div className="text-xs font-semibold text-fg">Узел не выбран</div>
              <div className="mt-0.5 text-[11px] text-muted">
                Выберите элемент на диаграмме, чтобы редактировать свойства.
              </div>
            </div>
          </div>
        )}
      </div>
    </SidebarSection>
  );
}
