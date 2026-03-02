import { useMemo, useState } from "react";
import {
  canonicalizeRobotMeta,
  getRobotMetaStatus,
  ROBOT_EXECUTOR_OPTIONS,
  robotMetaMissingFields,
} from "../../features/process/robotmeta/robotMeta";

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
          <select
            className="input h-8 min-h-0 w-full min-w-0"
            value={sequenceSelectValue}
            onChange={(event) => onNodePathSequenceChange?.(event.target.value)}
            disabled={!!disabled || !!nodePathBusy}
            title={selectedSequenceLabel}
          >
            <option value="">Не выбрано</option>
            {NODE_PATH_SEQUENCE_PRESETS.map((preset) => (
              <option key={preset.key} value={preset.key}>{preset.label}</option>
            ))}
            {normalizedNodePathSequence && !hasPresetSequence ? (
              <option value={normalizedNodePathSequence}>Пользовательская: {normalizedNodePathSequence}</option>
            ) : null}
          </select>
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
