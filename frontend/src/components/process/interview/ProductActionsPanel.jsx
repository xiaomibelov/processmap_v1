import { useEffect, useMemo, useRef, useState } from "react";
import {
  acceptAiProductActions,
  deleteProductActionForStep,
  saveProductActionForStep,
} from "../../../features/process/analysis/productActionsPersistence.js";
import {
  ACTION_METHODS,
  ACTION_OBJECT_CATEGORIES,
  ACTION_STAGES,
  ACTION_TYPES,
  deriveProductActionBindingFromStep,
  listProductActionsForStep,
  normalizeProductActionsList,
} from "../../../features/process/analysis/productActionsModel.js";
import { apiBatchSuggestProductActions, apiSuggestProductActions, apiLoadBatchDraft, apiSaveBatchDraft } from "../../../lib/api.js";
import { toArray, toText } from "./utils";

const FIELD_CONFIGS = [
  { key: "product_name", label: "Товар", type: "text", placeholder: "Куриная грудка" },
  { key: "product_group", label: "Группа товара", type: "text", placeholder: "Птица" },
  { key: "action_type", label: "Тип действия", type: "select", options: ACTION_TYPES },
  { key: "action_stage", label: "Этап", type: "select", options: ACTION_STAGES },
  { key: "action_object", label: "Объект", type: "text", placeholder: "куриная грудка" },
  { key: "action_object_category", label: "Категория объекта", type: "select", options: ACTION_OBJECT_CATEGORIES },
  { key: "action_method", label: "Способ", type: "select", options: ACTION_METHODS },
];

const FIELD_GROUPS = [
  {
    title: "Продукт",
    keys: ["product_name", "product_group"],
  },
  {
    title: "Классификация действия",
    keys: ["action_type", "action_stage", "action_object", "action_object_category", "action_method"],
  },
  {
    title: "Контекст выполнения",
    keys: ["role"],
  },
];

const MEANINGFUL_PRODUCT_ACTION_FIELDS = [
  "product_name",
  "product_group",
  "action_type",
  "action_stage",
  "action_object",
  "action_object_category",
  "action_method",
  "role",
];

const ACTION_CARD_FIELDS = [
  ["Тип", "action_type"],
  ["Этап", "action_stage"],
  ["Объект", "action_object"],
  ["Категория", "action_object_category"],
  ["Способ", "action_method"],
  ["Роль", "role"],
];

const AI_PROGRESS_STAGES = [
  { id: "prepare", label: "Подготавливаем процесс", percent: 10 },
  { id: "settings", label: "Проверяем настройки AI", percent: 20 },
  { id: "request", label: "Отправляем запрос в AI", percent: 40 },
  { id: "receive", label: "Получаем ответ", percent: 60 },
  { id: "parse", label: "Разбираем ответ", percent: 80 },
  { id: "format", label: "Формируем предложения", percent: 90 },
  { id: "ready", label: "Готово к проверке", percent: 100 },
];

const AI_PROGRESS_BY_ID = Object.fromEntries(AI_PROGRESS_STAGES.map((stage) => [stage.id, stage]));
const AI_PROMPT_PROGRESS_STAGE = { id: "prompt", label: "Проверяем prompt", percent: 30 };
const AI_PROVIDER_REQUEST_STAGE = { id: "provider", label: "Запрос к AI", percent: 40 };

function stepDisplayLabel(stepRaw) {
  const step = stepRaw && typeof stepRaw === "object" ? stepRaw : {};
  const seq = Number(step.seq || step.order || 0);
  const title = toText(step.action || step.label || step.title || step.id) || "Шаг";
  return seq > 0 ? `${seq}. ${title}` : title;
}

function createDraftForStep(stepRaw, existingRaw = null) {
  const binding = deriveProductActionBindingFromStep(stepRaw);
  const existing = existingRaw && typeof existingRaw === "object" ? existingRaw : {};
  return {
    ...binding,
    ...existing,
    product_name: toText(existing.product_name),
    product_group: toText(existing.product_group),
    action_type: toText(existing.action_type),
    action_stage: toText(existing.action_stage),
    action_object: toText(existing.action_object),
    action_object_category: toText(existing.action_object_category),
    action_method: toText(existing.action_method),
    role: toText(existing.role) || binding.role,
  };
}

function statusText(status) {
  if (!status) return "";
  if (status.text) return status.text;
  if (status.type === "saving") return "Сохраняю действие с продуктом…";
  if (status.type === "saved") return "Действие с продуктом сохранено.";
  if (status.type === "conflict") return "Конфликт версии. Обновите сессию и повторите сохранение.";
  return status.text || "Не удалось сохранить действие с продуктом.";
}

function hasMeaningfulProductActionDraft(draftRaw) {
  const draft = draftRaw && typeof draftRaw === "object" ? draftRaw : {};
  return MEANINGFUL_PRODUCT_ACTION_FIELDS.some((key) => !!toText(draft[key]));
}

function displayValue(value, fallback = "Не заполнено") {
  return toText(value) || fallback;
}

function isIncompleteAction(rowRaw) {
  return !hasMeaningfulProductActionDraft(rowRaw);
}

function actionTitle(rowRaw, stepContext = null) {
  const row = rowRaw && typeof rowRaw === "object" ? rowRaw : {};

  // Prefer explicit action_title or action_label if available
  const explicitTitle = toText(row.action_title) || toText(row.action_label);
  if (explicitTitle) return explicitTitle;

  // Build action-based title from action verb/type/method + object/product
  const actionVerb = toText(row.action_type);
  const actionMethod = toText(row.action_method);
  const actionObject = toText(row.action_object) || toText(row.product_name);

  if (actionVerb && actionObject) {
    return `${actionVerb} ${actionObject}`;
  }

  if (actionMethod && actionObject) {
    return `${actionMethod} ${actionObject}`;
  }

  // Fallback: derive from step context + action type + object
  if (stepContext) {
    const stepTitle = toText(stepContext.action || stepContext.label || stepContext.title);
    if (stepTitle && actionObject) {
      return `${stepTitle}: ${actionObject}`;
    }
  }

  // Last resort fallbacks
  if (actionVerb) return actionVerb;
  if (actionObject) return `Действие с ${actionObject}`;

  return "Неполное действие";
}

function actionProductName(rowRaw) {
  const row = rowRaw && typeof rowRaw === "object" ? rowRaw : {};
  return toText(row.product_name);
}

function getBatchRowId(row, stepId, index) {
  const rowId = toText(row?.id);
  if (rowId) return rowId;
  const sid = toText(stepId);
  return sid ? `batch_${sid}_${index}` : `batch_row_${index}`;
}

function actionSummary(rowRaw) {
  const row = rowRaw && typeof rowRaw === "object" ? rowRaw : {};
  return [
    toText(row.action_type),
    toText(row.action_stage),
    toText(row.action_object),
  ].filter(Boolean).join(" · ") || "Поля действия не заполнены";
}

function actionMatchesBinding(rowRaw, bindingRaw) {
  const row = rowRaw && typeof rowRaw === "object" ? rowRaw : {};
  const binding = bindingRaw && typeof bindingRaw === "object" ? bindingRaw : {};
  const stepId = toText(binding.step_id || binding.stepId);
  const nodeId = toText(binding.node_id || binding.nodeId || binding.bpmn_element_id || binding.bpmnElementId);
  return !!(
    (stepId && toText(row.step_id || row.stepId) === stepId)
    || (nodeId && (
      toText(row.bpmn_element_id || row.bpmnElementId) === nodeId
      || toText(row.node_id || row.nodeId) === nodeId
    ))
  );
}

function warningText(warningRaw) {
  if (!warningRaw) return "";
  if (typeof warningRaw === "string") return toText(warningRaw);
  if (typeof warningRaw === "object") return toText(warningRaw.message || warningRaw.code);
  return "";
}

function formatRateLimitReset(resetAtSec) {
  if (!resetAtSec) return null;
  try {
    return new Date(Number(resetAtSec) * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch {
    return null;
  }
}

function aiSuggestErrorText(codeRaw, detailOrRateLimitRaw = "") {
  const code = toText(codeRaw);
  if (code === "AI_PROVIDER_NOT_CONFIGURED") return "AI provider не настроен: сохраните DeepSeek API key в Admin → AI модули.";
  if (code === "AI_PROMPT_NOT_CONFIGURED") return "AI prompt для действий с продуктом не настроен в Admin → AI модули.";
  if (code === "AI_RESPONSE_PARSE_ERROR") {
    return "AI вернул некорректный формат ответа. Повторите запрос или проверьте prompt модуля в Admin → AI модули.";
  }
  if (code === "AI_PROVIDER_ERROR") {
    const detail = typeof detailOrRateLimitRaw === "string" ? toText(detailOrRateLimitRaw) : "";
    return detail
      ? `AI provider вернул ошибку: ${detail}. Проверьте доступность DeepSeek в Admin → AI модули.`
      : "AI provider вернул ошибку. Проверьте доступность DeepSeek в Admin → AI модули.";
  }
  if (code === "ai_rate_limit_exceeded") {
    const rl = detailOrRateLimitRaw && typeof detailOrRateLimitRaw === "object" ? detailOrRateLimitRaw : null;
    if (rl?.reset_at) {
      const resetTime = formatRateLimitReset(rl.reset_at);
      const windowHours = rl.window_sec ? Math.round(rl.window_sec / 3600) : null;
      const limitStr = rl.limit ? `${rl.limit} запр.` : "";
      const windowStr = windowHours ? ` / ${windowHours} ч.` : "";
      const resetStr = resetTime ? ` Повторите после ${resetTime}.` : "";
      return `Лимит AI исчерпан${limitStr ? `: ${limitStr}${windowStr}` : ""}.${resetStr}`;
    }
    return "Слишком много AI-запросов. Подождите и повторите запуск позже.";
  }
  return code;
}

function aiProgressStep(stageId, message = "", status = "running", overrides = {}) {
  const stage = AI_PROGRESS_BY_ID[stageId] || overrides.stage || AI_PROGRESS_BY_ID.prepare;
  return {
    active: status !== "success",
    status,
    stageId: stage.id,
    stageLabel: stage.label,
    percent: Number(overrides.percent ?? stage.percent ?? 0),
    message: toText(message),
    errorCode: toText(overrides.errorCode),
  };
}

function aiProgressErrorStage(codeRaw) {
  const code = toText(codeRaw);
  if (code === "AI_PROVIDER_NOT_CONFIGURED") return AI_PROGRESS_BY_ID.settings;
  if (code === "AI_PROMPT_NOT_CONFIGURED") return AI_PROMPT_PROGRESS_STAGE;
  if (code === "AI_PROVIDER_ERROR") return AI_PROVIDER_REQUEST_STAGE;
  if (code === "AI_RESPONSE_PARSE_ERROR") return AI_PROGRESS_BY_ID.parse;
  if (code === "ai_rate_limit_exceeded") return AI_PROGRESS_BY_ID.settings;
  return AI_PROGRESS_BY_ID.receive;
}

function aiProgressPercent(progressRaw) {
  return Math.max(0, Math.min(100, Number(progressRaw?.percent || 0)));
}

function aiProgressBadge(progressRaw) {
  return progressRaw?.status === "error" ? "Ошибка" : `${aiProgressPercent(progressRaw)}%`;
}

function aiProgressBarPercent(progressRaw) {
  return progressRaw?.status === "error" ? 100 : aiProgressPercent(progressRaw);
}

function suggestionId(rowRaw, index = 0) {
  const row = rowRaw && typeof rowRaw === "object" ? rowRaw : {};
  return toText(row.id) || `ai_pa_${index + 1}`;
}

function normalizeSuggestionDraftRows(rowsRaw) {
  return toArray(rowsRaw).map((row, index) => ({
    ...(row && typeof row === "object" ? row : {}),
    id: suggestionId(row, index),
  }));
}

function suggestionMatchesSelectedStep(rowRaw, bindingRaw) {
  const row = rowRaw && typeof rowRaw === "object" ? rowRaw : {};
  const binding = bindingRaw && typeof bindingRaw === "object" ? bindingRaw : {};
  const stepId = toText(binding.step_id || binding.stepId);
  const bpmnId = toText(binding.bpmn_element_id || binding.node_id || binding.nodeId || binding.bpmnElementId);
  const rowStepId = toText(row.step_id || row.stepId);
  const rowBpmnId = toText(row.bpmn_element_id || row.bpmnElementId || row.node_id || row.nodeId);
  if (rowStepId && stepId && rowStepId !== stepId) return false;
  if (rowBpmnId && bpmnId && rowBpmnId !== bpmnId) return false;
  if (rowStepId || rowBpmnId) return true;
  return !!(stepId || bpmnId);
}

function filterSuggestionDraftRowsForStep(rowsRaw, stepRaw) {
  const binding = deriveProductActionBindingFromStep(stepRaw);
  const rows = normalizeSuggestionDraftRows(rowsRaw);
  if (!toText(binding.step_id || binding.bpmn_element_id)) return rows;
  return rows.filter((row) => suggestionMatchesSelectedStep(row, binding)).map((row) => ({
    ...row,
    step_id: toText(row.step_id) || binding.step_id,
    bpmn_element_id: toText(row.bpmn_element_id) || binding.bpmn_element_id,
    node_id: toText(row.node_id) || binding.node_id || binding.bpmn_element_id,
    step_label: toText(row.step_label) || binding.step_label,
    role: toText(row.role) || binding.role,
  }));
}

export default function ProductActionsPanel({
  sessionId = "",
  sessionTitle = "",
  projectId = "",
  projectTitle = "",
  interviewData = null,
  timelineView = [],
  selectedStepIds = [],
  compact = false,
  showStepContext = true,
  getBaseDiagramStateVersion = null,
  rememberDiagramStateVersion = null,
  onSessionSync = null,
  onOpenProductActionsRegistry = null,
}) {
  const steps = useMemo(
    () => toArray(timelineView).filter((step) => toText(step?.id)),
    [timelineView],
  );
  const productActions = useMemo(
    () => normalizeProductActionsList(interviewData?.analysis?.product_actions),
    [interviewData?.analysis?.product_actions],
  );
  const preferredStepId = toArray(selectedStepIds).map(toText).find((id) => steps.some((step) => toText(step?.id) === id)) || "";
  const [selectedStepId, setSelectedStepId] = useState(preferredStepId || toText(steps[0]?.id));
  const selectedStep = steps.find((step) => toText(step?.id) === selectedStepId) || steps[0] || null;
  const selectedStepIdRef = useRef("");
  selectedStepIdRef.current = toText(selectedStep?.id);
  const actionsForStep = useMemo(
    () => listProductActionsForStep(productActions, selectedStep),
    [productActions, selectedStep],
  );
  const [editingActionId, setEditingActionId] = useState("");
  const editingAction = actionsForStep.find((row) => row.id === editingActionId) || null;
  const [draft, setDraft] = useState(() => createDraftForStep(selectedStep));
  const draftResetKey = `${toText(selectedStep?.id)}::${toText(editingAction?.id)}`;
  const lastDraftResetKeyRef = useRef(draftResetKey);
  const aiRequestStepIdRef = useRef("");
  const aiInFlightRef = useRef(false);
  const batchInFlightRef = useRef(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [actionsScope, setActionsScope] = useState("step");
  const [status, setStatus] = useState(null);
  const [saving, setSaving] = useState(false);
  const [aiDraft, setAiDraft] = useState(null);
  const aiDraftStepIdRef = useRef("");
  const [aiRows, setAiRows] = useState([]);
  const [selectedAiRowIds, setSelectedAiRowIds] = useState(() => new Set());
  const [aiStatus, setAiStatus] = useState(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiApplying, setAiApplying] = useState(false);
  const [aiProgress, setAiProgress] = useState(null);
  const [aiDiagnostics, setAiDiagnostics] = useState(null);
  const [batchDraft, setBatchDraft] = useState(null);
  const [batchProgress, setBatchProgress] = useState(null);
  const [batchStatus, setBatchStatus] = useState(null);
  const [batchRunning, setBatchRunning] = useState(false);
  const [batchReviewVisible, setBatchReviewVisible] = useState(true);

  useEffect(() => {
    if (!steps.length) return;
    const hasSelected = steps.some((step) => toText(step?.id) === selectedStepId);
    if (preferredStepId && preferredStepId !== selectedStepId) {
      setSelectedStepId(preferredStepId);
      return;
    }
    if (!hasSelected) setSelectedStepId(toText(steps[0]?.id));
  }, [preferredStepId, selectedStepId, steps]);

  useEffect(() => {
    if (lastDraftResetKeyRef.current === draftResetKey) return;
    lastDraftResetKeyRef.current = draftResetKey;
    setDraft(createDraftForStep(selectedStep, editingAction));
  }, [draftResetKey, selectedStep, editingAction]);

  useEffect(() => {
    const currentStepId = toText(selectedStep?.id);
    if (!currentStepId) return;
    if (aiDraftStepIdRef.current !== currentStepId) {
      aiInFlightRef.current = false;
      setAiDraft(null);
      aiDraftStepIdRef.current = "";
      setAiRows([]);
      setSelectedAiRowIds(new Set());
      setAiStatus(null);
      setAiLoading(false);
      setAiProgress(null);
      setAiDiagnostics(null);
      // Do NOT clear batchDraft/batchProgress/batchStatus/batchRunning here
      // Batch draft contains results for multiple steps and should persist across step changes
    }
  }, [selectedStep]);

  useEffect(() => {
    if (!sessionId) return;
    apiLoadBatchDraft(sessionId).then(result => {
      if (result?.ok && result?.draft && typeof result.draft === 'object') {
        setBatchDraft(deserializeBatchDraftFromBackend(result.draft));
      }
    }).catch(() => {
      // Ignore load errors
    });
  }, [sessionId]);

  const selectedBinding = deriveProductActionBindingFromStep(selectedStep);
  const actionCount = productActions.length;
  const stepActionCount = actionsForStep.length;
  const visibleActions = actionsScope === "all" ? productActions : actionsForStep;
  const canSaveDraft = hasMeaningfulProductActionDraft(draft);
  const selectedAiRows = useMemo(
    () => aiRows.filter((row) => selectedAiRowIds.has(toText(row.id)) && !toText(row.duplicate_of)),
    [aiRows, selectedAiRowIds],
  );
  const canAcceptAiRows = selectedAiRows.length > 0 && !aiApplying;
  const fieldConfigByKey = useMemo(() => {
    const fields = [...FIELD_CONFIGS, { key: "role", label: "Роль", type: "text", placeholder: "Повар" }];
    return Object.fromEntries(fields.map((field) => [field.key, field]));
  }, []);

  async function handleBatchSuggestAiProductActions(scope = "without_actions", resume = false) {
    if (!sessionId || batchRunning || batchInFlightRef.current) return;
    batchInFlightRef.current = true;
    setBatchRunning(true);
    setBatchStatus({ type: "saving", text: resume ? "Продолжаем AI по шагам…" : "Запускаем AI по шагам…" });
    setBatchProgress({ current: 0, total: steps.length, currentStepName: "Backend batch" });
    try {
      const result = await apiBatchSuggestProductActions(sessionId, {
        scope,
        step_ids: steps.map((step) => toText(step?.id)).filter(Boolean),
        options: {
          skip_existing_actions: scope === "without_actions",
          skip_existing_drafts: true,
          max_steps_per_chunk: 10,
          use_rag_context: false,
          ui_source: "product_actions_panel_batch",
        },
      });
      if (!result?.ok) {
        setBatchStatus({
          type: "error",
          text: `Не удалось выполнить AI по шагам. Ошибка: ${toText(result?.error || result?.result?.error) || "unknown"}`,
        });
        return;
      }
      const nextDraft = deserializeBatchDraftFromBackend(result.draft || {});
      setBatchDraft(nextDraft);
      const summary = result.summary || {};
      const readyCount = Number(summary.ready || 0);
      const failedCount = Number(summary.failed || 0);
      const rateLimitedCount = Number(summary.rate_limited || 0);
      const notProcessedCount = Number(summary.not_processed || 0);
      const skippedActionCount = Number(summary.skipped_existing_action || 0);
      const skippedSuggestionCount = Number(summary.skipped_existing_draft || 0);
      const totalSkippedCount = skippedActionCount + skippedSuggestionCount;
      const totalRows = Object.values(nextDraft || {}).reduce((sum, entry) => sum + toArray(entry?.rows).length, 0);
      const hasError = failedCount > 0 || rateLimitedCount > 0 || result.batch_status === "rate_limited";
      let statusText = `Batch AI: ${readyCount} шагов выполнено`;
      if (totalSkippedCount) statusText += `, ${totalSkippedCount} пропущено`;
      if (failedCount) statusText += `, ${failedCount} ошибок`;
      if (rateLimitedCount) statusText += `, ${rateLimitedCount} ост. лимитом`;
      if (notProcessedCount) statusText += `, ${notProcessedCount} не выполнено`;
      statusText += `.`;
      if (!hasError) statusText += ` Итого предложений: ${totalRows}. Проверьте и примите нужные.`;
      setBatchStatus({ type: hasError ? "error" : "saved", text: statusText });
      setBatchReviewVisible(true);
    } catch (error) {
      setBatchStatus({
        type: "error",
        text: `Не удалось выполнить AI по шагам. Ошибка: ${toText(error?.message) || "network error"}`,
      });
    } finally {
      batchInFlightRef.current = false;
      setBatchRunning(false);
      setBatchProgress(null);
    }
  }

  function toggleBatchRow(stepId, rowId, checked) {
    const sid = toText(stepId);
    const rid = toText(rowId);
    if (!sid || !rid || !batchDraft?.[sid]) return;
    setBatchDraft((prev) => {
      const stepEntry = prev[sid];
      const next = new Set(stepEntry.selectedIds);
      if (checked) next.add(rid);
      else next.delete(rid);
      return { ...prev, [sid]: { ...stepEntry, selectedIds: next } };
    });
  }

  async function handleAcceptBatchRows(stepId) {
    const sid = toText(stepId);
    const entry = batchDraft?.[sid];
    if (!entry) return;
    const selectedRows = entry.rows.filter((r, index) => {
      const rowId = getBatchRowId(r, sid, index);
      return entry.selectedIds.has(rowId) && !toText(r.duplicate_of);
    });
    if (!selectedRows.length) return;
    setBatchStatus({ type: "saving", text: `Применяю действия для: ${entry.stepName}…` });
    const result = await acceptAiProductActions({
      sessionId,
      currentAnalysis: interviewData?.analysis,
      selectedActions: selectedRows,
      getBaseDiagramStateVersion,
      rememberDiagramStateVersion,
      onSessionSync,
    });
    if (result?.ok) {
      setBatchDraft((prev) => ({ ...prev, [sid]: { ...prev[sid], selectedIds: new Set() } }));
      setBatchStatus({ type: "saved", text: `Действия для шага «${entry.stepName}» применены.` });
    } else {
      setBatchStatus({
        type: "error",
        text: toText(result?.error) || `Не удалось применить действия для шага «${entry.stepName}».`,
      });
    }
  }

  async function handleAcceptAllReadyRows() {
    if (!batchDraft || typeof batchDraft !== 'object') return;
    const allEntries = Object.entries(batchDraft);
    const readyEntries = allEntries.filter(([_, entry]) => entry.status === "ready" && entry.rows.length > 0);
    if (!readyEntries.length) return;

    const allReadyRows = [];
    for (const [stepId, entry] of readyEntries) {
      const nonDuplicateRows = entry.rows.filter((r) => !toText(r.duplicate_of));
      allReadyRows.push(...nonDuplicateRows);
    }

    if (!allReadyRows.length) return;

    setBatchStatus({ type: "saving", text: `Применяю все готовые действия (${allReadyRows.length} шт.)…` });
    const result = await acceptAiProductActions({
      sessionId,
      currentAnalysis: interviewData?.analysis,
      selectedActions: allReadyRows,
      getBaseDiagramStateVersion,
      rememberDiagramStateVersion,
      onSessionSync,
    });

    if (result?.ok) {
      // Clear selectedIds for all ready entries
      setBatchDraft((prev) => {
        const next = { ...prev };
        for (const [stepId] of readyEntries) {
          if (next[stepId]) {
            next[stepId] = { ...next[stepId], selectedIds: new Set() };
          }
        }
        return next;
      });
      setBatchStatus({ type: "saved", text: `Все готовые действия применены (${allReadyRows.length} шт.).` });
    } else {
      setBatchStatus({
        type: "error",
        text: toText(result?.error) || `Не удалось применить все готовые действия.`,
      });
    }
  }

  function hasPendingSteps(draft) {
    if (!draft || typeof draft !== 'object') return false;
    const entries = Object.values(draft);
    return entries.some(e => e.status === "not_processed" || e.status === "rate_limited");
  }

  function getProcessedCount(draft) {
    if (!draft || typeof draft !== 'object') return 0;
    return Object.values(draft).filter(e =>
      e.status === "ready" ||
      e.status === "skipped_existing_action" ||
      e.status === "skipped_existing_suggestion"
    ).length;
  }

  function getTotalSteps(draft) {
    if (!draft || typeof draft !== 'object') return 0;
    return Object.keys(draft).length;
  }

  function serializeBatchDraftForBackend(draft) {
    if (!draft || typeof draft !== 'object') return null;
    const serialized = {};
    for (const [stepId, entry] of Object.entries(draft)) {
      serialized[stepId] = {
        // Only include serializable fields that backend can store
        stepName: entry.stepName,
        rows: entry.rows,
        status: entry.status,
        errorCode: entry.errorCode || null,
        rateLimitObj: entry.rateLimitObj || null,
        skipped: entry.skipped || false,
        selectedIds: entry.selectedIds instanceof Set ? Array.from(entry.selectedIds) : (entry.selectedIds || []),
        // Omit 'step' object - it's too large and not needed for persistence
      };
    }
    return serialized;
  }

  function deserializeBatchDraftFromBackend(draft) {
    if (!draft || typeof draft !== 'object') return null;
    const deserialized = {};
    for (const [stepId, entry] of Object.entries(draft)) {
      // Reconstruct step object from stepId if needed
      const step = steps.find(s => toText(s?.id) === stepId) || null;
      deserialized[stepId] = {
        ...entry,
        step: step, // Restore step object from current steps
        selectedIds: Array.isArray(entry.selectedIds) ? new Set(entry.selectedIds) : new Set(),
      };
    }
    return deserialized;
  }

  async function handleResetBatchDraft() {
    setBatchDraft(null);
    setBatchStatus(null);
    setBatchProgress(null);
    try {
      await apiSaveBatchDraft(sessionId, null);
    } catch (error) {
      console.warn('Failed to clear batch draft:', error);
    }
  }

  function patchDraft(key, value) {
    setDraft((prev) => ({
      ...(prev && typeof prev === "object" ? prev : {}),
      [key]: value,
    }));
  }

  async function handleSave() {
    if (!selectedStep || saving) return;
    if (!canSaveDraft) {
      setStatus({ type: "error", text: "Заполните хотя бы одно поле действия с продуктом." });
      return;
    }
    setSaving(true);
    setStatus({ type: "saving" });
    const result = await saveProductActionForStep({
      sessionId,
      currentAnalysis: interviewData?.analysis,
      step: selectedStep,
      draft,
      getBaseDiagramStateVersion,
      rememberDiagramStateVersion,
      onSessionSync,
    });
    setSaving(false);
    if (result?.ok) {
      const savedActionId = toText(result?.productAction?.id);
      lastDraftResetKeyRef.current = `${toText(selectedStep?.id)}::${savedActionId}`;
      setEditingActionId(savedActionId);
      setDraft(createDraftForStep(selectedStep, result?.productAction));
      setEditorOpen(false);
      setStatus({ type: "saved" });
      return;
    }
    setStatus({
      type: Number(result?.status || 0) === 409 ? "conflict" : "error",
      text: toText(result?.error) || "Не удалось сохранить действие с продуктом.",
    });
  }

  async function handleDelete() {
    const actionId = toText(editingActionId);
    if (!actionId || saving) return;
    setSaving(true);
    setStatus({ type: "saving", text: "Удаляю действие с продуктом…" });
    const result = await deleteProductActionForStep({
      sessionId,
      currentAnalysis: interviewData?.analysis,
      actionId,
      getBaseDiagramStateVersion,
      rememberDiagramStateVersion,
      onSessionSync,
    });
    setSaving(false);
    if (result?.ok) {
      setEditingActionId("");
      setEditorOpen(false);
      setDraft(createDraftForStep(selectedStep));
      lastDraftResetKeyRef.current = `${toText(selectedStep?.id)}::`;
      setStatus({ type: "saved", text: "Действие с продуктом удалено." });
      return;
    }
    setStatus({
      type: Number(result?.status || 0) === 409 ? "conflict" : "error",
      text: toText(result?.error) || "Не удалось удалить действие с продуктом.",
    });
  }

  async function handleSuggestAiProductActions() {
    if (!sessionId || aiLoading || aiInFlightRef.current) return;
    if (!selectedStep) {
      setAiStatus({ type: "error", text: "Выберите шаг процесса перед запуском AI." });
      return;
    }
    const requestStep = selectedStep;
    const requestStepId = toText(requestStep?.id);
    const requestStepBpmnId = toText(requestStep?.node_id || requestStep?.nodeId || requestStep?.bpmn_ref);
    aiRequestStepIdRef.current = requestStepId;
    aiInFlightRef.current = true;
    setAiLoading(true);
    setAiDraft(null);
    setAiRows([]);
    setSelectedAiRowIds(new Set());
    setAiStatus({ type: "saving", text: "Запрашиваю AI-предложения…" });
    setAiProgress(aiProgressStep("prepare", "Готовим BPMN/Interview context для AI."));
    await Promise.resolve();
    setAiProgress(aiProgressStep("settings", "Проверяем provider, prompt и лимиты перед запуском."));
    await Promise.resolve();
    setAiProgress(aiProgressStep("request", "Запрос отправлен. Обычно это занимает несколько секунд."));
    let result = null;
    try {
      result = await apiSuggestProductActions(sessionId, {
        options: {
          max_suggestions: 20,
          ui_source: "product_actions_panel",
          selected_step_id: requestStepId,
          selected_step_label: toText(requestStep?.action || requestStep?.label || requestStep?.title),
          selected_step_bpmn_id: requestStepBpmnId,
        },
      });
    } catch (error) {
      result = {
        ok: false,
        error: "AI_PROVIDER_ERROR",
        draft: { message: toText(error?.message) || "network error" },
      };
    }
    if (aiRequestStepIdRef.current !== requestStepId || selectedStepIdRef.current !== requestStepId) {
      aiInFlightRef.current = false;
      setAiLoading(false);
      setAiDraft(null);
      aiDraftStepIdRef.current = "";
      setAiRows([]);
      setSelectedAiRowIds(new Set());
      setAiStatus(null);
      setAiProgress(null);
      setAiDiagnostics(null);
      return;
    }
    aiInFlightRef.current = false;
    setAiLoading(false);
    setAiProgress(aiProgressStep("receive", "Ответ AI получен, проверяем результат."));
    if (!result?.ok || result?.draft?.ok === false) {
      const errorCode = toText(result?.error || result?.draft?.error);
      const rateLimitObj = result?.rate_limit || result?.draft?.rate_limit || null;
      const errorDetail = rateLimitObj || toText(result?.draft?.message || result?.data?.message);
      const errorStage = aiProgressErrorStage(errorCode);
      const errorText = aiSuggestErrorText(errorCode, errorDetail) || "Не удалось получить AI-предложения.";
      setAiDiagnostics(result?.draft?.diagnostics || null);
      setAiProgress(aiProgressStep(errorStage.id, errorText, "error", {
        stage: errorStage,
        errorCode,
        percent: errorStage.percent,
      }));
      setAiStatus({
        type: "error",
        text: errorText,
      });
      return;
    }
    setAiProgress(aiProgressStep("parse", "Разбираем AI-ответ и проверяем поля suggestions."));
    const draftResult = result.draft || {};
    const rows = filterSuggestionDraftRowsForStep(draftResult.suggestions, requestStep);
    const nonDuplicateRows = rows.filter((row) => !toText(row.duplicate_of));
    const allDuplicates = rows.length > 0 && nonDuplicateRows.length === 0;
    setAiProgress(aiProgressStep("format", "Формируем список предложений для review."));
    setAiDraft(draftResult);
    aiDraftStepIdRef.current = toText(selectedStep?.id);
    setAiRows(rows);
    setSelectedAiRowIds(new Set(nonDuplicateRows.map((row) => toText(row.id)).filter(Boolean)));
    setAiProgress(aiProgressStep(
      "ready",
      rows.length
        ? allDuplicates
          ? `Все ${rows.length} предложений уже сохранены как дубли. Новых действий не найдено.`
          : `Найдено ${rows.length} предложений. Проверьте и примите нужные.`
        : "AI не нашёл действий с продуктом для этого процесса.",
      "success",
    ));
    setAiStatus({
      type: allDuplicates ? "info" : "saved",
      text: rows.length
        ? allDuplicates
          ? "AI не нашёл новых действий: все предложения уже существуют как дубли."
          : "AI-предложения готовы к review."
        : "AI не нашёл действий с продуктом для этого процесса.",
    });
  }

  function patchAiRow(rowId, key, value) {
    setAiRows((prev) => prev.map((row) => (toText(row.id) === rowId ? { ...row, [key]: value } : row)));
  }

  function toggleAiRow(rowId, checked) {
    const id = toText(rowId);
    if (!id) return;
    setSelectedAiRowIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  async function handleAcceptAiRows() {
    if (!canAcceptAiRows) return;
    setAiApplying(true);
    setAiStatus({ type: "saving", text: "Применяю выбранные AI-действия…" });
    const result = await acceptAiProductActions({
      sessionId,
      currentAnalysis: interviewData?.analysis,
      selectedActions: selectedAiRows,
      getBaseDiagramStateVersion,
      rememberDiagramStateVersion,
      onSessionSync,
    });
    setAiApplying(false);
    if (result?.ok) {
      setSelectedAiRowIds(new Set());
      setAiStatus({ type: "saved", text: "Изменения применены к процессу" });
      return;
    }
    setAiStatus({
      type: Number(result?.status || 0) === 409 ? "conflict" : "error",
      text: Number(result?.status || 0) === 409
        ? "Конфликт версии. Обновите сессию и повторите применение."
        : (toText(result?.error) || "Не удалось применить выбранные AI-действия."),
    });
  }

  return (
    <section className={`productActionsPanel${compact ? " compact" : ""}`} data-testid="product-actions-panel">
      <div className="productActionsHeader">
        <div>
          <div className="productActionsTitle">Действия с продуктом</div>
          <div className="productActionsSub">
            {actionCount ? `Сохранено: ${actionCount}` : "Нет сохранённых действий"}
          </div>
        </div>
        <div className="productActionsToolbar">
          <button
            type="button"
            className="productActionsToolbarBtn"
            disabled={!steps.length || aiLoading}
            onClick={handleSuggestAiProductActions}
            data-testid="product-actions-ai-suggest"
          >
            {aiLoading ? "AI думает…" : "AI для шага"}
          </button>
          <button
            type="button"
            className="productActionsToolbarBtn"
            disabled={!steps.length || batchRunning || aiLoading}
            onClick={() => handleBatchSuggestAiProductActions("without_actions")}
            data-testid="product-actions-ai-batch"
          >
            {batchRunning ? "AI работает…" : "AI по шагам ▾"}
          </button>
          <button
            type="button"
            className="productActionsToolbarBtn"
            disabled={!steps.length}
            onClick={() => {
              setEditingActionId("");
              setDraft(createDraftForStep(selectedStep));
              lastDraftResetKeyRef.current = `${toText(selectedStep?.id)}::`;
              setEditorOpen(true);
              setStatus(null);
            }}
            data-testid="product-actions-add"
          >
            + Добавить
          </button>
          <button
            type="button"
            className="productActionsToolbarBtn"
            onClick={() => onOpenProductActionsRegistry?.({
              scope: "session",
              projectId,
              sessionId,
            })}
            data-testid="product-actions-open-registry"
          >
            Реестр
          </button>
        </div>
      </div>

      {!steps.length ? (
        <div className="productActionsEmpty" data-testid="product-actions-empty-state">
          Добавьте шаг процесса, чтобы описать действия с продуктом.
        </div>
      ) : null}

      {steps.length ? (
        <>
          <div className="productActionsScopeToggle" role="tablist" aria-label="Фильтр действий с продуктом">
            <button
              type="button"
              className={actionsScope === "step" ? "isActive" : ""}
              onClick={() => setActionsScope("step")}
              role="tab"
              aria-selected={actionsScope === "step"}
            >
              По выбранному шагу
              <span>{stepActionCount}</span>
            </button>
            <button
              type="button"
              className={actionsScope === "all" ? "isActive" : ""}
              onClick={() => setActionsScope("all")}
              role="tab"
              aria-selected={actionsScope === "all"}
            >
              Все действия
              <span>{actionCount}</span>
            </button>
          </div>

          {showStepContext ? (
          <div className="productActionsStepRow">
            <label className="interviewField productActionsStepSelect">
              <span>Шаг процесса</span>
              <select
                className="select"
                value={toText(selectedStep?.id)}
                onChange={(e) => {
                  setSelectedStepId(e.target.value);
                  setEditingActionId("");
                  setEditorOpen(false);
                  setStatus(null);
                }}
              >
                {steps.map((step) => (
                  <option key={toText(step?.id)} value={toText(step?.id)}>
                    {stepDisplayLabel(step)}
                  </option>
                ))}
              </select>
            </label>
            <div className="productActionsStepCard" data-testid="product-actions-step-context">
              <div className="productActionsStepTitle">
                Шаг: {stepDisplayLabel(selectedStep)}
              </div>
              <div className="productActionsMetaGrid">
                <span>ID шага: {selectedBinding.step_id || "нет"}</span>
                <span>BPMN: {selectedBinding.bpmn_element_id || "нет привязки"}</span>
                <span>Роль: {selectedBinding.role || "не указана"}</span>
                <span>Действий по шагу: {stepActionCount}</span>
              </div>
            </div>
          </div>
          ) : null}

          {batchDraft && !batchRunning && !batchReviewVisible ? (
            <div className="productActionsBatchResume" data-testid="product-actions-batch-hidden">
              <div className="productActionsEditorTitle">AI по шагам — черновик сохранён</div>
              <div className="productActionsSub">
                Обработано: {getProcessedCount(batchDraft)} из {getTotalSteps(batchDraft)} шагов
              </div>
              <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
                <button
                  type="button"
                  className="productActionsToolbarBtn"
                  onClick={() => setBatchReviewVisible(true)}
                  data-testid="product-actions-batch-show-btn"
                >
                  Показать предложения
                </button>
                <button
                  type="button"
                  className="productActionsToolbarBtn"
                  onClick={handleResetBatchDraft}
                  data-testid="product-actions-batch-reset-btn"
                >
                  Сбросить черновик
                </button>
              </div>
            </div>
          ) : null}
          {batchDraft && !batchRunning && hasPendingSteps(batchDraft) ? (
            <div className="productActionsBatchResume" data-testid="product-actions-batch-resume">
              <div className="productActionsEditorTitle">AI по шагам — прогресс</div>
              <div className="productActionsSub">
                Обработано: {getProcessedCount(batchDraft)} из {getTotalSteps(batchDraft)} шагов
              </div>
              <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
                <button
                  type="button"
                  className="productActionsToolbarBtn"
                  onClick={() => handleBatchSuggestAiProductActions("without_actions", true)}
                  data-testid="product-actions-batch-resume-btn"
                >
                  Продолжить
                </button>
                <button
                  type="button"
                  className="productActionsToolbarBtn"
                  onClick={handleResetBatchDraft}
                  data-testid="product-actions-batch-reset-btn"
                >
                  Сбросить прогресс
                </button>
              </div>
            </div>
          ) : null}

          {batchRunning && batchProgress ? (
            <div className="productActionsBatchProgress" data-testid="product-actions-batch-progress">
              <div className="productActionsEditorTitle">AI по шагам</div>
              <div className="productActionsSub">
                Шаг {batchProgress.current} из {batchProgress.total}: {batchProgress.currentStepName}
              </div>
              <div className="productActionsAiProgressBar" aria-hidden="true">
                <span style={{ width: `${Math.round((batchProgress.current / batchProgress.total) * 100)}%` }} />
              </div>
            </div>
          ) : null}
          {batchDraft && !batchRunning && batchReviewVisible ? (
            <div className="productActionsBatchReview" data-testid="product-actions-batch-review">
              <div className="productActionsAiReviewHead">
                <div>
                  <div className="productActionsEditorTitle">AI по шагам — предложения</div>
                  <div className="productActionsSub">
                    Черновик. В process truth попадут только выбранные строки после принятия.
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    type="button"
                    className="productActionsToolbarBtn"
                    onClick={handleAcceptAllReadyRows}
                    disabled={!Object.values(batchDraft).some(e => e.status === "ready" && e.rows.length > 0)}
                    data-testid="product-actions-batch-accept-all"
                  >
                    Принять все готовые
                  </button>
                  <button
                    type="button"
                    className="productActionsToolbarBtn"
                    onClick={() => { setBatchReviewVisible(false); setBatchStatus(null); }}
                    data-testid="product-actions-batch-close"
                  >
                    Закрыть
                  </button>
                </div>
              </div>
              {Object.entries(batchDraft).map(([stepId, entry]) => (
                <details key={stepId} className="productActionsBatchStepGroup" data-testid="product-actions-batch-step">
                  <summary className="productActionsBatchStepSummary">
                    <span>{entry.stepName}</span>
                    {entry.skipped || entry.status === "skipped_existing_action" ? (
                      <span className="productActionsAiBadge skipped">Пропущен: есть действие</span>
                    ) : entry.status === "skipped_existing_suggestion" ? (
                      <span className="productActionsAiBadge skipped">Пропущен: есть черновик</span>
                    ) : entry.status === "rate_limited" ? (
                      <span className="productActionsAiBadge rateLimited">Лимит AI</span>
                    ) : entry.status === "not_processed" ? (
                      <span className="productActionsAiBadge notProcessed">Не выполнен</span>
                    ) : entry.status === "failed" ? (
                      <span className="productActionsAiBadge error">Ошибка</span>
                    ) : entry.status === "ready" ? (
                      <span className="productActionsAiBadge success">
                        {entry.rows.length > 0 ? `Готово: ${entry.rows.length}` : "Готово: нет предложений"}
                      </span>
                    ) : (
                      <span className="productActionsAiCounter">{entry.rows.length} предложений</span>
                    )}
                  </summary>
                  {entry.skipped || entry.status === "skipped_existing_action" ? (
                    <div className="productActionsAiWarningNote" data-testid="product-actions-batch-skipped">
                      <span className="productActionsAiWarningNoteIcon">ℹ</span>
                      <span>Шаг пропущен: уже есть сохранённые действия с продуктом.</span>
                    </div>
                  ) : null}
                  {entry.status === "skipped_existing_suggestion" ? (
                    <div className="productActionsAiWarningNote" data-testid="product-actions-batch-skipped-suggestion">
                      <span className="productActionsAiWarningNoteIcon">ℹ</span>
                      <span>Шаг пропущен: уже есть готовый черновик предложений. Примите или сбросьте черновик перед повторным запуском.</span>
                    </div>
                  ) : null}
                  {entry.status === "not_processed" ? (
                    <div className="productActionsAiWarningNote">
                      <span className="productActionsAiWarningNoteIcon">⏸</span>
                      <span>Шаг не выполнен: AI-запуск остановлен из-за лимита на предыдущем шаге.</span>
                    </div>
                  ) : null}
                  {entry.status === "rate_limited" ? (
                    <div className="productActionsAiWarningNote">
                      <span className="productActionsAiWarningNoteIcon">⚠</span>
                      <span>{aiSuggestErrorText("ai_rate_limit_exceeded", entry.rateLimitObj)}</span>
                    </div>
                  ) : entry.errorCode ? (
                    <div className="productActionsAiWarningNote">
                      <span className="productActionsAiWarningNoteIcon">⚠</span>
                      <span>{aiSuggestErrorText(entry.errorCode)}</span>
                    </div>
                  ) : null}
                  {entry.rows.length ? (
                    <>
                      <div className="productActionsAiList">
                        {entry.rows.map((row, index) => {
                          const rowId = getBatchRowId(row, stepId, index);
                          const duplicate = !!toText(row.duplicate_of);
                          return (
                            <article
                              key={rowId}
                              className={`productActionsAiCard${duplicate ? " duplicate" : ""}`}
                            >
                              <div className="productActionsAiCardTop">
                                <label className="productActionsAiCardCheck">
                                  <input
                                    type="checkbox"
                                    checked={entry.selectedIds.has(rowId)}
                                    disabled={duplicate}
                                    onChange={(e) => toggleBatchRow(stepId, rowId, e.target.checked)}
                                  />
                                </label>
                                <div className="productActionsAiCardMain">
                                  <div className="productActionsAiCardTitle">
                                    {actionTitle(row, entry.step)}
                                    {duplicate ? <span className="productActionsAiBadge duplicate">Дубль</span> : null}
                                  </div>
                                  <div className="productActionsAiCardChips">
                                    {actionProductName(row) ? <span className="productActionsAiChip product">{actionProductName(row)}</span> : null}
                                    {toText(row.product_group) ? <span className="productActionsAiChip">{row.product_group}</span> : null}
                                    {toText(row.action_type) ? <span className="productActionsAiChip">{row.action_type}</span> : null}
                                    {toText(row.action_stage) ? <span className="productActionsAiChip">{row.action_stage}</span> : null}
                                    {toText(row.action_object_category) ? <span className="productActionsAiChip">{row.action_object_category}</span> : null}
                                    {toText(row.action_method) ? <span className="productActionsAiChip">{row.action_method}</span> : null}
                                    {toText(row.role) ? <span className="productActionsAiChip role">{row.role}</span> : null}
                                  </div>
                                  {duplicate && toText(row.duplicate_reason) ? (
                                    <div className="productActionsAiCardDuplicateReason">{toText(row.duplicate_reason)}</div>
                                  ) : null}
                                </div>
                              </div>
                            </article>
                          );
                        })}
                      </div>
                      <div className="productActionsAiStickyFooter">
                        <span className="productActionsAiCounter">
                          Выбрано: {entry.selectedIds.size}
                        </span>
                        <button
                          type="button"
                          className="primaryBtn smallBtn"
                          disabled={entry.selectedIds.size === 0}
                          onClick={() => handleAcceptBatchRows(stepId)}
                          data-testid="product-actions-batch-accept"
                        >
                          Принять выбранные
                        </button>
                      </div>
                    </>
                  ) : (
                    <div className="productActionsAiEmpty">
                      AI не нашёл действий для этого шага.
                    </div>
                  )}
                </details>
              ))}
            </div>
          ) : null}
          {aiDraft ? (
            <div className="productActionsAiReview" data-testid="product-actions-ai-review">
              <div className="productActionsAiReviewHead">
                <div>
                  <div className="productActionsEditorTitle">AI-предложения действий</div>
                  <div className="productActionsSub">
                    AI предлагает черновик. В process truth попадут только выбранные строки после принятия.
                  </div>
                </div>
                <div className="productActionsAiReviewMeta">
                  <span className="productActionsAiCounter"><b>Предложений:</b> {aiRows.length}</span>
                  <span className="productActionsAiCounter"><b>Выбрано:</b> {selectedAiRows.length}</span>
                </div>
              </div>
              {aiRows.length > 0 && selectedAiRows.length === 0 ? (
                <div className="productActionsAiWarningNote" data-testid="product-actions-ai-all-duplicates">
                  <span className="productActionsAiWarningNoteIcon">ℹ</span>
                  <span>AI не нашёл новых действий для этого шага — все предложения уже существуют в процессе как дубли. Новых строк для принятия нет.</span>
                </div>
              ) : null}
              {toArray(aiDraft.warnings).filter((w) => w && typeof w === "object" && w.code).length ? (
                <div className="productActionsAiWarningNote">
                  <span className="productActionsAiWarningNoteIcon">ℹ</span>
                  <span>
                    {toArray(aiDraft.warnings).filter((w) => w && typeof w === "object" && w.code).map(warningText).join(" · ")}
                  </span>
                </div>
              ) : null}
              {aiRows.length ? (
                <div className="productActionsAiList" data-testid="product-actions-ai-list">
                  {aiRows.map((row, index) => {
                    const rowId = toText(row.id);
                    const duplicate = !!toText(row.duplicate_of);
                    const missingFields = toArray(row.missing_fields).map(toText).filter(Boolean);
                    const confidencePct = Math.round(Number(row.confidence || 0) * 100);
                    const confidenceLevel = confidencePct >= 70 ? "high" : confidencePct >= 40 ? "medium" : "low";
                    const reasonText = toText(row.reason || row.evidence_text);
                    return (
                      <article
                        key={rowId || index}
                        className={`productActionsAiCard${duplicate ? " duplicate" : ""}${missingFields.length && !duplicate ? " incomplete" : ""}`}
                        data-testid="product-actions-ai-suggestion"
                      >
                        <div className="productActionsAiCardTop">
                          <label className="productActionsAiCardCheck">
                            <input
                              type="checkbox"
                              checked={selectedAiRowIds.has(rowId)}
                              disabled={duplicate}
                              onChange={(e) => toggleAiRow(rowId, e.target.checked)}
                            />
                          </label>
                          <div className="productActionsAiCardMain">
                            <div className="productActionsAiCardTitle">
                              {actionTitle(row, selectedStep)}
                              {duplicate ? (
                                <span className="productActionsAiBadge duplicate">Дубль</span>
                              ) : missingFields.length ? (
                                <span className="productActionsAiBadge incomplete">Неполное</span>
                              ) : null}
                            </div>
                            <div className="productActionsAiCardChips">
                              {actionProductName(row) ? <span className="productActionsAiChip product">{actionProductName(row)}</span> : null}
                              {toText(row.product_group) ? <span className="productActionsAiChip">{row.product_group}</span> : null}
                              {toText(row.action_type) ? <span className="productActionsAiChip">{row.action_type}</span> : null}
                              {toText(row.action_stage) ? <span className="productActionsAiChip">{row.action_stage}</span> : null}
                              {toText(row.action_object_category) ? <span className="productActionsAiChip secondary">{row.action_object_category}</span> : null}
                              {toText(row.action_method) ? <span className="productActionsAiChip secondary">{row.action_method}</span> : null}
                              {toText(row.role) ? <span className="productActionsAiChip role">{row.role}</span> : null}
                            </div>
                            {duplicate && toText(row.duplicate_reason) ? (
                              <div className="productActionsAiCardDuplicateReason">{toText(row.duplicate_reason)}</div>
                            ) : null}
                            {reasonText ? (
                              <div className="productActionsAiCardReason">{reasonText}</div>
                            ) : null}
                            <div className="productActionsAiCardMeta">
                              <span className={`productActionsAiConfidence ${confidenceLevel}`}>{confidencePct}%</span>
                              {toText(row.step_label) ? <span className="productActionsAiCardMetaItem">{row.step_label}</span> : null}
                              {toText(row.bpmn_element_id || row.node_id) ? (
                                <span className="productActionsAiCardMetaItem muted">BPMN: {row.bpmn_element_id || row.node_id}</span>
                              ) : null}
                            </div>
                          </div>
                        </div>
                        <details className="productActionsAiCardEdit">
                          <summary>Редактировать поля</summary>
                          <div className="productActionsEditorGroups compactFields">
                            {FIELD_GROUPS.map((group) => (
                              <fieldset className="productActionsEditorGroup" key={`${rowId}_${group.title}`}>
                                <legend>{group.title}</legend>
                                <div className="productActionsEditor">
                                  {group.keys.map((key) => {
                                    const field = fieldConfigByKey[key];
                                    if (!field) return null;
                                    return (
                                      <label className="interviewField" key={`${rowId}_${field.key}`}>
                                        <span>{field.label}</span>
                                        {field.type === "select" ? (
                                          <select
                                            className="select"
                                            value={toText(row?.[field.key])}
                                            onChange={(e) => patchAiRow(rowId, field.key, e.target.value)}
                                          >
                                            <option value="">— не выбрано —</option>
                                            {field.options.map((option) => (
                                              <option key={option} value={option}>{option}</option>
                                            ))}
                                          </select>
                                        ) : (
                                          <input
                                            className="input"
                                            value={toText(row?.[field.key])}
                                            onChange={(e) => patchAiRow(rowId, field.key, e.target.value)}
                                            placeholder={field.placeholder || ""}
                                          />
                                        )}
                                      </label>
                                    );
                                  })}
                                </div>
                              </fieldset>
                            ))}
                          </div>
                        </details>
                      </article>
                    );
                  })}
                </div>
              ) : (
                <div className="productActionsAiEmpty" data-testid="product-actions-ai-empty">
                  AI не нашёл действий с продуктом для выбранного шага. Попробуйте другой шаг или заполните действия вручную.
                </div>
              )}
              <div className="productActionsAiStickyFooter">
                <div className="productActionsAiFooterLeft">
                  <button
                    type="button"
                    className="secondaryBtn smallBtn"
                    onClick={() => {
                      setAiDraft(null);
                      aiDraftStepIdRef.current = "";
                      setAiRows([]);
                      setSelectedAiRowIds(new Set());
                      setAiStatus(null);
                      setAiProgress(null);
                      setAiDiagnostics(null);
                    }}
                    disabled={aiApplying}
                  >
                    Закрыть AI-предложения
                  </button>
                  {aiRows.length > 0 ? (
                    <button
                      type="button"
                      className="secondaryBtn smallBtn"
                      onClick={() => setSelectedAiRowIds(new Set())}
                      disabled={aiApplying || selectedAiRows.length === 0}
                    >
                      Снять выбор
                    </button>
                  ) : null}
                </div>
                <button
                  type="button"
                  className="primaryBtn smallBtn"
                  onClick={handleAcceptAiRows}
                  disabled={!canAcceptAiRows}
                  data-testid="product-actions-ai-accept"
                >
                  {aiApplying ? "Применяю…" : "Принять выбранные"}
                </button>
              </div>
            </div>
          ) : null}
          {aiProgress?.active ? (
            <div
              className={`productActionsAiProgress ${aiProgress.status || "running"}`}
              data-testid="product-actions-ai-progress"
              aria-live="polite"
            >
              <div className="productActionsAiProgressHead">
                <div>
                  <div className="productActionsEditorTitle">AI-запуск</div>
                  <div className="productActionsSub" data-testid="product-actions-ai-progress-message">
                    {aiProgress.message || "Выполняем AI-подготовку."}
                  </div>
                </div>
                <div className="productActionsAiProgressPercent" data-testid="product-actions-ai-progress-percent">
                  {aiProgressBadge(aiProgress)}
                </div>
              </div>
              <div className="productActionsAiProgressBar" aria-hidden="true">
                <span style={{ width: `${aiProgressBarPercent(aiProgress)}%` }} />
              </div>
              <div className="productActionsAiProgressCurrent" data-testid="product-actions-ai-progress-current">
                Текущий этап: {aiProgress.stageLabel || "Подготавливаем процесс"}
              </div>
              <ol className="productActionsAiProgressSteps" data-testid="product-actions-ai-progress-steps">
                {AI_PROGRESS_STAGES.map((stage) => {
                  const done = Number(stage.percent || 0) < Number(aiProgress.percent || 0);
                  const active = stage.id === aiProgress.stageId || stage.label === aiProgress.stageLabel;
                  return (
                    <li key={stage.id} className={active ? "active" : done ? "done" : ""}>
                      <span>{stage.label}</span>
                    </li>
                  );
                })}
              </ol>
              {aiProgress.status === "error" ? (
                <div className="productActionsAiProgressError" data-testid="product-actions-ai-progress-error">
                  <span>Ошибка на этапе: {aiProgress.stageLabel}</span>
                  <button
                    type="button"
                    className="productActionsToolbarBtn"
                    onClick={() => { setAiProgress(null); setAiStatus(null); setAiDiagnostics(null); }}
                    data-testid="product-actions-ai-progress-dismiss"
                  >
                    Закрыть
                  </button>
                </div>
              ) : null}
              {aiProgress.status === "error" && aiProgress.errorCode === "AI_RESPONSE_PARSE_ERROR" && aiDiagnostics ? (
                <details className="productActionsAiDiagnostics" data-testid="product-actions-ai-diagnostics">
                  <summary>Технические детали</summary>
                  <div className="productActionsAiDiagnosticsBody">
                    {aiDiagnostics.execution_id ? <div><b>execution_id:</b> {aiDiagnostics.execution_id}</div> : null}
                    {aiDiagnostics.parse_error ? <div><b>parse_error:</b> {aiDiagnostics.parse_error}</div> : null}
                    {aiDiagnostics.response_excerpt ? <div><b>response_excerpt:</b> <code>{aiDiagnostics.response_excerpt}</code></div> : null}
                  </div>
                </details>
              ) : null}
            </div>
          ) : null}

      <div className="productActionsSectionDivider" data-testid="product-actions-section-divider"></div>

      {visibleActions.length ? (
        <div className="productActionsList" data-testid="product-actions-list">
          {visibleActions.map((row) => {
            const isCurrentStepAction = actionMatchesBinding(row, selectedBinding);
            return (
            <article
              key={row.id}
              className={"productActionCard " + (row.id === editingActionId ? "active" : "") + (!isCurrentStepAction ? " otherStep" : "")}
              data-testid="product-action-card"
            >
              <div className="productActionCardMain">
                <div className="productActionCardTitle">
                  {actionTitle(row)}
                  {isIncompleteAction(row) ? <span className="productActionIncomplete">Неполное</span> : null}
                </div>
                <div className="productActionCardSub">
                  {displayValue(row.product_group, "Группа не указана")}
                </div>
                <div className="productActionCardSummaryLine">{actionSummary(row)}</div>
              </div>
              <details className="productActionCardDetails">
                <summary>Поля действия</summary>
                <div className="productActionFacts">
                  {ACTION_CARD_FIELDS.map(([label, key]) => (
                    <div className="productActionFact" key={key}>
                      <span className="productActionFactLabel">{label}</span>
                      <span className="productActionFactValue">{displayValue(row[key])}</span>
                    </div>
                  ))}
                </div>
              </details>
              <div className="productActionCardFooter">
                <div className="productActionBindingMeta">
                  <span><b>Шаг</b>{row.step_label || selectedBinding.step_label || "Шаг без названия"}</span>
                  <span><b>BPMN</b>{row.bpmn_element_id || row.node_id || "нет привязки"}</span>
                  <span><b>Роль</b>{row.role || "не указана"}</span>
                </div>
                {isCurrentStepAction ? (
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                      type="button"
                      className="secondaryBtn tinyBtn"
                      onClick={() => {
                        setEditingActionId(row.id);
                        setEditorOpen(true);
                        setStatus(null);
                      }}
                    >
                      Редактировать
                    </button>
                    <button
                      type="button"
                      className="secondaryBtn tinyBtn"
                      onClick={async () => {
                        if (!window.confirm(`Удалить действие "${actionTitle(row)}"?`)) return;
                        setStatus({ type: "saving", text: "Удаляю действие…" });
                        const result = await deleteProductActionForStep({
                          sessionId,
                          currentAnalysis: interviewData?.analysis,
                          actionId: row.id,
                          getBaseDiagramStateVersion,
                          rememberDiagramStateVersion,
                          onSessionSync,
                        });
                        if (result?.ok) {
                          setStatus({ type: "saved", text: "Действие удалено." });
                        } else {
                          setStatus({
                            type: Number(result?.status || 0) === 409 ? "conflict" : "error",
                            text: toText(result?.error) || "Не удалось удалить действие с продуктом.",
                          });
                        }
                      }}
                      data-testid="product-action-delete-btn"
                    >
                      Удалить
                    </button>
                  </div>
                ) : (
                  <span className="productActionReadonlyHint">Действие другого шага</span>
                )}
              </div>
            </article>
            );
          })}
        </div>
      ) : aiProgress?.active ? null : (
        <div className="productActionsEmpty">
          {actionsScope === "all"
            ? "В анализе пока нет сохранённых действий с продуктом."
            : "Для выбранного шага ещё нет действий с продуктом."}
        </div>
      )}

      {!editorOpen ? null : (
      <div className="productActionsEditorShell" data-testid="product-actions-editor">
        <div className="productActionsEditorHead">
          <div>
            <div className="productActionsEditorTitle">
              {editingAction ? "Редактирование действия" : "Новое действие с продуктом"}
            </div>
            <div className="productActionsSub">
              Эти поля будут сохранены для выбранного шага.
            </div>
          </div>
        </div>
        <div className="productActionsEditorGroups">
          {FIELD_GROUPS.map((group) => (
            <fieldset className="productActionsEditorGroup" key={group.title}>
              <legend>{group.title}</legend>
              <div className="productActionsEditor">
                {group.keys.map((key) => {
                  const field = fieldConfigByKey[key];
                  if (!field) return null;
                  return (
                    <label className="interviewField" key={field.key}>
                      <span>{field.label}</span>
                      {field.type === "select" ? (
                        <select
                          className="select"
                          value={toText(draft?.[field.key])}
                          onChange={(e) => patchDraft(field.key, e.target.value)}
                        >
                          <option value="">— не выбрано —</option>
                          {field.options.map((option) => (
                            <option key={option} value={option}>{option}</option>
                          ))}
                        </select>
                      ) : (
                        <input
                          className="input"
                          value={toText(draft?.[field.key])}
                          onChange={(e) => patchDraft(field.key, e.target.value)}
                          placeholder={field.placeholder || ""}
                        />
                      )}
                    </label>
                  );
                })}
              </div>
            </fieldset>
          ))}
          <div className="productActionsEditorContext">
            <span><b>Шаг</b>{selectedBinding.step_label || "Шаг без названия"}</span>
            <span><b>BPMN</b>{selectedBinding.bpmn_element_id || selectedBinding.node_id || "нет привязки"}</span>
          </div>
        </div>

      <div className="productActionsFooter">
        <button
          type="button"
          className="secondaryBtn smallBtn"
          onClick={() => {
            setEditorOpen(false);
            setStatus(null);
          }}
        >
          Отменить
        </button>
        <button
          type="button"
          className="primaryBtn smallBtn"
          onClick={handleSave}
          disabled={saving || !canSaveDraft}
          data-testid="product-action-save"
        >
          {saving ? "Сохраняю…" : "Сохранить действие"}
        </button>
        {editingActionId ? (
          <button
            type="button"
            className="secondaryBtn smallBtn"
            onClick={handleDelete}
            disabled={saving}
          >
            Удалить
          </button>
        ) : null}
      </div>
      </div>
      )}
      {status ? (
        <div className={`productActionsStatus ${status.type || "pending"}`} data-testid="product-action-status">
          {statusText(status)}
        </div>
      ) : null}
      {aiStatus ? (
        <div className={`productActionsStatus ${aiStatus.type || "pending"}`} data-testid="product-actions-ai-status">
          {statusText(aiStatus)}
        </div>
      ) : null}
        </>
      ) : null}
    </section>
  );
}
