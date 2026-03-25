import { useEffect, useMemo, useRef, useState } from "react";
import {
  canonicalizeRobotMeta,
  getRobotMetaStatus,
  ROBOT_EXECUTOR_OPTIONS,
  robotMetaMissingFields,
} from "../../features/process/robotmeta/robotMeta";
import {
  addZeebeTaskHeaderInExtensionState,
  addCamundaIoParameterInExtensionState,
  CAMUNDA_LISTENER_EVENTS,
  CAMUNDA_LISTENER_TYPES,
  createEmptyCamundaExtensionState,
  extractCamundaInputOutputParametersFromExtensionState,
  extractZeebeTaskHeadersFromExtensionState,
  normalizeCamundaExtensionState,
  patchCamundaIoParameterInExtensionState,
  patchZeebeTaskHeaderInExtensionState,
  removeCamundaIoParameterFromExtensionState,
  removeZeebeTaskHeaderFromExtensionState,
} from "../../features/process/camunda/camundaExtensions";
import {
  buildVisibleExtensionPropertyRows,
  buildPropertyDictionaryEditorModel,
  countVisibleExtensionPropertyRows,
  setSchemaPropertyValueInExtensionState,
  shouldOfferAddDictionaryValueAction,
} from "../../features/process/camunda/propertyDictionaryModel";
import { deriveNodePathCompareSummary } from "./nodePathCompare";
import { resolveNodePathStatusState } from "./nodePathSyncState";
import SidebarTrustStatus from "./SidebarTrustStatus";

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function clampInlineValue(value, limit = 120) {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  if (!text) return "";
  if (text.length <= limit) return text;
  return `${text.slice(0, Math.max(18, limit - 1)).trimEnd()}…`;
}

function camundaIoTypeLabel(shapeRaw) {
  const shape = String(shapeRaw || "text").toLowerCase();
  if (shape === "expression") return "expr";
  if (shape === "empty") return "empty";
  if (shape === "script") return "script";
  if (shape === "nested") return "nested";
  if (shape === "mapping") return "map";
  return "text";
}

function normalizeNodePathTag(value) {
  const tag = String(value || "").trim().toUpperCase();
  if (tag === "P0" || tag === "P1" || tag === "P2") return tag;
  return "";
}

function normalizeSequenceKey(value) {
  return String(value || "").trim().toLowerCase();
}

function formatSequenceLabel(value) {
  const normalized = normalizeSequenceKey(value);
  if (!normalized) return "Не выбрано";
  return NODE_PATH_SEQUENCE_PRESETS.find((preset) => preset.key === normalized)?.label || value;
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

const NODE_PATH_SYNC_PREVIEW_STATES = ["saved", "local", "syncing", "offline", "attention", "error"];

const NODE_PATH_SYNC_STATUS_META = {
  saved: {
    label: "Сохранено",
    helper: "Все изменения синхронизированы.",
    tone: "saved",
    cta: null,
  },
  local: {
    label: "Локально сохранено",
    helper: "Есть локальные изменения.",
    tone: "local",
    cta: null,
  },
  syncing: {
    label: "Синхронизация…",
    helper: "Изменения отправляются.",
    tone: "syncing",
    cta: null,
  },
  offline: {
    label: "Оффлайн",
    helper: "Нет сети. Изменения пока останутся локально.",
    tone: "offline",
    cta: null,
  },
  attention: {
    label: "Требует внимания",
    helper: "Сохранённая версия изменилась. Нужно сверить изменения.",
    tone: "attention",
    cta: "Принять сохранённую",
  },
  error: {
    label: "Ошибка",
    helper: "Не удалось синхронизировать изменения. Локальная версия сохранена.",
    tone: "error",
    cta: "Повторить",
  },
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
  nodePathSharedSnapshot = null,
  nodePathSequenceKey = "",
  nodePathSyncState = "saved",
  nodePathBusy = false,
  nodePathErr = "",
  nodePathInfo = "",
  selectedNodeCount = 0,
  bulkSelectionCount = 0,
  onToggleNodePathTag,
  onNodePathSequenceChange,
  onApplyNodePath,
  onResetNodePath,
  onAcceptSharedNodePath,
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
  nodePathSyncPreviewState = "",
  disabled = false,
}) {
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [sequenceOpen, setSequenceOpen] = useState(false);
  const [syncPreviewEnabled, setSyncPreviewEnabled] = useState(false);
  const [syncPreviewState, setSyncPreviewState] = useState("saved");
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
  const isDevRuntime = typeof import.meta !== "undefined" && !!import.meta.env?.DEV;
  const hasDebugPreviewAccess = isDevRuntime
    && typeof window !== "undefined"
    && window.localStorage?.getItem("fpc:nodepath-status-preview") === "1";
  const requestedSyncPreviewState = String(nodePathSyncPreviewState || "").trim().toLowerCase();
  const previewSyncState = NODE_PATH_SYNC_PREVIEW_STATES.includes(requestedSyncPreviewState)
    ? requestedSyncPreviewState
    : syncPreviewState;
  const isPreviewMode = !!requestedSyncPreviewState || (hasDebugPreviewAccess && syncPreviewEnabled);
  const resolvedPreviewOverride = requestedSyncPreviewState
    || ((hasDebugPreviewAccess && syncPreviewEnabled) ? previewSyncState : "");
  const resolvedSyncPreviewState = resolveNodePathStatusState({
    runtimeState: nodePathSyncState,
    previewState: resolvedPreviewOverride,
    previewEnabled: syncPreviewEnabled,
    isDevRuntime: hasDebugPreviewAccess,
  });
  const statusMeta = NODE_PATH_SYNC_STATUS_META[resolvedSyncPreviewState] || NODE_PATH_SYNC_STATUS_META.saved;
  const showSyncPreviewSwitcher = hasDebugPreviewAccess && !requestedSyncPreviewState;
  const rawNodePathCompareSummary = useMemo(() => deriveNodePathCompareSummary({
    localPaths: nodePathPaths,
    sharedPaths: nodePathSharedSnapshot?.paths,
    localSequenceKey: nodePathSequenceKey,
    sharedSequenceKey: nodePathSharedSnapshot?.sequence_key,
  }), [nodePathPaths, nodePathSequenceKey, nodePathSharedSnapshot]);
  const nodePathCompareSummary = useMemo(() => ({
    ...rawNodePathCompareSummary,
    localSequenceLabel: formatSequenceLabel(rawNodePathCompareSummary.localSequenceKey),
    sharedSequenceLabel: formatSequenceLabel(rawNodePathCompareSummary.sharedSequenceKey),
  }), [rawNodePathCompareSummary]);
  const showAttentionCompare = resolvedSyncPreviewState === "attention" && nodePathCompareSummary.hasDifferences;
  const actionConsequenceItems = showAttentionCompare ? [
    {
      label: "Применить",
      text: "Заменит сохранённую версию текущей локальной разметкой этого узла.",
    },
    {
      label: "Принять сохранённую",
      text: "Отбросит локальные отличия и вернёт сохранённую версию для этого узла.",
    },
    {
      label: "Сбросить",
      text: "Очистит и локальную, и сохранённую разметку этого узла.",
    },
  ] : [];

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
          <SidebarTrustStatus
            title={<span>Пути и последовательность</span>}
            label={statusMeta.label}
            helper={resolvedSyncPreviewState === "error" || resolvedSyncPreviewState === "attention" ? statusMeta.helper : ""}
            helperMeta=""
            tone={statusMeta.tone}
            ctaLabel={statusMeta.cta}
            onCta={() => {
              if (!isPreviewMode && resolvedSyncPreviewState === "attention") {
                return onAcceptSharedNodePath?.();
              }
              if (!isPreviewMode && resolvedSyncPreviewState === "error") {
                return onApplyNodePath?.();
              }
              return undefined;
            }}
            ctaDisabled={!isPreviewMode && (resolvedSyncPreviewState === "error" || resolvedSyncPreviewState === "attention")
              ? !!disabled || !!nodePathBusy
              : false}
            ctaVariant={resolvedSyncPreviewState === "error" ? "primary" : "secondary"}
            testIdPrefix="nodepath-sync-status"
          />
          {showAttentionCompare ? (
            <div
              className="rounded-md border border-warning/35 bg-warning/8 px-2.5 py-2 text-[11px] text-warning"
              data-testid="nodepath-attention-compare"
            >
              <div className="font-semibold text-warning">Что отличается</div>
              <div className="mt-1 grid gap-1.5 sm:grid-cols-2">
                {[
                  { key: "local", title: "Локально", paths: nodePathCompareSummary.localPaths, sequence: nodePathCompareSummary.localSequenceLabel, tone: "warning" },
                  { key: "shared", title: "Сохранено", paths: nodePathCompareSummary.sharedPaths, sequence: nodePathCompareSummary.sharedSequenceLabel, tone: "primary" },
                  { key: "local-only", title: "Только локально", paths: nodePathCompareSummary.localOnlyPaths, sequence: nodePathCompareSummary.sequenceDiffers ? nodePathCompareSummary.localSequenceLabel : "", tone: "warning" },
                  { key: "shared-only", title: "Только в сохранённой", paths: nodePathCompareSummary.sharedOnlyPaths, sequence: nodePathCompareSummary.sequenceDiffers ? nodePathCompareSummary.sharedSequenceLabel : "", tone: "primary" },
                ].map((section) => (
                  <div
                    key={`nodepath_compare_${section.key}`}
                    className="rounded border border-current/15 bg-white/50 px-2 py-1.5"
                    data-testid={`nodepath-compare-${section.key}`}
                  >
                    <div className="font-medium">{section.title}</div>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {section.paths.length
                        ? section.paths.map((tag) => (
                          <span
                            key={`${section.title}_${tag}`}
                            className="rounded-full border border-current/20 px-1.5 py-0.5 text-[10px] uppercase tracking-[0.08em]"
                          >
                            {tag}
                          </span>
                        ))
                        : <span className="text-muted">Нет</span>}
                    </div>
                    {(section.title === "Локально" || section.title === "Сохранено" || nodePathCompareSummary.sequenceDiffers) ? (
                      <div className="mt-1 text-[10px] text-muted">
                        Последовательность: {section.sequence || "Не выбрано"}
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
              <div className="mt-2 rounded border border-current/15 bg-white/50 px-2 py-1.5" data-testid="nodepath-attention-actions-help">
                <div className="font-medium">Что сделают действия</div>
                <div className="mt-1 grid gap-1">
                  {actionConsequenceItems.map((item) => (
                    <div key={`nodepath_action_help_${item.label}`}>
                      <span className="font-medium">{item.label}:</span> {item.text}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : null}
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
              <svg viewBox="0 0 16 16" className={`sidebarSelectButtonChevron ${sequenceOpen ? "isOpen" : ""}`} aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 6l4 4 4-4" /></svg>
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
            {showSyncPreviewSwitcher ? (
              <div className="sidebarStatusPreviewGroup" data-testid="nodepath-sync-status-preview-switcher">
                <label className="inline-flex items-center gap-2 text-[11px] text-muted">
                  <input
                    type="checkbox"
                    checked={syncPreviewEnabled}
                    onChange={(event) => setSyncPreviewEnabled(!!event.target.checked)}
                  />
                  Превью остальных статусов
                </label>
                <div className="sidebarButtonRow">
                  {NODE_PATH_SYNC_PREVIEW_STATES.map((state) => {
                    const meta = NODE_PATH_SYNC_STATUS_META[state];
                    const active = state === resolvedSyncPreviewState;
                    return (
                      <button
                        key={`nodepath_sync_preview_${state}`}
                        type="button"
                        className={`${active ? "primaryBtn" : "secondaryBtn"} h-7 px-2 text-[11px]`}
                        onClick={() => setSyncPreviewState(state)}
                        disabled={!syncPreviewEnabled}
                      >
                        {meta.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : null}
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
  stepTimeSyncState = "saved",
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
  const stepTimeStatusMeta = {
    saved: {
      label: "Сохранено",
      helper: "",
      tone: "saved",
      cta: null,
    },
    local: {
      label: "Есть локальные изменения",
      helper: "",
      tone: "local",
      cta: null,
    },
    syncing: {
      label: "Синхронизация…",
      helper: "",
      tone: "syncing",
      cta: null,
    },
    error: {
      label: "Ошибка",
      helper: "Не удалось сохранить время шага. Значение осталось в поле.",
      tone: "error",
      cta: "Повторить",
    },
  };
  const statusMeta = stepTimeStatusMeta[String(stepTimeSyncState || "").trim().toLowerCase()] || stepTimeStatusMeta.saved;

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
      <SidebarTrustStatus
        title={<span>Время шага</span>}
        label={statusMeta.label}
        helper={statusMeta.helper}
        tone={statusMeta.tone}
        ctaLabel={statusMeta.cta}
        onCta={onSaveStepTime}
        ctaDisabled={timeInputDisabled}
        testIdPrefix="step-time-status"
      />
      <div className="flex items-center justify-between gap-2">
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
  robotMetaSyncState = "saved",
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
  const robotMetaTrustStatusMeta = {
    saved: {
      label: "Сохранено",
      helper: "",
      tone: "saved",
      cta: null,
    },
    local: {
      label: "Есть локальные изменения",
      helper: "",
      tone: "local",
      cta: null,
    },
    syncing: {
      label: "Синхронизация…",
      helper: "",
      tone: "syncing",
      cta: null,
    },
    error: {
      label: "Ошибка",
      helper: "Не удалось сохранить Robot Meta. Изменения остались в форме.",
      tone: "error",
      cta: "Повторить",
    },
  };
  const trustStatusMeta = robotMetaTrustStatusMeta[String(robotMetaSyncState || "").trim().toLowerCase()] || robotMetaTrustStatusMeta.saved;

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
      <SidebarTrustStatus
        title={(
          <span className="inline-flex items-center gap-2">
            <span>Robot Meta</span>
            {robotMetaStatus !== "none" ? (
              <span
                className={`selectedNodeChip selectedNodeChip--robotmeta ${robotMetaStatus === "ready" ? "is-ready" : ""} ${robotMetaStatus === "incomplete" ? "is-incomplete" : ""}`}
                data-testid="robotmeta-status-chip"
              >
                {robotMetaStatusLabel}
              </span>
            ) : null}
          </span>
        )}
        label={trustStatusMeta.label}
        helper={trustStatusMeta.helper}
        tone={trustStatusMeta.tone}
        ctaLabel={trustStatusMeta.cta}
        onCta={onSaveRobotMeta}
        ctaDisabled={!!disabled || !!robotMetaBusy}
        testIdPrefix="robotmeta-trust-status"
      />

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
  selectedElementType = "",
  selectedBpmnPropertyContext = null,
  selectedBpmnOverlayCompanionSummary = null,
  camundaPropertiesEditable = false,
  extensionStateDraft = null,
  extensionStateSyncState = "saved",
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
  onExtensionStateDraftChange,
  onOperationKeyChange,
  onAddDictionaryValue,
  onOpenDictionaryManager,
  onSaveExtensionState,
  onResetExtensionState,
  onRetryExtensionState,
  onFocusDrawioCompanion,
  disabled = false,
}) {
  const [listenersOpen, setListenersOpen] = useState(true);
  const [operationOpen, setOperationOpen] = useState(false);
  const [operationPropertiesOpen, setOperationPropertiesOpen] = useState(false);
  const [additionalBpmnOpen, setAdditionalBpmnOpen] = useState(false);
  const [camundaIoOpen, setCamundaIoOpen] = useState(false);
  const [zeebeTaskHeadersOpen, setZeebeTaskHeadersOpen] = useState(false);
  const [overlayCompanionsExpanded, setOverlayCompanionsExpanded] = useState(false);
  const [expandedCamundaScripts, setExpandedCamundaScripts] = useState({});
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
  const propertyContext = selectedBpmnPropertyContext && typeof selectedBpmnPropertyContext === "object"
    ? selectedBpmnPropertyContext
    : { type: "", general: [], routing: [], messaging: [], execution: [], vendor: [], inspectOnly: [] };
  const dictionaryEditorModel = useMemo(
    () => buildPropertyDictionaryEditorModel({ extensionStateRaw: state, dictionaryBundleRaw: dictionaryBundle }),
    [state, dictionaryBundle],
  );
  const camundaIoModel = useMemo(
    () => extractCamundaInputOutputParametersFromExtensionState(state, { includeZeebe: true }),
    [state],
  );
  const zeebeTaskHeadersModel = useMemo(
    () => extractZeebeTaskHeadersFromExtensionState(state),
    [state],
  );
  const camundaInputRows = Array.isArray(camundaIoModel?.inputRows) ? camundaIoModel.inputRows : [];
  const camundaOutputRows = Array.isArray(camundaIoModel?.outputRows) ? camundaIoModel.outputRows : [];
  const zeebeTaskHeaderRows = Array.isArray(zeebeTaskHeadersModel?.rows) ? zeebeTaskHeadersModel.rows : [];
  const visibleFallbackProperties = useMemo(
    () => buildVisibleExtensionPropertyRows(state).rows,
    [state],
  );
  const hasDictionarySchema = dictionaryEditorModel.hasSchema;
  const propertyCount = useMemo(
    () => countVisibleExtensionPropertyRows(state),
    [state],
  );
  const operationPropertiesCount = Array.isArray(dictionaryEditorModel?.schemaRows)
    ? dictionaryEditorModel.schemaRows.length
    : 0;
  const overlayCompanionSummary = selectedBpmnOverlayCompanionSummary && typeof selectedBpmnOverlayCompanionSummary === "object"
    ? selectedBpmnOverlayCompanionSummary
    : {
      hasOverlayCompanions: false,
      companionCount: 0,
      companionKindsSummary: { text: 0, highlight: 0 },
      companionStatusSummary: { anchored: 0, invalid: 0 },
      companions: [],
      hasIssues: false,
      issueCounts: { invalid: 0 },
      validationDeferred: false,
    };
  const listenerCount = normalizedState.properties.extensionListeners.length;
  const overlayCompanionCount = Number(overlayCompanionSummary?.companionCount || 0);
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
  const overlayCompanionKindsLabel = [
    overlayCompanionSummary?.companionKindsSummary?.text ? `notes ${Number(overlayCompanionSummary.companionKindsSummary.text)}` : "",
    overlayCompanionSummary?.companionKindsSummary?.highlight ? `highlights ${Number(overlayCompanionSummary.companionKindsSummary.highlight)}` : "",
  ].filter(Boolean).join(" · ");
  const visibleOverlayCompanions = overlayCompanionsExpanded
    ? asArray(overlayCompanionSummary.companions)
    : asArray(overlayCompanionSummary.previewCompanions);

  useEffect(() => {
    setOverlayCompanionsExpanded(false);
  }, [selectedElementId, overlayCompanionSummary.companionCount]);

  useEffect(() => {
    // Keep Camunda I/O collapsed by default when entering a node.
    setCamundaIoOpen(false);
    setZeebeTaskHeadersOpen(false);
  }, [selectedElementId]);
  const operationDisplayLabel = String(operationLabel || selectedOperationOption?.label || normalizedOperationKey || "").trim();
  const extensionStateStatusMetaMap = {
    saved: {
      label: "Сохранено",
      helper: "",
      tone: "saved",
      cta: null,
    },
    local: {
      label: "Есть локальные изменения",
      helper: "",
      tone: "local",
      cta: null,
    },
    syncing: {
      label: "Синхронизация…",
      helper: "",
      tone: "syncing",
      cta: null,
    },
    error: {
      label: "Ошибка",
      helper: "Не удалось сохранить extension-state. Изменения остались в форме.",
      tone: "error",
      cta: "Повторить",
    },
  };
  const extensionStateStatusMeta = extensionStateStatusMetaMap[String(extensionStateSyncState || "").trim().toLowerCase()]
    || extensionStateStatusMetaMap.saved;

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

  useEffect(() => {
    const knownIoIds = new Set(
      [...camundaInputRows, ...camundaOutputRows]
        .map((row) => String(row?.id || "").trim())
        .filter(Boolean),
    );
    setExpandedCamundaScripts((prev) => {
      const current = prev && typeof prev === "object" ? prev : {};
      let changed = false;
      const next = {};
      Object.keys(current).forEach((rowId) => {
        if (knownIoIds.has(rowId) && !!current[rowId]) {
          next[rowId] = true;
        } else {
          changed = true;
        }
      });
      return changed ? next : current;
    });
  }, [camundaInputRows, camundaOutputRows]);

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

  function updateCamundaIoParameter(rowRef, patch = {}) {
    const nextState = patchCamundaIoParameterInExtensionState({
      extensionStateRaw: state,
      parameterRef: rowRef,
      patch,
    });
    updateDraft(nextState);
  }

  function addCamundaIoRow(direction = "input") {
    const nextState = addCamundaIoParameterInExtensionState({
      extensionStateRaw: state,
      direction,
      draft: {
        name: "",
        value: "",
      },
    });
    updateDraft(nextState);
  }

  function deleteCamundaIoRow(rowRef) {
    const rowId = String(rowRef?.id || "").trim();
    if (rowId) {
      setExpandedCamundaScripts((prev) => {
        if (!prev || !prev[rowId]) return prev;
        const next = { ...prev };
        delete next[rowId];
        return next;
      });
    }
    const nextState = removeCamundaIoParameterFromExtensionState({
      extensionStateRaw: state,
      parameterRef: rowRef,
    });
    updateDraft(nextState);
  }

  function updateZeebeTaskHeaderRow(rowRef, patch = {}) {
    const nextState = patchZeebeTaskHeaderInExtensionState({
      extensionStateRaw: state,
      headerRef: rowRef,
      patch,
    });
    updateDraft(nextState);
  }

  function addZeebeTaskHeaderRow() {
    const nextState = addZeebeTaskHeaderInExtensionState({
      extensionStateRaw: state,
      draft: {
        key: "",
        value: "",
      },
    });
    updateDraft(nextState);
  }

  function deleteZeebeTaskHeaderRow(rowRef) {
    const nextState = removeZeebeTaskHeaderFromExtensionState({
      extensionStateRaw: state,
      headerRef: rowRef,
    });
    updateDraft(nextState);
  }

  function isCamundaScriptExpanded(rowIdRaw) {
    const rowId = String(rowIdRaw || "").trim();
    if (!rowId) return false;
    return !!expandedCamundaScripts[rowId];
  }

  function setCamundaScriptExpanded(rowIdRaw, nextOpen) {
    const rowId = String(rowIdRaw || "").trim();
    if (!rowId) return;
    setExpandedCamundaScripts((prev) => {
      const next = { ...(prev || {}) };
      if (nextOpen) {
        next[rowId] = true;
      } else {
        delete next[rowId];
      }
      return next;
    });
  }

  function renderCamundaIoValueCell(row) {
    const shape = String(row?.shape || "text");
    const valueText = String(row?.value || "");
    const isReadonlyValue = shape === "script" || shape === "nested";
    if (!isReadonlyValue) {
      return (
        <input
          className="sidebarCamundaIoInput"
          placeholder={shape === "empty" ? "Empty" : "Value"}
          value={valueText}
          onChange={(event) => updateCamundaIoParameter(row, { value: event.target.value })}
          disabled={!!disabled || !!extensionStateBusy}
          title={valueText}
        />
      );
    }
    if (shape === "script") {
      const rowId = String(row?.id || "");
      const scriptFormat = String(row?.scriptFormat || "script");
      const isOpen = isCamundaScriptExpanded(rowId);
      const inlinePreview = clampInlineValue(valueText, 88) || "Empty script";
      return (
        <details
          className={`sidebarCamundaIoScriptPreview ${isOpen ? "isOpen" : ""}`}
          open={isOpen}
          onToggle={(event) => {
            setCamundaScriptExpanded(rowId, !!event.currentTarget.open);
          }}
        >
          <summary className="sidebarCamundaIoScriptSummary">
            <span className="sidebarCamundaIoScriptSummaryMeta">{scriptFormat}</span>
            <span className="sidebarCamundaIoScriptSummaryText" title={valueText || "Empty"}>
              {inlinePreview}
            </span>
          </summary>
          <pre className="sidebarCamundaIoScriptBody">{valueText || "Empty"}</pre>
        </details>
      );
    }
    const nestedPreview = clampInlineValue(valueText, 88) || "Nested value";
    return (
      <div className="sidebarCamundaIoReadonlyValue" title={valueText || nestedPreview}>
        {nestedPreview}
      </div>
    );
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
          <button
            type="button"
            className="secondaryBtn sidebarPropertiesActionBtn sidebarPropertiesActionBtn--tiny sidebarBpmnPropertyEditBtn"
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
            className="secondaryBtn sidebarPropertiesIconBtn sidebarPropertiesIconBtn--danger"
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              deletePropertyRow(row?.id);
            }}
            disabled={!!disabled || !!extensionStateBusy}
            aria-label={`Удалить BPMN-свойство ${previewName}`}
            title={`Удалить BPMN-свойство ${previewName}`}
          >
            ×
          </button>
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

  function renderCamundaIoRow(row) {
    const rowId = String(row?.id || "");
    const direction = String(row?.direction || "input");
    const connectorMeta = String(row?.connectorId || "").trim();
    const shape = String(row?.shape || "text");
    const typeLabel = camundaIoTypeLabel(shape);
    const isReadonlyValue = shape === "script" || shape === "nested";
    const nameValue = String(row?.name || "");
    return (
      <div key={rowId} className={`sidebarCamundaIoRow ${isReadonlyValue ? "isReadonlyValue" : ""}`}>
        <div className="sidebarCamundaIoCell sidebarCamundaIoCell--name">
          <div className="sidebarCamundaIoNameWrap">
            <input
              className="sidebarCamundaIoInput"
              placeholder="name"
              value={nameValue}
              onChange={(event) => updateCamundaIoParameter(row, { name: event.target.value })}
              disabled={!!disabled || !!extensionStateBusy}
              title={nameValue}
            />
            {connectorMeta ? (
              <span className="sidebarCamundaIoMetaInline" title={`connector: ${connectorMeta}`}>
                {connectorMeta}
              </span>
            ) : null}
          </div>
        </div>
        <div className="sidebarCamundaIoCell sidebarCamundaIoCell--type">
          <span className={`sidebarCamundaIoShape shape-${shape}`}>{typeLabel}</span>
        </div>
        <div className="sidebarCamundaIoCell sidebarCamundaIoCell--value">
          {renderCamundaIoValueCell(row)}
        </div>
        <div className="sidebarCamundaIoCell sidebarCamundaIoCell--action">
          <button
            type="button"
            className="secondaryBtn sidebarCamundaIoDeleteBtn"
            onClick={() => deleteCamundaIoRow(row)}
            disabled={!!disabled || !!extensionStateBusy}
            aria-label={direction === "output" ? "Удалить output parameter" : "Удалить input parameter"}
            title="Удалить параметр"
          >
            ×
          </button>
        </div>
      </div>
    );
  }

  function renderCamundaIoSection({
    title,
    direction,
    rows,
  }) {
    const normalizedDirection = String(direction || "input").toLowerCase() === "output" ? "output" : "input";
    const addLabel = normalizedDirection === "output" ? "+ Add output" : "+ Add input";
    const emptyText = normalizedDirection === "output"
      ? "Нет output parameters. Добавьте первый параметр."
      : "Нет input parameters. Добавьте первый параметр.";
    return (
      <div className="sidebarCamundaIoSection">
        <div className="sidebarCamundaIoSectionHead">
          <div className="sidebarCamundaIoSectionTitle">{title} ({rows.length})</div>
          <button
            type="button"
            className="secondaryBtn sidebarCamundaIoAddBtn"
            onClick={() => addCamundaIoRow(normalizedDirection)}
            disabled={!!disabled || !!extensionStateBusy}
          >
            {addLabel}
          </button>
        </div>
        <div className="sidebarCamundaIoTableWrap">
          <div className="sidebarCamundaIoTableHead" role="presentation">
            <span>Name</span>
            <span>Type</span>
            <span>Value</span>
            <span className="isCenter">Action</span>
          </div>
          <div className="sidebarCamundaIoTableBody">
            {rows.length ? rows.map((row) => renderCamundaIoRow(row)) : (
              <div className="sidebarCamundaIoEmptyRow">{emptyText}</div>
            )}
          </div>
        </div>
      </div>
    );
  }

  function renderZeebeTaskHeaderRow(row) {
    const rowId = String(row?.id || "");
    const keyValue = String(row?.key || "");
    const valueText = String(row?.value || "");
    return (
      <div key={rowId} className="sidebarCamundaIoRow">
        <div className="sidebarCamundaIoCell sidebarCamundaIoCell--name">
          <input
            className="sidebarCamundaIoInput"
            placeholder="key"
            value={keyValue}
            onChange={(event) => updateZeebeTaskHeaderRow(row, { key: event.target.value })}
            disabled={!!disabled || !!extensionStateBusy}
            title={keyValue}
          />
        </div>
        <div className="sidebarCamundaIoCell sidebarCamundaIoCell--type">
          <span className="sidebarCamundaIoShape shape-text">header</span>
        </div>
        <div className="sidebarCamundaIoCell sidebarCamundaIoCell--value">
          <input
            className="sidebarCamundaIoInput"
            placeholder="value"
            value={valueText}
            onChange={(event) => updateZeebeTaskHeaderRow(row, { value: event.target.value })}
            disabled={!!disabled || !!extensionStateBusy}
            title={valueText}
          />
        </div>
        <div className="sidebarCamundaIoCell sidebarCamundaIoCell--action">
          <button
            type="button"
            className="secondaryBtn sidebarCamundaIoDeleteBtn"
            onClick={() => deleteZeebeTaskHeaderRow(row)}
            disabled={!!disabled || !!extensionStateBusy}
            aria-label="Удалить Zeebe task header"
            title="Удалить header"
          >
            ×
          </button>
        </div>
      </div>
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
    return <div className="sidebarEmptyHint">Свойства доступны только для BPMN-элементов.</div>;
  }

  const showSchemaHint = !hasDictionarySchema && !!normalizedOperationKey && !!dictionaryLoading && !dictionaryError;
  const showFallbackBlock = !hasDictionarySchema && (!normalizedOperationKey || !dictionaryLoading || !!dictionaryError);
  const additionalBpmnCount = hasDictionarySchema
    ? (Array.isArray(dictionaryEditorModel?.customRows) ? dictionaryEditorModel.customRows.length : 0)
    : (showFallbackBlock ? visibleFallbackProperties.length : 0);
  const camundaIoCount = camundaInputRows.length + camundaOutputRows.length;
  const zeebeTaskHeadersCount = zeebeTaskHeaderRows.length;
  const propertySections = [
    { key: "general", title: "General", rows: asArray(propertyContext.general) },
    { key: "routing", title: "Routing / Conditions", rows: asArray(propertyContext.routing) },
    { key: "messaging", title: "Messaging / Signals", rows: asArray(propertyContext.messaging) },
    { key: "execution", title: "Execution", rows: asArray(propertyContext.execution) },
    { key: "vendor", title: "Vendor extensions", rows: asArray(propertyContext.vendor) },
  ].filter((section) => section.rows.length > 0);
  const propertyContextCount = propertySections.reduce(
    (sum, section) => sum + asArray(section?.rows).length,
    0,
  );
  const groupedPropertiesCount = operationPropertiesCount + additionalBpmnCount + propertyContextCount + overlayCompanionCount;
  const groupedInputOutputCount = camundaIoCount + zeebeTaskHeadersCount;

  function renderPropertyContextSection(section) {
    const rows = asArray(section?.rows);
    if (!rows.length) return null;
    const sectionTitle = String(section?.title || "");
    return (
      <section key={String(section?.key || "")} className="sidebarPropertiesBlock sidebarPropertiesBlock--secondary">
        <div className="sidebarPropertiesBlockHead">
          <div className="sidebarPropertiesBlockTitle">{sectionTitle}</div>
          <div className="sidebarPropertiesBlockMeta" aria-label={`Количество полей в секции ${sectionTitle}`}>
            {rows.length}
          </div>
          <SidebarInfoTip
            label={`О секции ${sectionTitle}`}
            text="Truthful BPMN contract, вычитанный из XML. Поля в этой секции пока inspect-only, если не вынесены в отдельный редактируемый блок ниже."
          />
        </div>
        <div className="sidebarPropertiesRows sidebarPropertiesRows--table sidebarContextRows">
          <div className="sidebarPropertiesTableHead" role="presentation">
            <span>Свойство</span>
            <span>Значение</span>
            <span>Статус</span>
          </div>
          {rows.map((row) => (
            <div key={`${String(section?.key || "")}_${String(row?.key || row?.label || "")}`} className="sidebarSchemaPropertyRow sidebarSchemaPropertyRow--context">
              <div className="sidebarSchemaPropertyLabel">
                {(() => {
                  const human = String(row?.label || row?.key || "").trim();
                  const key = String(row?.key || "").trim();
                  const showMeta = !!key && key.toLowerCase() !== human.toLowerCase();
                  return (
                    <div className="sidebarSchemaPropertyPrimaryLine">
                      <span className="sidebarSchemaPropertyHuman">{human || "—"}</span>
                      {showMeta ? <span className="sidebarSchemaPropertyMeta">{key}</span> : null}
                    </div>
                  );
                })()}
              </div>
              <div className="sidebarSchemaPropertyValueCell">
                <div className="sidebarSchemaPropertyValueText" title={String(row?.value || "")}>
                  {String(row?.value || "—")}
                </div>
              </div>
              <div className="sidebarSchemaPropertyActionCell">
                <span className="sidebarStatusHint">{row?.editable ? "Editable" : "Inspect-only"}</span>
              </div>
            </div>
          ))}
        </div>
      </section>
    );
  }

  function renderOverlayCompanionsSection() {
    return (
      <section className="sidebarPropertiesBlock sidebarPropertiesBlock--secondary" data-testid="bpmn-overlay-companions-block">
        <div className="sidebarPropertiesBlockHead">
          <div className="sidebarPropertiesBlockTitle">Overlay companions</div>
          <div className="sidebarPropertiesBlockMeta" aria-label="Количество связанных overlay companions">
            {overlayCompanionCount}
          </div>
          <SidebarInfoTip
            label="О companion overlay"
            text="Derived companion view из текущих draw.io anchors. Это не BPMN truth и не второй источник якорей."
          />
        </div>
        {overlayCompanionSummary.validationDeferred ? (
          <div className="sidebarFieldHint">Проверка overlay companions ждёт готовности BPMN hydrate.</div>
        ) : null}
        {!overlayCompanionSummary.validationDeferred && !overlayCompanionSummary.hasOverlayCompanions ? (
          <div className="sidebarFieldHint">У этого BPMN узла сейчас нет связанных overlay annotations/highlights.</div>
        ) : null}
        {!overlayCompanionSummary.validationDeferred && overlayCompanionSummary.hasOverlayCompanions ? (
          <>
            <div className="sidebarFieldHint">
              Найдено <span className="font-medium text-fg">{Number(overlayCompanionSummary.companionCount || 0)}</span>
              {" "}overlay companions{overlayCompanionKindsLabel ? ` · ${overlayCompanionKindsLabel}` : ""}.
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <span className="sidebarBadge">anchored {Number(overlayCompanionSummary?.companionStatusSummary?.anchored || 0)}</span>
              <span className={`sidebarBadge ${overlayCompanionSummary.hasIssues ? "sidebarBadgeWarn" : ""}`}>
                invalid {Number(overlayCompanionSummary?.companionStatusSummary?.invalid || 0)}
              </span>
            </div>
            <div className={`sidebarFieldHint mt-2 ${overlayCompanionSummary.summaryTone === "warning" ? "text-warning" : ""}`}>
              {overlayCompanionSummary.hasIssues
                ? `Требуют внимания: ${Number(overlayCompanionSummary.invalidCount || 0)} invalid companion(s).`
                : `Все связанные overlay companions сейчас healthy: ${Number(overlayCompanionSummary.healthyCount || 0)}.`}
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {overlayCompanionSummary.hasMoreCompanions ? (
                <button
                  type="button"
                  className="secondaryBtn px-2 py-1 text-[11px]"
                  onClick={() => setOverlayCompanionsExpanded((prev) => !prev)}
                  data-testid="bpmn-overlay-companions-toggle"
                >
                  {overlayCompanionsExpanded
                    ? "Свернуть related overlays"
                    : `Показать все related overlays (+${Number(overlayCompanionSummary.remainingCompanionCount || 0)})`}
                </button>
              ) : null}
              {overlayCompanionSummary.companionCount > 1 ? (
                <span className="sidebarFieldHint">
                  Invalid companions показаны первыми, затем healthy notes/highlights.
                </span>
              ) : null}
            </div>
            <div className="sidebarPropertiesRows mt-3">
              {visibleOverlayCompanions.map((companion) => {
                const objectId = String(companion?.objectId || "").trim();
                const canFocus = typeof onFocusDrawioCompanion === "function" && !!objectId;
                const title = String(companion?.text || objectId || "").trim();
                return (
                  <div
                    key={`overlay_companion_${objectId}`}
                    className={`sidebarSchemaPropertyRow ${companion?.status === "invalid" ? "border-warning/30 bg-warning/5" : ""}`}
                  >
                    <div className="sidebarSchemaPropertyLabel">
                      <div className="sidebarSchemaPropertyHuman">{title || objectId}</div>
                      <div className="sidebarSchemaPropertyKey">
                        {String(companion?.kind || "overlay")} · {String(companion?.statusLabel || companion?.status || "freeform")}
                      </div>
                    </div>
                    <div className="sidebarSchemaPropertyValueCell">
                      <div className="sidebarFieldHint">
                        {String(companion?.relation || "linked")} → {String(companion?.targetId || selectedElementId || "—")}
                      </div>
                    </div>
                    <div className="sidebarSchemaPropertyActionCell">
                      <button
                        type="button"
                        className="secondaryBtn px-2 py-1 text-[11px]"
                        onClick={() => {
                          void onFocusDrawioCompanion?.(objectId);
                        }}
                        disabled={!canFocus}
                        data-testid={`bpmn-overlay-companion-focus-${objectId}`}
                      >
                        Показать в overlay
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        ) : null}
      </section>
    );
  }

  return (
    <div className="sidebarControlStack sidebarPropertiesLayout">
      <section className="sidebarPropertiesForm" data-testid="camunda-properties-group">
        <section className="sidebarPropertiesBlock">
          <div className="sidebarPropertiesBlockHead">
            <button
              type="button"
              className="sidebarPropertiesBlockToggle"
              onClick={() => setOperationOpen((prev) => !prev)}
              aria-expanded={operationOpen ? "true" : "false"}
            >
              <span className="sidebarPropertiesBlockToggleChevron" aria-hidden="true">{operationOpen ? "▾" : "▸"}</span>
              <span className="sidebarPropertiesBlockTitle">Операция</span>
            </button>
            <SidebarInfoTip
              label="Что такое операция"
              text="Операция определяет схему полей, доступных для этого узла."
            />
          </div>
          {operationOpen ? (
            <>
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
            </>
          ) : null}
        </section>

        <SidebarTrustStatus
          title={<span>BPMN extension-state</span>}
          label={extensionStateStatusMeta.label}
          helper={extensionStateStatusMeta.helper}
          tone={extensionStateStatusMeta.tone}
          ctaLabel={extensionStateStatusMeta.cta}
          onCta={onRetryExtensionState}
          ctaDisabled={!!disabled || !!extensionStateBusy}
          ctaVariant={String(extensionStateStatusMeta.tone || "").trim().toLowerCase() === "error" ? "primary" : "secondary"}
          testIdPrefix="camunda-extension-state-status"
        />

        <section className="sidebarPropertiesBlock">
          <div className="sidebarPropertiesBlockHead">
            <button
              type="button"
              className="sidebarPropertiesBlockToggle"
              onClick={() => setOperationPropertiesOpen((prev) => !prev)}
              aria-expanded={operationPropertiesOpen ? "true" : "false"}
            >
              <span className="sidebarPropertiesBlockToggleChevron" aria-hidden="true">{operationPropertiesOpen ? "▾" : "▸"}</span>
              <span className="sidebarPropertiesBlockTitle">Свойства операции</span>
              <span className="sidebarPropertiesBlockMeta">{operationPropertiesCount}</span>
            </button>
            <SidebarInfoTip
              label="О свойствах операции"
              text="Поля, которые управляются выбранной операцией и её схемой."
            />
          </div>
          {operationPropertiesOpen ? (
            <>
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
            </>
          ) : null}
        </section>

        <section className="sidebarPropertiesBlock sidebarPropertiesBlock--secondary">
          <div className="sidebarPropertiesBlockHead">
            <button
              type="button"
              className="sidebarPropertiesBlockToggle"
              onClick={() => setAdditionalBpmnOpen((prev) => !prev)}
              aria-expanded={additionalBpmnOpen ? "true" : "false"}
            >
              <span className="sidebarPropertiesBlockToggleChevron" aria-hidden="true">{additionalBpmnOpen ? "▾" : "▸"}</span>
              <span className="sidebarPropertiesBlockTitle">Дополнительные BPMN-свойства</span>
              <span className="sidebarPropertiesBlockMeta">{additionalBpmnCount}</span>
            </button>
            <SidebarInfoTip
              label="О дополнительных BPMN-свойствах"
              text="Extension properties текущего элемента в формате name/value."
            />
          </div>
          {additionalBpmnOpen ? (
            hasDictionarySchema ? (
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
            )
          ) : null}
        </section>

        <section className="sidebarPropertiesBlock sidebarPropertiesBlock--secondary" data-testid="camunda-io-group">
          <div className="sidebarPropertiesBlockHead">
            <button
              type="button"
              className="sidebarPropertiesBlockToggle"
              onClick={() => setCamundaIoOpen((prev) => !prev)}
              aria-expanded={camundaIoOpen ? "true" : "false"}
            >
              <span className="sidebarPropertiesBlockToggleChevron" aria-hidden="true">{camundaIoOpen ? "▾" : "▸"}</span>
              <span className="sidebarPropertiesBlockTitle">Camunda Input/Output</span>
              <span className="sidebarPropertiesBlockMeta">{camundaIoCount}</span>
            </button>
            <SidebarInfoTip
              label="О Camunda/Zeebe Input/Output"
              text="Параметры camunda:inputOutput и zeebe:ioMapping из extensionElements. Поддержаны Add input/output, удаление и compact preview для script."
            />
          </div>
          {camundaIoOpen ? (
            <div className="sidebarCamundaIoLayout">
              {renderCamundaIoSection({
                title: "Input Parameters",
                direction: "input",
                rows: camundaInputRows,
              })}
              {renderCamundaIoSection({
                title: "Output Parameters",
                direction: "output",
                rows: camundaOutputRows,
              })}
            </div>
          ) : null}
        </section>

        <section className="sidebarPropertiesBlock sidebarPropertiesBlock--secondary" data-testid="zeebe-task-headers-group">
          <div className="sidebarPropertiesBlockHead">
            <button
              type="button"
              className="sidebarPropertiesBlockToggle"
              onClick={() => setZeebeTaskHeadersOpen((prev) => !prev)}
              aria-expanded={zeebeTaskHeadersOpen ? "true" : "false"}
            >
              <span className="sidebarPropertiesBlockToggleChevron" aria-hidden="true">{zeebeTaskHeadersOpen ? "▾" : "▸"}</span>
              <span className="sidebarPropertiesBlockTitle">Zeebe Task Headers</span>
              <span className="sidebarPropertiesBlockMeta">{zeebeTaskHeadersCount}</span>
            </button>
            <SidebarInfoTip
              label="О Zeebe Task Headers"
              text="Параметры zeebe:taskHeaders/zeebe:header текущего элемента."
            />
          </div>
          {zeebeTaskHeadersOpen ? (
            <>
              <div className="sidebarCamundaIoTableWrap">
                <div className="sidebarCamundaIoTableHead" role="presentation">
                  <span>Key</span>
                  <span>Type</span>
                  <span>Value</span>
                  <span className="isCenter">Action</span>
                </div>
                <div className="sidebarCamundaIoTableBody">
                  {zeebeTaskHeaderRows.length ? zeebeTaskHeaderRows.map((row) => renderZeebeTaskHeaderRow(row)) : (
                    <div className="sidebarCamundaIoEmptyRow">Нет task headers. Добавьте первую строку.</div>
                  )}
                </div>
              </div>
              <div className="sidebarButtonRow">
                <button
                  type="button"
                  className="secondaryBtn sidebarPropertiesActionBtn px-2.5"
                  onClick={addZeebeTaskHeaderRow}
                  disabled={!!disabled || !!extensionStateBusy}
                >
                  + Добавить header
                </button>
              </div>
            </>
          ) : null}
        </section>

        <section className="sidebarPropertiesBlock sidebarPropertiesBlock--secondary" data-testid="camunda-listeners-group">
          <div className="sidebarPropertiesBlockHead">
            <button
              type="button"
              className="sidebarPropertiesBlockToggle"
              onClick={() => setListenersOpen((prev) => !prev)}
              aria-expanded={listenersOpen ? "true" : "false"}
            >
              <span className="sidebarPropertiesBlockToggleChevron" aria-hidden="true">{listenersOpen ? "▾" : "▸"}</span>
              <span className="sidebarPropertiesBlockTitle">Слушатели</span>
              <span className="sidebarPropertiesBlockMeta">{listenerCount}</span>
            </button>
            <SidebarInfoTip
              label="О слушателях"
              text="Дополнительные BPMN listeners для текущего элемента."
            />
          </div>
          {listenersOpen ? (
            <div className="mt-1 space-y-1.5">
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
                  className="secondaryBtn sidebarPropertiesIconBtn sidebarPropertiesIconBtn--danger"
                  onClick={() => deleteListenerRow(row?.id)}
                  disabled={!!disabled || !!extensionStateBusy}
                  aria-label="Удалить слушатель"
                  title="Удалить слушатель"
                >
                  ×
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
          ) : null}
        </section>

        <div className="sidebarPropertiesDivider" />

        <div className="sidebarPropertiesFooter sidebarPropertiesFooter--sticky sidebarButtonRow">
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

        <div className="sidebarPropertiesDivider" />

        {propertySections.map((section) => renderPropertyContextSection(section))}
        {propertySections.length ? <div className="sidebarPropertiesDivider" /> : null}

        {renderOverlayCompanionsSection()}
      </section>

      {(() => {
        const infoText = String(extensionStateInfo || "").trim();
        if (!infoText) return null;
        if (infoText.toLowerCase() === "изменения extension-state сохранены.") return null;
        return <div className="text-[11px] text-muted">{infoText}</div>;
      })()}
      {extensionStateErr ? <div className="selectedNodeFieldError">{extensionStateErr}</div> : null}
    </div>
  );
}
