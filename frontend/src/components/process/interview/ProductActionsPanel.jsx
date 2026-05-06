import { useEffect, useMemo, useRef, useState } from "react";
import {
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

function actionTitle(rowRaw) {
  const row = rowRaw && typeof rowRaw === "object" ? rowRaw : {};
  return toText(row.product_name) || toText(row.action_object) || toText(row.action_type) || "Неполное действие";
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

export default function ProductActionsPanel({
  sessionId = "",
  interviewData = null,
  timelineView = [],
  selectedStepIds = [],
  compact = false,
  showStepContext = true,
  getBaseDiagramStateVersion = null,
  rememberDiagramStateVersion = null,
  onSessionSync = null,
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
  const actionsForStep = useMemo(
    () => listProductActionsForStep(productActions, selectedStep),
    [productActions, selectedStep],
  );
  const [editingActionId, setEditingActionId] = useState("");
  const editingAction = actionsForStep.find((row) => row.id === editingActionId) || null;
  const [draft, setDraft] = useState(() => createDraftForStep(selectedStep));
  const draftResetKey = `${toText(selectedStep?.id)}::${toText(editingAction?.id)}`;
  const lastDraftResetKeyRef = useRef(draftResetKey);
  const [editorOpen, setEditorOpen] = useState(false);
  const [actionsScope, setActionsScope] = useState("step");
  const [status, setStatus] = useState(null);
  const [saving, setSaving] = useState(false);

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

  const selectedBinding = deriveProductActionBindingFromStep(selectedStep);
  const actionCount = productActions.length;
  const stepActionCount = actionsForStep.length;
  const visibleActions = actionsScope === "all" ? productActions : actionsForStep;
  const canSaveDraft = hasMeaningfulProductActionDraft(draft);
  const fieldConfigByKey = useMemo(() => {
    const fields = [...FIELD_CONFIGS, { key: "role", label: "Роль", type: "text", placeholder: "Повар" }];
    return Object.fromEntries(fields.map((field) => [field.key, field]));
  }, []);

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

  return (
    <section className={`productActionsPanel${compact ? " compact" : ""}`} data-testid="product-actions-panel">
      <div className="productActionsHeader">
        <div>
          <div className="productActionsTitle">Действия с продуктом</div>
          <div className="productActionsSub">
            {actionCount ? `Сохранено: ${actionCount}` : "Нет сохранённых действий"}
          </div>
        </div>
        <button
          type="button"
          className="secondaryBtn smallBtn"
          disabled={!steps.length}
          onClick={() => {
            setEditingActionId("");
            setDraft(createDraftForStep(selectedStep));
            lastDraftResetKeyRef.current = `${toText(selectedStep?.id)}::`;
            setEditorOpen(true);
            setStatus(null);
          }}
        >
          Добавить действие
        </button>
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
                ) : (
                  <span className="productActionReadonlyHint">Действие другого шага</span>
                )}
              </div>
            </article>
            );
          })}
        </div>
      ) : (
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
        </>
      ) : null}
    </section>
  );
}
