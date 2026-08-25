import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  apiApplyProductActionSuggestions,
  apiGetRagReadiness,
  apiListProductActionSuggestions,
  apiSuggestProductActions,
  apiTransitionRagReadiness,
  apiUpdateProductActionSuggestion,
} from "../../../lib/api.js";
import { AnalysisEmptyState, AnalysisErrorState, AnalysisSection, AnalysisSkeleton } from "./ui/index.js";
import styles from "./ProcessAnalysis.module.css";

const STATUS_LABELS = {
  pending: "На рассмотрении",
  approved: "Утверждено",
  rejected: "Отклонено",
};

const STATUS_BADGE_CLASS = {
  pending: styles.suggestionBadgePending,
  approved: styles.suggestionBadgeApproved,
  rejected: styles.suggestionBadgeRejected,
};

const RAG_STATUS_LABELS = {
  not_ready: "Не готова",
  ready: "Готова к индексации",
  queued: "В очереди на индексацию",
  indexed: "Проиндексирована",
};

function isPlainObject(value) {
  return value !== null && typeof value === "object" && Object.prototype.toString.call(value) === "[object Object]";
}

function text(value) {
  return String(value || "").trim();
}

function getActionField(suggestion, key) {
  const action = isPlainObject(suggestion?.action) ? suggestion.action : {};
  const binding = isPlainObject(suggestion?.binding) ? suggestion.binding : {};
  return text(action[key] || binding[key]);
}

function setActionField(suggestion, key, value) {
  const next = { ...suggestion };
  next.action = { ...(isPlainObject(suggestion.action) ? suggestion.action : {}) };
  next.action[key] = value;
  return next;
}

function stepLabel(suggestion) {
  return getActionField(suggestion, "step_label") || getActionField(suggestion, "label") || "Шаг не выбран";
}

function SuggestionWarnings({ warnings }) {
  const items = Array.isArray(warnings) ? warnings : [];
  if (!items.length) return null;
  return (
    <ul className={styles.suggestionWarnings}>
      {items.map((w, i) => (
        <li key={i}>{text(w?.message || w)}</li>
      ))}
    </ul>
  );
}

function SuggestionRow({
  suggestion,
  onStatusChange,
  onFieldChange,
  editing,
  onToggleEdit,
  stepOptions,
}) {
  const status = text(suggestion.status) || "pending";
  const isRejected = status === "rejected";
  const productName = getActionField(suggestion, "product_name");
  const productGroup = getActionField(suggestion, "product_group");
  const actionType = getActionField(suggestion, "action_type");
  const actionStage = getActionField(suggestion, "action_stage");
  const actionObject = getActionField(suggestion, "action_object");
  const actionObjectCategory = getActionField(suggestion, "action_object_category");
  const actionMethod = getActionField(suggestion, "action_method");
  const step = stepLabel(suggestion);

  return (
    <div
      className={`${styles.suggestionRow} ${isRejected ? styles.suggestionRowRejected : ""}`}
      data-testid={`product-action-suggestion-${suggestion.id || "row"}`}
    >
      <div className={styles.suggestionRowHead}>
        <div className={styles.suggestionRowTitle}>
          <span className={styles.suggestionRowProduct}>{productName || "Продукт не указан"}</span>
          {productGroup ? <span className={styles.suggestionRowGroup}>{productGroup}</span> : null}
        </div>
        <div className={styles.suggestionRowStatus}>
          <span className={`${styles.suggestionBadge} ${STATUS_BADGE_CLASS[status] || STATUS_BADGE_CLASS.pending}`}>
            {STATUS_LABELS[status] || status}
          </span>
        </div>
      </div>

      <div className={styles.suggestionRowTags}>
        {editing ? (
          <>
            <label className={styles.suggestionTagEdit}>
              <span>Тип</span>
              <input
                type="text"
                value={actionType}
                onChange={(e) => onFieldChange("action_type", e.target.value)}
                className={styles.analysisTableInput}
                placeholder="вскрытие, перекладывание..."
              />
            </label>
            <label className={styles.suggestionTagEdit}>
              <span>Этап</span>
              <input
                type="text"
                value={actionStage}
                onChange={(e) => onFieldChange("action_stage", e.target.value)}
                className={styles.analysisTableInput}
                placeholder="до разогрева, сборка..."
              />
            </label>
            <label className={styles.suggestionTagEdit}>
              <span>Объект</span>
              <input
                type="text"
                value={actionObject}
                onChange={(e) => onFieldChange("action_object", e.target.value)}
                className={styles.analysisTableInput}
                placeholder="суп, рис, курица..."
              />
            </label>
            <label className={styles.suggestionTagEdit}>
              <span>Способ</span>
              <input
                type="text"
                value={actionMethod}
                onChange={(e) => onFieldChange("action_method", e.target.value)}
                className={styles.analysisTableInput}
                placeholder="перелить, щипцами..."
              />
            </label>
          </>
        ) : (
          <>
            {actionType ? <span className={styles.suggestionTag}>{actionType}</span> : null}
            {actionStage ? <span className={styles.suggestionTag}>{actionStage}</span> : null}
            {actionObject ? <span className={styles.suggestionTag}>{actionObject}</span> : null}
            {actionObjectCategory ? (
              <span className={`${styles.suggestionTag} ${styles.suggestionTagMuted}`}>{actionObjectCategory}</span>
            ) : null}
            {actionMethod ? <span className={styles.suggestionTag}>{actionMethod}</span> : null}
          </>
        )}
      </div>

      <div className={styles.suggestionRowBinding}>
        <span className={styles.suggestionRowBindingLabel}>Привязка:</span>
        {editing ? (
          <select
            value={getActionField(suggestion, "step_id") || getActionField(suggestion, "node_id") || ""}
            onChange={(e) => {
              const found = stepOptions.find((s) => String(s.id || s.node_id || "") === e.target.value);
              if (!found) return;
              let next = { ...suggestion };
              next.action = { ...(isPlainObject(suggestion.action) ? suggestion.action : {}) };
              next.binding = { ...(isPlainObject(suggestion.binding) ? suggestion.binding : {}) };
              next.action.step_id = found.id || found.step_id || found.node_id || "";
              next.action.step_label = found.label || found.title || found.id || "";
              next.action.node_id = found.node_id || found.id || "";
              next.action.bpmn_element_id = found.node_id || found.id || "";
              next.binding.step_id = found.id || found.step_id || found.node_id || "";
              next.binding.step_label = found.label || found.title || found.id || "";
              next.binding.node_id = found.node_id || found.id || "";
              next.binding.bpmn_element_id = found.node_id || found.id || "";
              onFieldChange("__replace__", next);
            }}
            className={styles.analysisTableInput}
          >
            <option value="">— выберите шаг —</option>
            {stepOptions.map((s) => (
              <option key={String(s.id || s.node_id || s.step_id || Math.random())} value={String(s.id || s.node_id || s.step_id || "")}>
                {s.label || s.title || s.id || s.node_id || "Шаг"}
              </option>
            ))}
          </select>
        ) : (
          <span className={styles.suggestionRowBindingValue}>{step}</span>
        )}
      </div>

      <SuggestionWarnings warnings={suggestion.warnings} />

      <div className={styles.suggestionRowActions}>
        {status !== "approved" ? (
          <button
            type="button"
            className="primaryBtn smallBtn"
            onClick={() => onStatusChange("approved")}
            data-testid={`suggestion-approve-${suggestion.id || "x"}`}
          >
            Утвердить
          </button>
        ) : null}
        {status !== "rejected" ? (
          <button
            type="button"
            className="secondaryBtn smallBtn"
            onClick={() => onStatusChange("rejected")}
            data-testid={`suggestion-reject-${suggestion.id || "x"}`}
          >
            Отклонить
          </button>
        ) : null}
        <button
          type="button"
          className="secondaryBtn smallBtn"
          onClick={onToggleEdit}
          data-testid={`suggestion-edit-${suggestion.id || "x"}`}
        >
          {editing ? "Готово" : "Изменить"}
        </button>
      </div>
    </div>
  );
}

export const ProductActionSuggestionsPanel = React.memo(function ProductActionSuggestionsPanel({
  sessionId,
  baseDiagramStateVersion,
  steps = [],
}) {
  const [suggestions, setSuggestions] = useState([]);
  const [counts, setCounts] = useState({ pending: 0, approved: 0, rejected: 0, total: 0 });
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [applying, setApplying] = useState(false);
  const [ragLoading, setRagLoading] = useState(false);
  const [error, setError] = useState(null);
  const [ragReadiness, setRagReadiness] = useState(null);
  const [editingIds, setEditingIds] = useState(new Set());

  const stepOptions = useMemo(() => {
    return Array.isArray(steps)
      ? steps.map((s) => ({
          id: text(s?.id || s?.step_id || s?.node_id),
          step_id: text(s?.id || s?.step_id),
          node_id: text(s?.node_id || s?.bpmn_element_id),
          label: text(s?.label || s?.action || s?.title || s?.node_bind_title),
          title: text(s?.title || s?.label || s?.action),
        }))
      : [];
  }, [steps]);

  const loadSuggestions = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await apiListProductActionSuggestions(sessionId);
      if (!r.ok) {
        setError(r.error || r.data?.detail?.message || "Не удалось загрузить подсказки");
        return;
      }
      setSuggestions(r.suggestions || []);
      setCounts(r.counts || { pending: 0, approved: 0, rejected: 0, total: 0 });
    } catch (e) {
      setError(String(e || "Ошибка загрузки"));
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  const loadRagReadiness = useCallback(async () => {
    try {
      const r = await apiGetRagReadiness(sessionId);
      if (r.ok) setRagReadiness(r.readiness || null);
    } catch {
      // игнорируем — RAG-статус не блокирует основной флоу
    }
  }, [sessionId]);

  useEffect(() => {
    void loadSuggestions();
    void loadRagReadiness();
  }, [loadSuggestions, loadRagReadiness]);

  const handleGenerate = useCallback(async () => {
    setGenerating(true);
    setError(null);
    try {
      const r = await apiSuggestProductActions(sessionId, { options: { max_suggestions: 20 } });
      if (!r.ok) {
        setError(r.error || r.message || "Не удалось сгенерировать действия");
        return;
      }
      const generated = Array.isArray(r.suggestions) ? r.suggestions : [];
      if (!generated.length) {
        setError("LLM не предложил действий. Проверьте, что в сессии есть шаги и настроен AI-провайдер.");
        return;
      }
      for (const raw of generated) {
        const row = raw || {};
        const action = isPlainObject(row.action) ? row.action : {};
        const binding = isPlainObject(row.binding) ? row.binding : {};
        const payload = {
          id: text(row.id) || undefined,
          status: "pending",
          source: text(row.source) || "llm",
          action: {
            product_name: text(action.product_name || row.product_name),
            product_group: text(action.product_group || row.product_group),
            action_type: text(action.action_type || row.action_type),
            action_stage: text(action.action_stage || row.action_stage),
            action_object: text(action.action_object || row.action_object),
            action_object_category: text(action.action_object_category || row.action_object_category),
            action_method: text(action.action_method || row.action_method),
            step_id: text(action.step_id || binding.step_id || row.step_id),
            step_label: text(action.step_label || binding.step_label || row.step_label),
            node_id: text(action.node_id || binding.node_id || row.node_id),
            bpmn_element_id: text(action.bpmn_element_id || binding.bpmn_element_id || row.bpmn_element_id),
            role: text(action.role || binding.role || row.role),
          },
          binding: {
            step_id: text(binding.step_id || action.step_id || row.step_id),
            step_label: text(binding.step_label || action.step_label || row.step_label),
            node_id: text(binding.node_id || action.node_id || row.node_id),
            bpmn_element_id: text(binding.bpmn_element_id || action.bpmn_element_id || row.bpmn_element_id),
          },
          original_llm_output: row.original_llm_output || row,
        };
        await apiUpdateProductActionSuggestion(sessionId, payload);
      }
      await loadSuggestions();
    } catch (e) {
      setError(String(e || "Ошибка генерации"));
    } finally {
      setGenerating(false);
    }
  }, [sessionId, loadSuggestions]);

  const updateSuggestionLocal = useCallback((id, updater) => {
    setSuggestions((prev) => prev.map((s) => (String(s.id) === String(id) ? updater(s) : s)));
  }, []);

  const persistSuggestion = useCallback(
    async (suggestion) => {
      const payload = {
        id: suggestion.id,
        status: suggestion.status,
        source: text(suggestion.source) || "llm",
        action: isPlainObject(suggestion.action) ? suggestion.action : {},
        binding: isPlainObject(suggestion.binding) ? suggestion.binding : {},
        original_llm_output: isPlainObject(suggestion.original_llm_output) ? suggestion.original_llm_output : {},
      };
      const r = await apiUpdateProductActionSuggestion(sessionId, payload);
      if (!r.ok) {
        setError(r.error || "Не удалось сохранить изменения");
        return false;
      }
      return true;
    },
    [sessionId]
  );

  const handleStatusChange = useCallback(
    async (id, status) => {
      let updated = null;
      updateSuggestionLocal(id, (s) => {
        updated = { ...s, status };
        return updated;
      });
      if (updated) await persistSuggestion(updated);
    },
    [updateSuggestionLocal, persistSuggestion]
  );

  const handleFieldChange = useCallback(
    async (id, key, value) => {
      let updated = null;
      updateSuggestionLocal(id, (s) => {
        if (key === "__replace__" && isPlainObject(value)) {
          updated = value;
          return updated;
        }
        updated = setActionField(s, key, value);
        return updated;
      });
      if (updated) await persistSuggestion(updated);
    },
    [updateSuggestionLocal, persistSuggestion]
  );

  const handleBulkApprove = useCallback(async () => {
    const pending = suggestions.filter((s) => text(s.status) !== "approved" && text(s.status) !== "rejected");
    for (const s of pending) {
      await handleStatusChange(s.id, "approved");
    }
  }, [suggestions, handleStatusChange]);

  const handleBulkReject = useCallback(async () => {
    const pending = suggestions.filter((s) => text(s.status) !== "approved" && text(s.status) !== "rejected");
    for (const s of pending) {
      await handleStatusChange(s.id, "rejected");
    }
  }, [suggestions, handleStatusChange]);

  const handleApply = useCallback(async () => {
    setApplying(true);
    setError(null);
    try {
      const r = await apiApplyProductActionSuggestions(sessionId, baseDiagramStateVersion);
      if (!r.ok) {
        setError(r.error || r.data?.detail?.message || "Не удалось применить утверждённые действия");
        return;
      }
      await loadSuggestions();
      await loadRagReadiness();
    } catch (e) {
      setError(String(e || "Ошибка применения"));
    } finally {
      setApplying(false);
    }
  }, [sessionId, baseDiagramStateVersion, loadSuggestions, loadRagReadiness]);

  const handleSendToRag = useCallback(async () => {
    setRagLoading(true);
    setError(null);
    try {
      const r = await apiTransitionRagReadiness(sessionId, "queued");
      if (!r.ok) {
        setError(r.error || r.data?.detail?.message || "Не удалось отправить на индексацию");
        return;
      }
      await loadRagReadiness();
    } catch (e) {
      setError(String(e || "Ошибка индексации"));
    } finally {
      setRagLoading(false);
    }
  }, [sessionId, loadRagReadiness]);

  const approvedCount = counts.approved || 0;
  const pendingCount = counts.pending || 0;
  const rejectedCount = counts.rejected || 0;
  const hasSuggestions = suggestions.length > 0;

  const actions = (
    <>
      {hasSuggestions ? (
        <>
          <button
            type="button"
            className="secondaryBtn smallBtn"
            onClick={handleBulkApprove}
            disabled={pendingCount === 0}
            data-testid="product-actions-bulk-approve"
          >
            Утвердить всё
          </button>
          <button
            type="button"
            className="secondaryBtn smallBtn"
            onClick={handleBulkReject}
            disabled={pendingCount === 0}
            data-testid="product-actions-bulk-reject"
          >
            Отклонить всё
          </button>
        </>
      ) : null}
      <button
        type="button"
        className="primaryBtn smallBtn"
        onClick={handleGenerate}
        disabled={generating || loading}
        data-testid="product-actions-generate"
      >
        {generating ? "Генерация…" : "Сгенерировать действия"}
      </button>
    </>
  );

  if (loading && !hasSuggestions) {
    return <AnalysisSkeleton variant="card" count={3} data-testid="product-actions-skeleton" />;
  }

  return (
    <AnalysisSection
      title="Действия с продуктом"
      subtitle="AI-предложения действий с продуктом/ингредиентом: утвердите, отредактируйте теги и привяжите к шагам."
      actions={actions}
      data-testid="product-action-suggestions-panel"
    >
      {error ? (
        <AnalysisErrorState
          title="Ошибка"
          message={error}
          onRetry={() => {
            setError(null);
            void loadSuggestions();
          }}
          retryLabel="Повторить"
          data-testid="product-actions-error"
        />
      ) : null}

      {!hasSuggestions && !generating ? (
        <AnalysisEmptyState
          title="Нет предложений"
          description="Нажмите «Сгенерировать действия», чтобы LLM предложил действия с продуктом на основе шагов процесса."
          data-testid="product-actions-empty"
        />
      ) : null}

      {hasSuggestions ? (
        <>
          <div className={styles.suggestionStats} data-testid="product-actions-stats">
            <span>Всего: <b>{counts.total}</b></span>
            <span className={styles.suggestionStatsPending}>На рассмотрении: <b>{pendingCount}</b></span>
            <span className={styles.suggestionStatsApproved}>Утверждено: <b>{approvedCount}</b></span>
            <span className={styles.suggestionStatsRejected}>Отклонено: <b>{rejectedCount}</b></span>
          </div>

          <div className={styles.suggestionList} data-testid="product-actions-list">
            {suggestions.map((s) => (
              <SuggestionRow
                key={String(s.id || Math.random())}
                suggestion={s}
                stepOptions={stepOptions}
                editing={editingIds.has(String(s.id))}
                onToggleEdit={() => {
                  setEditingIds((prev) => {
                    const next = new Set(prev);
                    if (next.has(String(s.id))) next.delete(String(s.id));
                    else next.add(String(s.id));
                    return next;
                  });
                }}
                onStatusChange={(status) => void handleStatusChange(s.id, status)}
                onFieldChange={(key, value) => void handleFieldChange(s.id, key, value)}
              />
            ))}
          </div>

          {approvedCount > 0 ? (
            <div className={styles.suggestionApplyBar}>
              <button
                type="button"
                className="primaryBtn"
                onClick={handleApply}
                disabled={applying}
                data-testid="product-actions-apply"
              >
                {applying ? "Применение…" : `Применить ${approvedCount} утверждённых`}
              </button>
              <span className={styles.analysisHint}>
                После применения действия сохранятся в сессии и сессия станет готовой к RAG-индексации.
              </span>
            </div>
          ) : null}
        </>
      ) : null}

      {ragReadiness ? (
        <div className={styles.suggestionRagBanner} data-testid="product-actions-rag-banner">
          <div className={styles.suggestionRagStatus}>
            <span className={styles.suggestionRagLabel}>RAG-статус:</span>
            <span className={styles.suggestionRagValue}>
              {RAG_STATUS_LABELS[text(ragReadiness.rag_readiness_status)] || ragReadiness.rag_readiness_status || "неизвестен"}
            </span>
          </div>
          {text(ragReadiness.rag_readiness_status) === "ready" ? (
            <button
              type="button"
              className="primaryBtn smallBtn"
              onClick={handleSendToRag}
              disabled={ragLoading}
              data-testid="product-actions-send-rag"
            >
              {ragLoading ? "Отправка…" : "Отправить на RAG-индексацию"}
            </button>
          ) : null}
          {text(ragReadiness.rag_readiness_status) === "queued" ? (
            <span className={styles.analysisHint}>Сессия в очереди на ночное индексирование (~04:30).</span>
          ) : null}
          {text(ragReadiness.rag_readiness_status) === "indexed" ? (
            <span className={styles.analysisHint}>
              Последняя индексация: {ragReadiness.indexed_at ? new Date(ragReadiness.indexed_at).toLocaleString("ru-RU") : "—"}
              {ragReadiness.has_unindexed_changes ? " (есть неиндексированные изменения)" : ""}
            </span>
          ) : null}
        </div>
      ) : null}
    </AnalysisSection>
  );
});
