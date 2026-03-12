import { useEffect, useMemo, useRef, useState } from "react";
import {
  canonicalizeRobotMeta,
  getRobotMetaStatus,
  ROBOT_EXECUTOR_OPTIONS,
  robotMetaMissingFields,
} from "../../features/process/robotmeta/robotMeta";
import {
  CAMUNDA_LISTENER_EVENTS,
  CAMUNDA_LISTENER_TYPES,
  createEmptyCamundaExtensionState,
  normalizeCamundaExtensionState,
} from "../../features/process/camunda/camundaExtensions";
import {
  buildVisibleExtensionPropertyRows,
  buildPropertyDictionaryEditorModel,
  countVisibleExtensionPropertyRows,
  setSchemaPropertyValueInExtensionState,
  shouldOfferAddDictionaryValueAction,
} from "../../features/process/camunda/propertyDictionaryModel";

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeNodePathTag(value) {
  const tag = String(value || "").trim().toUpperCase();
  if (tag === "P0" || tag === "P1" || tag === "P2") return tag;
  return "";
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

export function NodePathSettings({
  selectedElementId,
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
  flowPathTier = "",
  onSetFlowPathTier,
  flowHappyBusy = false,
  flowHappyErr = "",
  flowHappyInfo = "",
  flowHappyEditable = false,
  disabled = false,
}) {
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [sequenceOpen, setSequenceOpen] = useState(false);
  const sequenceRef = useRef(null);
  const normalizedNodePathSet = new Set(
    asArray(nodePathPaths).map((item) => normalizeNodePathTag(item)).filter(Boolean),
  );
  const normalizedNodePathSequence = String(nodePathSequenceKey || "").trim();
  const normalizedNodePathSequenceLower = normalizedNodePathSequence.toLowerCase();
  const hasPresetSequence = NODE_PATH_SEQUENCE_PRESETS.some((preset) => preset.key === normalizedNodePathSequenceLower);
  const sequenceSelectValue = hasPresetSequence ? normalizedNodePathSequenceLower : normalizedNodePathSequence;
  const selectedSequenceLabel = NODE_PATH_SEQUENCE_PRESETS.find((preset) => preset.key === sequenceSelectValue)?.label
    || (sequenceSelectValue ? `Пользовательская: ${sequenceSelectValue}` : "Не выбрано");
  const normalizedFlowPathTier = String(flowPathTier || "").trim().toUpperCase();
  const sequenceOptions = [
    { key: "", label: "Не выбрано" },
    ...NODE_PATH_SEQUENCE_PRESETS,
    ...(normalizedNodePathSequence && !hasPresetSequence
      ? [{ key: normalizedNodePathSequence, label: `Пользовательская: ${normalizedNodePathSequence}` }]
      : []),
  ];

  useEffect(() => {
    if (!sequenceOpen) return undefined;
    function onPointerDown(event) {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (sequenceRef.current?.contains(target)) return;
      setSequenceOpen(false);
    }
    function onKeyDown(event) {
      if (event.key === "Escape") setSequenceOpen(false);
    }
    window.addEventListener("mousedown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("mousedown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [sequenceOpen]);

  return (
    <div className="sidebarControlStack">
      {!selectedElementId ? <div className="sidebarEmptyHint">Выберите узел для настройки путей.</div> : null}

      {selectedElementId && nodePathEditable ? (
        <>
          {showLegacyPathImportHint ? (
            <div className="rounded-md border border-warning/35 bg-warning/10 px-2 py-1 text-[11px] text-warning">
              Paths сейчас из цветов. Нажмите «Импорт из цветов», чтобы зафиксировать node_path_meta.
            </div>
          ) : null}
          <div className="sidebarInlineTabs" role="tablist" aria-label="Path tiers">
            {["P0", "P1", "P2"].map((tag) => {
              const active = normalizedNodePathSet.has(tag);
              return (
                <button
                  key={`node_path_tag_${tag}`}
                  type="button"
                  className={`sidebarInlineTab ${active ? "isActive" : ""}`}
                  onClick={() => onToggleNodePathTag?.(tag)}
                  disabled={!!disabled || !!nodePathBusy}
                  title={`Привязать узел к ${tag}`}
                >
                  {tag}
                </button>
              );
            })}
          </div>
          <div className="sidebarFieldLabel">Последовательность</div>
          <div className="sidebarSelectWrap" ref={sequenceRef}>
            <button
              type="button"
              className="sidebarSelectButton"
              onClick={() => setSequenceOpen((prev) => !prev)}
              disabled={!!disabled || !!nodePathBusy}
              title={selectedSequenceLabel}
              aria-expanded={sequenceOpen ? "true" : "false"}
              data-testid="nodepath-sequence-select"
            >
              <span className="sidebarSelectButtonText">{selectedSequenceLabel}</span>
              <span className="sidebarSelectButtonChevron" aria-hidden="true">{sequenceOpen ? "▴" : "▾"}</span>
            </button>
            {sequenceOpen ? (
              <div className="sidebarSelectPopover" role="listbox" aria-label="Последовательность">
                {sequenceOptions.map((option) => {
                  const isActive = option.key === sequenceSelectValue;
                  return (
                    <button
                      key={`node_path_seq_${option.key || "empty"}`}
                      type="button"
                      className={`sidebarSelectOption ${isActive ? "isActive" : ""}`}
                      onClick={() => {
                        onNodePathSequenceChange?.(option.key);
                        setSequenceOpen(false);
                      }}
                      title={option.label}
                      role="option"
                      aria-selected={isActive ? "true" : "false"}
                    >
                      <span className="sidebarSelectOptionLabel">{option.label}</span>
                      {option.key ? <span className="sidebarSelectOptionKey">{option.key}</span> : null}
                    </button>
                  );
                })}
              </div>
            ) : null}
          </div>
          <div className="sidebarButtonRow mt-1">
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

          <details
            className="sidebarAdvanced mt-1"
            open={advancedOpen}
            onToggle={(event) => setAdvancedOpen(!!event.currentTarget.open)}
          >
            <summary className="sidebarAdvancedSummary">Advanced</summary>
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
          <div className="text-[11px] text-muted">
            Выбрано: {Number(bulkSelectionCount || selectedNodeCount || 1)} узлов.
          </div>
          {nodePathInfo ? <div className="text-[11px] text-muted">{nodePathInfo}</div> : null}
          {nodePathErr ? <div className="selectedNodeFieldError">{nodePathErr}</div> : null}
        </>
      ) : null}

      {selectedElementId && flowHappyEditable ? (
        <div className="sidebarControlBlock">
          <div className="sidebarFieldLabel">Уровень пути</div>
          <div className="flex flex-wrap items-center gap-1">
            {[
              { value: "", label: "Нет", title: "Без приоритета" },
              { value: "P0", label: "P0", title: "Идеальный путь" },
              { value: "P1", label: "P1", title: "Восстановление" },
              { value: "P2", label: "P2", title: "Неуспех/эскалация" },
            ].map((btn) => {
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
            {flowHappyBusy ? <span className="text-[11px] text-muted">Сохраняю...</span> : null}
          </div>
          {flowHappyInfo ? <div className="mt-1 text-[11px] text-muted">{flowHappyInfo}</div> : null}
          {flowHappyErr ? <div className="selectedNodeFieldError">{flowHappyErr}</div> : null}
        </div>
      ) : null}

      {selectedElementId && !nodePathEditable && !flowHappyEditable ? (
        <div className="sidebarEmptyHint">Для текущего типа элемента настройки пути недоступны.</div>
      ) : null}
    </div>
  );
}

export function StepTimeSettings({
  selectedElementId,
  stepTimeInput,
  onStepTimeInputChange,
  onSaveStepTime,
  stepTimeBusy = false,
  stepTimeErr = "",
  stepTimeEditable = false,
  stepTimeUnit = "min",
  onStepTimeUnitChange,
  disabled = false,
}) {
  const [timePresetOpen, setTimePresetOpen] = useState(false);
  const normalizedStepTimeUnit = String(stepTimeUnit || "").trim().toLowerCase() === "sec" ? "sec" : "min";
  const timeInputDisabled = !!disabled || !!stepTimeBusy || !stepTimeEditable;
  const timePresets = STEP_TIME_PRESETS[normalizedStepTimeUnit] || STEP_TIME_PRESETS.min;

  function applyTimePreset(delta) {
    const parsedDelta = Number(delta);
    if (!Number.isFinite(parsedDelta) || parsedDelta <= 0) return;
    const current = Number(stepTimeInput || 0);
    const next = Number.isFinite(current) && current >= 0 ? current + parsedDelta : parsedDelta;
    onStepTimeInputChange?.(String(next));
    setTimePresetOpen(false);
  }

  if (!selectedElementId) {
    return <div className="sidebarEmptyHint">Выберите узел для настройки времени шага.</div>;
  }

  return (
    <div className="sidebarControlStack">
      <div className="flex items-center justify-between gap-2">
        <div className="sidebarFieldLabel">Время шага</div>
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
      <div className="sidebarControlRow">
        <input
          id="selected-node-step-time"
          className="input h-8 min-h-0 min-w-0 flex-1"
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
        <div className="text-[11px] text-muted">Время шага доступно для BPMN-узлов.</div>
      ) : null}
      {stepTimeErr ? <div className="selectedNodeFieldError">{stepTimeErr}</div> : null}
    </div>
  );
}

export function RobotMetaSettings({
  selectedElementId,
  robotMetaEditable = false,
  robotMetaDraft = null,
  robotMetaBusy = false,
  robotMetaErr = "",
  robotMetaInfo = "",
  onRobotMetaDraftChange,
  onSaveRobotMeta,
  onResetRobotMeta,
  disabled = false,
}) {
  const [robotMetaAdvancedOpen, setRobotMetaAdvancedOpen] = useState(false);
  const robotMeta = robotMetaDraft && typeof robotMetaDraft === "object"
    ? robotMetaDraft
    : {
      exec: { mode: "human", executor: "manual_ui", action_key: null, timeout_sec: null, retry: { max_attempts: 1, backoff_sec: 0 } },
      mat: { from_zone: null, to_zone: null, inputs: [], outputs: [] },
      qc: { critical: false, checks: [] },
    };

  const canonicalRobotMeta = useMemo(() => canonicalizeRobotMeta(robotMeta), [robotMeta]);
  const robotMetaJson = useMemo(() => JSON.stringify(canonicalRobotMeta, null, 2), [canonicalRobotMeta]);
  const missingRobotFields = robotMetaMissingFields(robotMeta);
  const robotMetaStatus = getRobotMetaStatus(robotMeta);
  const robotMetaStatusLabel = robotMetaStatus === "ready"
    ? "ready"
    : (robotMetaStatus === "incomplete" ? "incomplete" : "none");
  const missingAction = missingRobotFields.includes("action_key");

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

  if (!selectedElementId) {
    return <div className="sidebarEmptyHint">Выберите узел для настройки Robot Meta.</div>;
  }

  if (!robotMetaEditable) {
    return <div className="sidebarEmptyHint">Robot Meta доступна только для BPMN-узлов (не sequenceFlow).</div>;
  }

  return (
    <div className="sidebarControlStack">
      <div className="sidebarFieldLabel sidebarFieldLabel--withChip">
        <span>Robot Meta</span>
        <span
          className={`selectedNodeChip selectedNodeChip--robotmeta ${robotMetaStatus === "ready" ? "is-ready" : ""} ${robotMetaStatus === "incomplete" ? "is-incomplete" : ""}`}
          data-testid="robotmeta-status-chip"
        >
          {robotMetaStatusLabel}
        </span>
      </div>

      <div className="sidebarControlRow">
        <select
          className="input h-8 min-h-0 w-full min-w-0"
          value={String(robotMeta.exec?.mode || "human")}
          onChange={(event) => updateRobotExecField("mode", event.target.value)}
          disabled={!!disabled || !!robotMetaBusy}
          data-testid="robotmeta-mode"
          title={String(robotMeta.exec?.mode || "human")}
        >
          <option value="human">human</option>
          <option value="machine">machine</option>
          <option value="hybrid">hybrid</option>
        </select>
        <select
          className="input h-8 min-h-0 w-full min-w-0"
          value={String(robotMeta.exec?.executor || "")}
          onChange={(event) => updateRobotExecField("executor", event.target.value)}
          disabled={!!disabled || !!robotMetaBusy}
          data-testid="robotmeta-executor"
          title={String(robotMeta.exec?.executor || "")}
        >
          <option value="">executor</option>
          {ROBOT_EXECUTOR_OPTIONS.map((option) => (
            <option key={`robot_executor_${option}`} value={option}>{option}</option>
          ))}
        </select>
      </div>

      <div className="sidebarControlRow sidebarControlRowWrap">
        <input
          className="input h-8 min-h-0 min-w-0 flex-[2_1_200px]"
          placeholder="action_key"
          value={String(robotMeta.exec?.action_key || "")}
          onChange={(event) => updateRobotExecField("action_key", event.target.value)}
          disabled={!!disabled || !!robotMetaBusy}
          data-testid="robotmeta-action-key"
          title={String(robotMeta.exec?.action_key || "")}
        />
        <input
          className="input h-8 min-h-0 w-full min-w-0 flex-[1_1_100px]"
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

      <div className="sidebarControlRow sidebarControlRowWrap">
        <input
          className="input h-8 min-h-0 w-full min-w-0 flex-[1_1_100px]"
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
          className="input h-8 min-h-0 w-full min-w-0 flex-[1_1_100px]"
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
          className="input h-8 min-h-0 w-full min-w-0 flex-[1_1_140px]"
          placeholder="from_zone"
          value={String(robotMeta.mat?.from_zone || "")}
          onChange={(event) => updateRobotMatField("from_zone", event.target.value)}
          disabled={!!disabled || !!robotMetaBusy}
          data-testid="robotmeta-from-zone"
          title={String(robotMeta.mat?.from_zone || "")}
        />
        <input
          className="input h-8 min-h-0 w-full min-w-0 flex-[1_1_140px]"
          placeholder="to_zone"
          value={String(robotMeta.mat?.to_zone || "")}
          onChange={(event) => updateRobotMatField("to_zone", event.target.value)}
          disabled={!!disabled || !!robotMetaBusy}
          data-testid="robotmeta-to-zone"
          title={String(robotMeta.mat?.to_zone || "")}
        />
      </div>

      <label className="inline-flex items-center gap-2 text-[11px] text-muted">
        <input
          type="checkbox"
          checked={!!robotMeta.qc?.critical}
          onChange={(event) => updateRobotQcField("critical", !!event.target.checked)}
          disabled={!!disabled || !!robotMetaBusy}
          data-testid="robotmeta-qc-critical"
        />
        QC critical
      </label>

      {robotMetaStatus === "incomplete" && missingAction ? (
        <div className="selectedNodeFieldWarn" data-testid="robotmeta-incomplete-warning">
          incomplete: missing action_key
        </div>
      ) : null}
      {robotMetaStatus === "incomplete" && !missingAction && missingRobotFields.length > 0 ? (
        <div className="selectedNodeFieldWarn" data-testid="robotmeta-incomplete-warning-extra">
          incomplete: missing {missingRobotFields.join(", ")}
        </div>
      ) : null}

      <div className="sidebarButtonRow">
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
        className="sidebarAdvanced"
        open={robotMetaAdvancedOpen}
        onToggle={(event) => setRobotMetaAdvancedOpen(!!event.currentTarget.open)}
        data-testid="robotmeta-advanced"
      >
        <summary className="sidebarAdvancedSummary">Advanced</summary>
        <div className="mt-1.5">
          <button
            type="button"
            className="secondaryBtn h-7 px-2 text-[11px]"
            onClick={() => {
              void copyText(robotMetaJson);
            }}
            data-testid="robotmeta-copy-json"
          >
            Copy JSON
          </button>
          <pre className="mt-2 max-h-44 overflow-auto rounded-md border border-border/60 bg-panel2/40 p-2 text-[10px] text-fg" data-testid="robotmeta-json-readonly">
            {robotMetaJson}
          </pre>
        </div>
      </details>

      {robotMetaInfo ? <div className="text-[11px] text-muted">{robotMetaInfo}</div> : null}
      {robotMetaErr ? <div className="selectedNodeFieldError">{robotMetaErr}</div> : null}
    </div>
  );
}

function SidebarInfoTip({ text = "", label = "Пояснение" }) {
  const tipText = String(text || "").trim();
  if (!tipText) return null;
  return (
    <span className="sidebarInfoTipWrap">
      <button
        type="button"
        className="sidebarInfoTip"
        aria-label={label}
        tabIndex={0}
      >
        i
      </button>
      <span className="sidebarInfoTipBubble" role="tooltip">
        {tipText}
      </span>
    </span>
  );
}

export function CamundaPropertiesSettings({
  selectedElementId,
  camundaPropertiesEditable = false,
  extensionStateDraft = null,
  extensionStateBusy = false,
  extensionStateErr = "",
  extensionStateInfo = "",
  dictionaryBundle = null,
  dictionaryLoading = false,
  dictionaryError = "",
  dictionaryAddBusyKey = "",
  operationKey = "",
  operationOptions = [],
  operationSelectionBusy = false,
  showPropertiesOverlay = false,
  showPropertiesOverlayAlways = false,
  onExtensionStateDraftChange,
  onOperationKeyChange,
  onShowPropertiesOverlayChange,
  onShowPropertiesOverlayAlwaysChange,
  onAddDictionaryValue,
  onOpenDictionaryManager,
  onSaveExtensionState,
  onResetExtensionState,
  disabled = false,
}) {
  const [listenersOpen, setListenersOpen] = useState(true);
  const [expandedBpmnRows, setExpandedBpmnRows] = useState({});
  const state = extensionStateDraft && typeof extensionStateDraft === "object"
    ? extensionStateDraft
    : createEmptyCamundaExtensionState();
  const properties = Array.isArray(state?.properties?.extensionProperties)
    ? state.properties.extensionProperties
    : [];
  const listeners = Array.isArray(state?.properties?.extensionListeners)
    ? state.properties.extensionListeners
    : [];
  const normalizedState = useMemo(() => normalizeCamundaExtensionState(state), [state]);
  const dictionaryEditorModel = useMemo(
    () => buildPropertyDictionaryEditorModel({ extensionStateRaw: state, dictionaryBundleRaw: dictionaryBundle }),
    [state, dictionaryBundle],
  );
  const visibleFallbackProperties = useMemo(
    () => buildVisibleExtensionPropertyRows(state).rows,
    [state],
  );
  const hasDictionarySchema = dictionaryEditorModel.hasSchema;
  const propertyCount = useMemo(
    () => countVisibleExtensionPropertyRows(state),
    [state],
  );
  const listenerCount = normalizedState.properties.extensionListeners.length;
  const operationLabel = String(dictionaryEditorModel?.operationLabel || operationKey || "").trim();
  const normalizedOperationKey = String(operationKey || "").trim();
  const normalizedOperationOptions = useMemo(
    () => asArray(operationOptions).map((item) => {
      const row = item && typeof item === "object" ? item : {};
      const key = String(row.operationKey || row.operation_key || "").trim();
      if (!key) return null;
      const label = String(row.operationLabel || row.operation_label || key).trim();
      const isActive = row.isActive ?? row.is_active ?? true;
      const sortOrder = Number.isFinite(Number(row.sortOrder || row.sort_order))
        ? Number(row.sortOrder || row.sort_order)
        : 0;
      return {
        key,
        label,
        isActive: !!isActive,
        sortOrder,
      };
    }).filter(Boolean)
      .sort((a, b) => Number(a.sortOrder || 0) - Number(b.sortOrder || 0) || String(a.label || "").localeCompare(String(b.label || ""), "ru")),
    [operationOptions],
  );
  const selectedOperationOption = normalizedOperationOptions.find((item) => item.key === normalizedOperationKey) || null;
  const hasOperationChoices = normalizedOperationOptions.length > 0;
  const operationDisplayLabel = String(operationLabel || selectedOperationOption?.label || normalizedOperationKey || "").trim();

  function isBpmnRowExpanded(rowIdRaw) {
    const rowId = String(rowIdRaw || "").trim();
    if (!rowId) return false;
    return !!expandedBpmnRows[rowId];
  }

  function setBpmnRowExpanded(rowIdRaw, nextOpen) {
    const rowId = String(rowIdRaw || "").trim();
    if (!rowId) return;
    setExpandedBpmnRows((prev) => {
      const next = { ...(prev || {}) };
      if (nextOpen) {
        next[rowId] = true;
      } else {
        delete next[rowId];
      }
      return next;
    });
  }

  useEffect(() => {
    const knownIds = new Set(
      properties
        .map((row) => String(row?.id || "").trim())
        .filter(Boolean),
    );
    setExpandedBpmnRows((prev) => {
      const current = prev && typeof prev === "object" ? prev : {};
      let changed = false;
      const next = {};
      Object.keys(current).forEach((rowId) => {
        if (knownIds.has(rowId) && !!current[rowId]) {
          next[rowId] = true;
        } else {
          changed = true;
        }
      });
      return changed ? next : current;
    });
  }, [properties]);

  function updateDraft(nextState) {
    onExtensionStateDraftChange?.(nextState);
  }

  function replaceExtensionProperties(nextExtensionProperties) {
    updateDraft({
      ...state,
      properties: {
        ...(state.properties || {}),
        extensionProperties: nextExtensionProperties,
        extensionListeners: listeners,
      },
    });
  }

  function updatePropertyRow(rowId, patch = {}) {
    replaceExtensionProperties(properties.map((row) => (
      String(row?.id || "") === String(rowId || "")
        ? { ...row, ...patch }
        : row
    )));
  }

  function addPropertyRow() {
    replaceExtensionProperties([...properties, { id: `prop_draft_${Date.now()}`, name: "", value: "" }]);
  }

  function deletePropertyRow(rowId) {
    replaceExtensionProperties(properties.filter((row) => String(row?.id || "") !== String(rowId || "")));
  }

  function renderCustomPropertyRow(row) {
    const rowId = String(row?.id || "").trim();
    const isExpanded = isBpmnRowExpanded(rowId);
    const previewName = String(row?.name || "").trim() || "name";
    const previewValue = String(row?.value || "").trim() || "—";
    return (
      <details
        key={rowId || String(row?.id || "")}
        className={`sidebarBpmnPropertyItem ${isExpanded ? "isOpen" : ""}`}
        open={isExpanded}
      >
        <summary
          className="sidebarBpmnPropertySummary"
          onClick={(event) => {
            event.preventDefault();
            setBpmnRowExpanded(rowId, !isExpanded);
          }}
        >
          <span className="sidebarBpmnPropertyPreviewKey" title={previewName}>{previewName}</span>
          <span className="sidebarBpmnPropertyPreviewValue" title={previewValue}>{previewValue}</span>
          <span className="sidebarBpmnPropertySummaryActions">
            <button
              type="button"
              className="secondaryBtn sidebarPropertiesActionBtn sidebarPropertiesActionBtn--tiny px-2"
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                setBpmnRowExpanded(rowId, !isExpanded);
              }}
              disabled={!!disabled || !!extensionStateBusy}
            >
              {isExpanded ? "Свернуть" : "Изменить"}
            </button>
            <button
              type="button"
              className="secondaryBtn sidebarPropertiesActionBtn sidebarPropertiesActionBtn--tiny px-2"
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                deletePropertyRow(row?.id);
              }}
              disabled={!!disabled || !!extensionStateBusy}
            >
              Удалить
            </button>
          </span>
        </summary>
        {isExpanded ? (
          <div className="sidebarBpmnPropertyEditor">
            <label className="sidebarBpmnEditorField">
              <span className="sidebarBpmnEditorLabel">Name</span>
              <input
                className="input w-full min-w-0"
                placeholder="Название"
                value={String(row?.name || "")}
                onChange={(event) => updatePropertyRow(row?.id, { name: event.target.value })}
                disabled={!!disabled || !!extensionStateBusy}
              />
            </label>
            <label className="sidebarBpmnEditorField">
              <span className="sidebarBpmnEditorLabel">Value</span>
              <input
                className="input w-full min-w-0"
                placeholder="Значение"
                value={String(row?.value || "")}
                onChange={(event) => updatePropertyRow(row?.id, { value: event.target.value })}
                disabled={!!disabled || !!extensionStateBusy}
              />
            </label>
          </div>
        ) : null}
      </details>
    );
  }

  function updateSchemaPropertyValue(propertyKey, value) {
    updateDraft(setSchemaPropertyValueInExtensionState({
      extensionStateRaw: state,
      dictionaryBundleRaw: dictionaryBundle,
      propertyKey,
      value,
    }));
  }

  function renderSchemaPropertyRow(row) {
    const logicalKey = String(row?.propertyKey || row?.name || "");
    const label = String(row?.propertyLabel || logicalKey || "");
    const options = Array.isArray(row?.options) ? row.options : [];
    const datalistId = selectedElementId ? `property_dict_${selectedElementId}_${logicalKey}` : "";
    const canAddTypedValue = shouldOfferAddDictionaryValueAction({
      inputValue: row?.value,
      options,
      allowCustomValue: row?.allowCustomValue,
      busy: dictionaryAddBusyKey === logicalKey,
    });
    return (
      <div key={`schema_property_${logicalKey}`} className="sidebarSchemaPropertyRow">
        <div className="sidebarSchemaPropertyLabel">
          <div className="sidebarSchemaPropertyHuman">{label}</div>
          {logicalKey ? <div className="sidebarSchemaPropertyKey">{logicalKey}</div> : null}
        </div>
        <div className="sidebarSchemaPropertyValueCell">
          <input
            className="input w-full min-w-0 flex-[1_1_220px]"
            placeholder={row?.inputMode === "free_text" ? "Введите значение" : "Выберите или введите значение"}
            value={String(row?.value || "")}
            list={row?.inputMode === "autocomplete" && options.length ? datalistId : undefined}
            onChange={(event) => updateSchemaPropertyValue(logicalKey, event.target.value)}
            disabled={!!disabled || !!extensionStateBusy}
            title={String(row?.value || "")}
          />
        </div>
        <div className="sidebarSchemaPropertyActionCell">
          <button
            type="button"
            className="secondaryBtn sidebarPropertiesActionBtn px-2.5"
            onClick={() => updateSchemaPropertyValue(logicalKey, "")}
            disabled={!!disabled || !!extensionStateBusy || !String(row?.value || "").trim()}
          >
            Очистить
          </button>
        </div>
        {row?.inputMode === "autocomplete" && options.length ? (
          <datalist id={datalistId}>
            {options.map((option) => (
              <option
                key={`schema_property_option_${logicalKey}_${String(option?.id || option?.optionValue || "")}`}
                value={String(option?.optionValue || "")}
              />
            ))}
          </datalist>
        ) : null}
        {row?.inputMode === "autocomplete" && !options.length ? (
          <div className="sidebarFieldHint sidebarSchemaPropertyHint">
            {row?.allowCustomValue ? "Пока нет значений. Можно ввести своё." : "Для этого свойства пока нет значений."}
          </div>
        ) : null}
        {canAddTypedValue ? (
          <div className="sidebarSchemaPropertyHint">
            <button
              type="button"
              className="secondaryBtn sidebarPropertiesActionBtn px-2.5"
              onClick={() => {
                void onAddDictionaryValue?.(logicalKey, row?.value);
              }}
              disabled={!!disabled || !!extensionStateBusy || dictionaryAddBusyKey === logicalKey}
            >
              {dictionaryAddBusyKey === logicalKey
                ? "Добавляю..."
                : `Добавить «${String(row?.value || "").trim()}» в справочник`}
            </button>
          </div>
        ) : null}
      </div>
    );
  }

  function updateListenerRow(rowId, patch = {}) {
    updateDraft({
      ...state,
      properties: {
        ...(state.properties || {}),
        extensionProperties: properties,
        extensionListeners: listeners.map((row) => (
          String(row?.id || "") === String(rowId || "")
            ? { ...row, ...patch }
            : row
        )),
      },
    });
  }

  function addListenerRow() {
    updateDraft({
      ...state,
      properties: {
        ...(state.properties || {}),
        extensionProperties: properties,
        extensionListeners: [...listeners, {
          id: `listener_draft_${Date.now()}`,
          event: "start",
          type: "expression",
          value: "",
        }],
      },
    });
  }

  function deleteListenerRow(rowId) {
    updateDraft({
      ...state,
      properties: {
        ...(state.properties || {}),
        extensionProperties: properties,
        extensionListeners: listeners.filter((row) => String(row?.id || "") !== String(rowId || "")),
      },
    });
  }

  if (!selectedElementId) {
    return <div className="sidebarEmptyHint">Выберите узел для настройки свойств.</div>;
  }

  if (!camundaPropertiesEditable) {
    return <div className="sidebarEmptyHint">Свойства доступны только для BPMN-узлов (не sequenceFlow).</div>;
  }

  const showSchemaHint = !hasDictionarySchema && !!normalizedOperationKey && !!dictionaryLoading && !dictionaryError;
  const showFallbackBlock = !hasDictionarySchema && (!normalizedOperationKey || !dictionaryLoading || !!dictionaryError);

  return (
    <div className="sidebarControlStack sidebarPropertiesLayout">
      <section className="sidebarPropertiesForm" data-testid="camunda-properties-group">
        <div className="sidebarPropertiesHeader">
          <div className="sidebarPropertiesTitleRow">
            <div className="sidebarPropertiesTitle">Свойства элемента</div>
            <SidebarInfoTip
              label="О секции «Свойства элемента»"
              text="Свойства текущего BPMN-элемента. Часть значений задаётся операцией, часть хранится как BPMN extension properties."
            />
          </div>
          {propertyCount ? <div className="sidebarPropertiesCount">{propertyCount}</div> : null}
        </div>

        <label className="sidebarPropertiesInlineToggle">
          <input
            type="checkbox"
            checked={!!showPropertiesOverlay}
            onChange={(event) => {
              void onShowPropertiesOverlayChange?.(!!event.target.checked);
            }}
            disabled={!!disabled || !!extensionStateBusy}
          />
          <span>Показывать свойства над задачей при выделении</span>
        </label>

        <label className="sidebarPropertiesInlineToggle">
          <input
            type="checkbox"
            checked={!!showPropertiesOverlayAlways}
            onChange={(event) => {
              void onShowPropertiesOverlayAlwaysChange?.(!!event.target.checked);
            }}
            disabled={!!disabled}
          />
          <span>Всегда показывать свойства над задачей</span>
        </label>

        <div className="sidebarPropertiesDivider" />

        <section className="sidebarPropertiesBlock">
          <div className="sidebarPropertiesBlockHead">
            <div className="sidebarPropertiesBlockTitle">Операция</div>
            <SidebarInfoTip
              label="Что такое операция"
              text="Операция определяет схему полей, доступных для этого узла."
            />
          </div>
          <div className="sidebarControlRow sidebarOperationRow">
            <select
              className="select w-full min-w-0 flex-[1_1_220px]"
              value={normalizedOperationKey}
              onChange={(event) => {
                void onOperationKeyChange?.(event.target.value);
              }}
              disabled={!!disabled || !!extensionStateBusy || !!operationSelectionBusy || typeof onOperationKeyChange !== "function"}
            >
              <option value="">Не выбрано</option>
              {normalizedOperationOptions.map((item) => (
                <option key={`operation_option_${item.key}`} value={item.key}>
                  {item.label && item.label !== item.key ? `${item.label} (${item.key})` : item.key}
                </option>
              ))}
              {normalizedOperationKey && !selectedOperationOption ? (
                <option value={normalizedOperationKey}>
                  {operationDisplayLabel && operationDisplayLabel !== normalizedOperationKey
                    ? `${operationDisplayLabel} (${normalizedOperationKey})`
                    : normalizedOperationKey}
                </option>
              ) : null}
            </select>
            <button
              type="button"
              className="secondaryBtn sidebarPropertiesActionBtn px-2.5"
              onClick={() => onOpenDictionaryManager?.()}
              disabled={!!disabled}
            >
              Справочник
            </button>
          </div>
          {!normalizedOperationKey && !hasOperationChoices ? (
            <div className="sidebarFieldHint mt-1">
              Для организации пока нет операций в справочнике.
            </div>
          ) : null}
          {normalizedOperationKey ? (
            <div className="sidebarOperationSummary">
              Операция: <span className="font-medium text-fg">{operationDisplayLabel || normalizedOperationKey}</span>
              <span className="text-muted"> ({normalizedOperationKey})</span>
            </div>
          ) : null}
        </section>

        <div className="sidebarPropertiesDivider" />

        <section className="sidebarPropertiesBlock">
          <div className="sidebarPropertiesBlockHead">
            <div className="sidebarPropertiesBlockTitle">Свойства операции</div>
            <SidebarInfoTip
              label="О свойствах операции"
              text="Поля, которые управляются выбранной операцией и её схемой."
            />
          </div>
          {dictionaryLoading ? <div className="sidebarFieldHint">Загружаю справочник организации...</div> : null}
          {dictionaryError ? <div className="selectedNodeFieldError">{dictionaryError}</div> : null}
          {showSchemaHint ? (
            <div className="sidebarFieldHint">
              Подгружаю свойства операции <span className="font-medium text-fg">{operationDisplayLabel || normalizedOperationKey}</span>.
            </div>
          ) : null}
          {hasDictionarySchema ? (
            <div className="sidebarPropertiesRows sidebarPropertiesRows--table">
              <div className="sidebarPropertiesTableHead" role="presentation">
                <span>Поле</span>
                <span>Значение</span>
                <span>Действие</span>
              </div>
              {dictionaryEditorModel.schemaRows.map((row) => renderSchemaPropertyRow(row))}
            </div>
          ) : null}
          {showFallbackBlock ? (
            <div className="sidebarFieldHint">
              {normalizedOperationKey
                ? (
                  <>
                    Для операции <span className="font-medium text-fg">{operationDisplayLabel || normalizedOperationKey}</span> схема не найдена. Используйте блок «Дополнительные BPMN-свойства».
                  </>
                )
                : "Выберите операцию, чтобы увидеть схему свойств. Пока доступен ручной режим."}
            </div>
          ) : null}
        </section>

        <div className="sidebarPropertiesDivider" />

        <section className="sidebarPropertiesBlock sidebarPropertiesBlock--secondary">
          <div className="sidebarPropertiesBlockHead">
            <div className="sidebarPropertiesBlockTitle">Дополнительные BPMN-свойства</div>
            <SidebarInfoTip
              label="О дополнительных BPMN-свойствах"
              text="Extension properties текущего элемента в формате name/value."
            />
          </div>
          {hasDictionarySchema ? (
            <>
              <div className="sidebarPropertiesRows sidebarPropertiesRows--table">
                <div className="sidebarPropertiesTableHead" role="presentation">
                  <span>Свойство</span>
                  <span>Значение</span>
                  <span>Действие</span>
                </div>
                {dictionaryEditorModel.customRows.map((row) => renderCustomPropertyRow(row))}
              </div>
              <div className="sidebarButtonRow">
                <button
                  type="button"
                  className="secondaryBtn sidebarPropertiesActionBtn px-2.5"
                  onClick={addPropertyRow}
                  disabled={!!disabled || !!extensionStateBusy}
                >
                  + Добавить BPMN-свойство
                </button>
              </div>
            </>
          ) : showFallbackBlock ? (
            <>
              <div className="sidebarPropertiesRows sidebarPropertiesRows--table">
                <div className="sidebarPropertiesTableHead" role="presentation">
                  <span>Свойство</span>
                  <span>Значение</span>
                  <span>Действие</span>
                </div>
                {visibleFallbackProperties.map((row) => renderCustomPropertyRow(row))}
              </div>
              <div className="sidebarButtonRow">
                <button
                  type="button"
                  className="secondaryBtn sidebarPropertiesActionBtn px-2.5"
                  onClick={addPropertyRow}
                  disabled={!!disabled || !!extensionStateBusy}
                >
                  + Добавить BPMN-свойство
                </button>
              </div>
            </>
          ) : (
            <div className="sidebarFieldHint">Ожидаю загрузку схемы операции.</div>
          )}
        </section>

        <div className="sidebarPropertiesDivider" />

        <div className="sidebarPropertiesBlockHead">
          <div className="sidebarPropertiesBlockTitle">Слушатели{listenerCount ? ` (${listenerCount})` : ""}</div>
          <SidebarInfoTip
            label="О слушателях"
            text="Дополнительные BPMN listeners для текущего элемента."
          />
        </div>
        <details
          className="sidebarPropertiesDisclosure"
          open={listenersOpen}
          onToggle={(event) => setListenersOpen(!!event.currentTarget.open)}
          data-testid="camunda-listeners-group"
        >
          <summary className="sidebarPropertiesDisclosureSummary">
            {listenersOpen ? "Скрыть" : "Показать"}
          </summary>
          <div className="mt-2 space-y-2">
            {listeners.map((row) => (
              <div key={String(row?.id || "")} className="sidebarControlRow sidebarListenerRow sidebarPropertiesInputRow">
                <select
                  className="input w-full min-w-0 flex-[0_1_90px]"
                  value={String(row?.event || "start")}
                  onChange={(event) => updateListenerRow(row?.id, { event: event.target.value })}
                  disabled={!!disabled || !!extensionStateBusy}
                >
                  {CAMUNDA_LISTENER_EVENTS.map((option) => (
                    <option key={`camunda_event_${option}`} value={option}>{option}</option>
                  ))}
                </select>
                <select
                  className="input w-full min-w-0 flex-[0_1_150px]"
                  value={String(row?.type || "expression")}
                  onChange={(event) => updateListenerRow(row?.id, { type: event.target.value })}
                  disabled={!!disabled || !!extensionStateBusy}
                >
                  {CAMUNDA_LISTENER_TYPES.map((option) => (
                    <option key={`camunda_listener_type_${option}`} value={option}>{option}</option>
                  ))}
                </select>
                <input
                  className="input w-full min-w-0 flex-[1_1_180px]"
                  placeholder="Значение"
                  value={String(row?.value || "")}
                  onChange={(event) => updateListenerRow(row?.id, { value: event.target.value })}
                  disabled={!!disabled || !!extensionStateBusy}
                />
                <button
                  type="button"
                  className="secondaryBtn sidebarPropertiesActionBtn px-2.5"
                  onClick={() => deleteListenerRow(row?.id)}
                  disabled={!!disabled || !!extensionStateBusy}
                >
                  Удалить
                </button>
              </div>
            ))}
            <div className="sidebarButtonRow">
              <button
                type="button"
                className="secondaryBtn sidebarPropertiesActionBtn px-2.5"
                onClick={addListenerRow}
                disabled={!!disabled || !!extensionStateBusy}
              >
                + Добавить слушатель
              </button>
            </div>
          </div>
        </details>

        <div className="sidebarPropertiesFooter sidebarButtonRow">
          <button
            type="button"
            className="primaryBtn sidebarPropertiesPrimaryAction px-3"
            onClick={() => {
              void onSaveExtensionState?.();
            }}
            disabled={!!disabled || !!extensionStateBusy}
          >
            {extensionStateBusy ? "Сохраняю..." : "Сохранить"}
          </button>
          <button
            type="button"
            className="secondaryBtn sidebarPropertiesActionBtn px-3"
            onClick={() => {
              void onResetExtensionState?.();
            }}
            disabled={!!disabled || !!extensionStateBusy}
          >
            Сбросить
          </button>
        </div>
      </section>

      {extensionStateInfo ? <div className="text-[11px] text-muted">{extensionStateInfo}</div> : null}
      {extensionStateErr ? <div className="selectedNodeFieldError">{extensionStateErr}</div> : null}
    </div>
  );
}
