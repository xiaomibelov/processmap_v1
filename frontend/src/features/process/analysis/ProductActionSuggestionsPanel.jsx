import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  apiApplyProductActionSuggestions,
  apiExportProductActions,
  apiGetRagReadiness,
  apiListProductActionSuggestions,
  apiSuggestProductActions,
  apiTransitionRagReadiness,
  apiUpdateProductActionSuggestion,
} from "../../../lib/api.js";
import { isProductActionValid } from "./productActionsModel.js";
import { AnalysisEmptyState, AnalysisErrorState, AnalysisSection, AnalysisSkeleton } from "./ui/index.js";
import { createT } from "./useProcessAnalysisI18n.js";
import styles from "./ProcessAnalysis.module.css";

const defaultT = createT("ru");

const KNOWN_ERROR_CODES = [
  "AI_PROVIDER_NOT_CONFIGURED",
  "AI_PROVIDER_ERROR",
  "AI_RESPONSE_PARSE_ERROR",
  "AI_RATE_LIMIT_EXCEEDED",
  "AI_SUGGEST_NO_STEPS",
  "AI_SUGGEST_LLM_EMPTY",
  "AI_SUGGEST_ALL_INVALID",
  "missing_api_key",
  "provider_error",
  "ai_rate_limit_exceeded",
];

function getErrorCode(error) {
  const s = String(error || "");
  for (const code of KNOWN_ERROR_CODES) {
    if (s.includes(code)) return code;
  }
  return null;
}

function formatErrorMessage(error, t) {
  const code = getErrorCode(error);
  if (!code) return error;
  const map = {
    AI_PROVIDER_NOT_CONFIGURED: t("processAnalysis.ai.providerNotConfigured"),
    AI_PROVIDER_ERROR: t("processAnalysis.ai.providerError"),
    AI_RESPONSE_PARSE_ERROR: t("processAnalysis.ai.parseError"),
    AI_RATE_LIMIT_EXCEEDED: t("processAnalysis.ai.rateLimit"),
    AI_SUGGEST_NO_STEPS: t("processAnalysis.ai.suggestNoSteps"),
    AI_SUGGEST_LLM_EMPTY: t("processAnalysis.ai.suggestLlmEmpty"),
    AI_SUGGEST_ALL_INVALID: t("processAnalysis.ai.suggestAllInvalid"),
    missing_api_key: t("processAnalysis.ai.missingApiKey"),
    provider_error: t("processAnalysis.ai.providerError"),
    ai_rate_limit_exceeded: t("processAnalysis.ai.rateLimit"),
  };
  return map[code] || error;
}

function statusLabel(status, t) {
  const key = {
    pending: "processAnalysis.ai.statusPending",
    approved: "processAnalysis.ai.statusApproved",
    rejected: "processAnalysis.ai.statusRejected",
  }[status];
  return key ? t(key) : status;
}

function ragStatusLabel(status, t) {
  const labels = {
    not_ready: t("processAnalysis.ai.ragStatus.notReady"),
    ready: t("processAnalysis.ai.ragStatus.ready"),
    queued: t("processAnalysis.ai.ragStatus.queued"),
    indexed: t("processAnalysis.ai.ragStatus.indexed"),
  };
  return labels[status] || status || t("common.unknown");
}

const STATUS_BADGE_CLASS = {
  pending: styles.suggestionBadgePending,
  approved: styles.suggestionBadgeApproved,
  rejected: styles.suggestionBadgeRejected,
};

function isPlainObject(value) {
  return value !== null && typeof value === "object" && Object.prototype.toString.call(value) === "[object Object]";
}

function text(value) {
  return String(value || "").trim();
}

function fmt(template, values) {
  if (!template || typeof template !== "string") return "";
  return Object.entries(values || {}).reduce((s, [key, value]) => s.replace(`{${key}}`, String(value)), template);
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
  return getActionField(suggestion, "step_label") || getActionField(suggestion, "label") || "—";
}

function cloneSuggestion(suggestion) {
  return {
    ...suggestion,
    action: isPlainObject(suggestion.action) ? { ...suggestion.action } : {},
    binding: isPlainObject(suggestion.binding) ? { ...suggestion.binding } : {},
    original_llm_output: isPlainObject(suggestion.original_llm_output)
      ? { ...suggestion.original_llm_output }
      : suggestion.original_llm_output,
  };
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

function TagCell({ labelKey, value, t }) {
  if (!value) return null;
  return <span className={styles.suggestionTagLabeled}>{fmt(t(labelKey), { value })}</span>;
}

function SuggestionDisplayRow({
  suggestion,
  onStatusChange,
  onStartEdit,
  t,
}) {
  const status = text(suggestion.status) || "pending";
  const isRejected = status === "rejected";
  const valid = isProductActionValid(suggestion);
  const actionText = getActionField(suggestion, "action_text");

  return (
    <>
      <tr
        className={`${styles.analysisTableRow} ${isRejected ? styles.suggestionTableRowRejected : ""}`}
        data-testid={`product-action-suggestion-${suggestion.id || "row"}`}
      >
        <td>
          <div>{actionText || <span className={styles.suggestionInvalidMarker}>{t("processAnalysis.ai.invalidAction")}</span>}</div>
          {!valid ? (
            <div
              className={styles.suggestionInvalidMarker}
              title={t("processAnalysis.ai.invalidActionHint")}
            >
              {t("processAnalysis.ai.invalidAction")}
            </div>
          ) : null}
        </td>
        <td>
          <TagCell labelKey="processAnalysis.ai.tagType" value={getActionField(suggestion, "action_type")} t={t} />
        </td>
        <td>
          <TagCell labelKey="processAnalysis.ai.tagStage" value={getActionField(suggestion, "action_stage")} t={t} />
        </td>
        <td>
          <TagCell labelKey="processAnalysis.ai.tagObject" value={getActionField(suggestion, "action_object")} t={t} />
        </td>
        <td>
          <TagCell labelKey="processAnalysis.ai.tagMethod" value={getActionField(suggestion, "action_method")} t={t} />
        </td>
        <td>{stepLabel(suggestion)}</td>
        <td>
          <span
            className={`${styles.suggestionBadge} ${STATUS_BADGE_CLASS[status] || STATUS_BADGE_CLASS.pending}`}
          >
            {statusLabel(status, t)}
          </span>
        </td>
        <td className={styles.suggestionActionCell}>
          {status === "pending" ? (
            <button
              type="button"
              className="primaryBtn smallBtn"
              disabled={!valid}
              title={!valid ? t("processAnalysis.ai.approveValidOnly") : undefined}
              onClick={() => onStatusChange(suggestion.id, "approved")}
              data-testid={`suggestion-approve-${suggestion.id || "x"}`}
            >
              {t("processAnalysis.ai.approve")}
            </button>
          ) : null}
          {status === "pending" ? (
            <button
              type="button"
              className="secondaryBtn smallBtn"
              onClick={() => onStatusChange(suggestion.id, "rejected")}
              data-testid={`suggestion-reject-${suggestion.id || "x"}`}
            >
              {t("processAnalysis.ai.reject")}
            </button>
          ) : null}
          {status === "approved" ? (
            <button
              type="button"
              className="secondaryBtn smallBtn"
              onClick={() => onStatusChange(suggestion.id, "pending")}
              data-testid={`suggestion-unapprove-${suggestion.id || "x"}`}
            >
              {t("processAnalysis.ai.unapprove")}
            </button>
          ) : null}
          {status === "rejected" ? (
            <button
              type="button"
              className="secondaryBtn smallBtn"
              onClick={() => onStatusChange(suggestion.id, "pending")}
              data-testid={`suggestion-unreject-${suggestion.id || "x"}`}
            >
              {t("processAnalysis.ai.unreject")}
            </button>
          ) : null}
          <button
            type="button"
            className="secondaryBtn smallBtn"
            onClick={() => onStartEdit(suggestion.id)}
            data-testid={`suggestion-edit-${suggestion.id || "x"}`}
          >
            {t("processAnalysis.ai.edit")}
          </button>
        </td>
      </tr>
      {Array.isArray(suggestion.warnings) && suggestion.warnings.length ? (
        <tr className={styles.analysisTableRow}>
          <td colSpan={8}>
            <SuggestionWarnings warnings={suggestion.warnings} />
          </td>
        </tr>
      ) : null}
    </>
  );
}

function SuggestionEditRow({
  draft,
  stepOptions,
  onDraftChange,
  onDone,
  onCancel,
  t,
}) {
  const status = text(draft.status) || "pending";

  const setField = (key, value) => {
    const next = { ...draft, action: { ...draft.action } };
    next.action[key] = value;
    onDraftChange(next);
  };

  const setBinding = (stepId) => {
    const found = stepOptions.find((s) => String(s.id || s.step_id || s.node_id || "") === stepId);
    if (!found) return;
    const next = { ...draft, action: { ...draft.action }, binding: { ...draft.binding } };
    const sid = text(found.id || found.step_id || found.node_id);
    const nid = text(found.node_id || found.id);
    const label = text(found.label || found.title || sid);
    next.action.step_id = sid;
    next.action.step_label = label;
    next.action.node_id = nid;
    next.action.bpmn_element_id = nid;
    next.binding.step_id = sid;
    next.binding.step_label = label;
    next.binding.node_id = nid;
    next.binding.bpmn_element_id = nid;
    onDraftChange(next);
  };

  return (
    <tr className={styles.analysisTableRow}>
      <td>
        <input
          type="text"
          className={styles.analysisTableInput}
          value={getActionField(draft, "action_text")}
          onChange={(e) => setField("action_text", e.target.value)}
        />
      </td>
      <td>
        <input
          type="text"
          className={styles.analysisTableInput}
          value={getActionField(draft, "action_type")}
          onChange={(e) => setField("action_type", e.target.value)}
        />
      </td>
      <td>
        <input
          type="text"
          className={styles.analysisTableInput}
          value={getActionField(draft, "action_stage")}
          onChange={(e) => setField("action_stage", e.target.value)}
        />
      </td>
      <td>
        <input
          type="text"
          className={styles.analysisTableInput}
          value={getActionField(draft, "action_object")}
          onChange={(e) => setField("action_object", e.target.value)}
        />
      </td>
      <td>
        <input
          type="text"
          className={styles.analysisTableInput}
          value={getActionField(draft, "action_method")}
          onChange={(e) => setField("action_method", e.target.value)}
        />
      </td>
      <td>
        <select
          className={styles.analysisTableInput}
          value={getActionField(draft, "step_id") || getActionField(draft, "node_id") || ""}
          onChange={(e) => setBinding(e.target.value)}
        >
          <option value="">{t("processAnalysis.ai.stepPlaceholder")}</option>
          {stepOptions.map((s) => (
            <option key={String(s.id || s.node_id || s.step_id || Math.random())} value={String(s.id || s.node_id || s.step_id || "")}>
              {s.label || s.title || s.id || s.node_id || "—"}
            </option>
          ))}
        </select>
      </td>
      <td>
        <span className={`${styles.suggestionBadge} ${STATUS_BADGE_CLASS[status] || STATUS_BADGE_CLASS.pending}`}>
          {statusLabel(status, t)}
        </span>
      </td>
      <td className={styles.suggestionActionCell}>
        <button
          type="button"
          className="primaryBtn smallBtn"
          onClick={onDone}
          data-testid={`suggestion-done-${draft.id || "x"}`}
        >
          {t("processAnalysis.ai.done")}
        </button>
        <button
          type="button"
          className="secondaryBtn smallBtn"
          onClick={onCancel}
          data-testid={`suggestion-cancel-${draft.id || "x"}`}
        >
          {t("processAnalysis.ai.cancel")}
        </button>
      </td>
    </tr>
  );
}

function ExportDropdown({ sessionId, t }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const handleExport = async (format) => {
    setBusy(true);
    try {
      const r = await apiExportProductActions(sessionId, format);
      if (!r.ok) {
        // eslint-disable-next-line no-console
        console.error("product actions export failed", r.error);
        return;
      }
      const url = URL.createObjectURL(r.blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = r.filename || `product-actions-export.${format}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } finally {
      setBusy(false);
      setOpen(false);
    }
  };

  return (
    <div className={styles.suggestionExportDropdown}>
      <button
        type="button"
        className="secondaryBtn smallBtn"
        onClick={() => setOpen((prev) => !prev)}
        disabled={busy}
        data-testid="product-actions-export"
      >
        {busy ? t("processAnalysis.ai.exportReady") : t("processAnalysis.ai.export")} ▼
      </button>
      {open ? (
        <div className={styles.suggestionExportMenu}>
          <button type="button" className="secondaryBtn smallBtn" onClick={() => handleExport("csv")} data-testid="product-actions-export-csv">
            {t("processAnalysis.ai.exportCsv")}
          </button>
          <button type="button" className="secondaryBtn smallBtn" onClick={() => handleExport("xlsx")} data-testid="product-actions-export-xlsx">
            {t("processAnalysis.ai.exportXlsx")}
          </button>
        </div>
      ) : null}
    </div>
  );
}

export const ProductActionSuggestionsPanel = React.memo(function ProductActionSuggestionsPanel({
  sessionId,
  baseDiagramStateVersion,
  steps = [],
  t: tProp,
}) {
  const t = tProp || defaultT;
  const [suggestions, setSuggestions] = useState([]);
  const [counts, setCounts] = useState({ pending: 0, approved: 0, rejected: 0, total: 0 });
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [applying, setApplying] = useState(false);
  const [ragLoading, setRagLoading] = useState(false);
  const [error, setError] = useState(null);
  const [ragReadiness, setRagReadiness] = useState(null);
  const [editingIds, setEditingIds] = useState(new Set());
  const [editingDrafts, setEditingDrafts] = useState(new Map());

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
        setError(r.error || r.data?.detail?.message || t("processAnalysis.ai.errorTitle"));
        return;
      }
      setSuggestions(r.suggestions || []);
      setCounts(r.counts || { pending: 0, approved: 0, rejected: 0, total: 0 });
    } catch (e) {
      setError(String(e || t("processAnalysis.ai.errorTitle")));
    } finally {
      setLoading(false);
    }
  }, [sessionId, t]);

  const loadRagReadiness = useCallback(async () => {
    try {
      const r = await apiGetRagReadiness(sessionId);
      if (r.ok) setRagReadiness(r.readiness || null);
    } catch {
      // RAG status is non-blocking
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
        setError(r.error || r.message || t("processAnalysis.ai.errorTitle"));
        return;
      }
      const generated = Array.isArray(r.suggestions) ? r.suggestions : [];
      if (!generated.length) {
        setError(t("processAnalysis.ai.suggestionListEmpty"));
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
            action_text: text(action.action_text || row.action_text),
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
      setError(String(e || t("processAnalysis.ai.errorTitle")));
    } finally {
      setGenerating(false);
    }
  }, [sessionId, loadSuggestions, t]);

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
        setError(r.error || t("processAnalysis.ai.errorTitle"));
        return false;
      }
      return true;
    },
    [sessionId, t]
  );

  const handleStatusChange = useCallback(
    async (id, status) => {
      const current = suggestions.find((s) => String(s.id) === String(id));
      if (!current) return;
      const updated = { ...current, status };
      setSuggestions((prev) => prev.map((s) => (String(s.id) === String(id) ? updated : s)));
      await persistSuggestion(updated);
    },
    [suggestions, persistSuggestion]
  );

  const handleFieldChange = useCallback(
    async (id, key, value) => {
      const current = suggestions.find((s) => String(s.id) === String(id));
      if (!current) return;
      const updated = key === "__replace__" && isPlainObject(value) ? value : setActionField(current, key, value);
      setSuggestions((prev) => prev.map((s) => (String(s.id) === String(id) ? updated : s)));
      await persistSuggestion(updated);
    },
    [suggestions, persistSuggestion]
  );

  const startEdit = useCallback((id) => {
    const key = String(id);
    setEditingIds((prev) => {
      const next = new Set(prev);
      next.add(key);
      return next;
    });
    setEditingDrafts((prev) => {
      const suggestion = suggestions.find((s) => String(s.id) === key);
      if (!suggestion) return prev;
      const next = new Map(prev);
      next.set(key, cloneSuggestion(suggestion));
      return next;
    });
  }, [suggestions]);

  const cancelEdit = useCallback((id) => {
    const key = String(id);
    setEditingIds((prev) => {
      const next = new Set(prev);
      next.delete(key);
      return next;
    });
    setEditingDrafts((prev) => {
      const next = new Map(prev);
      next.delete(key);
      return next;
    });
  }, []);

  const doneEdit = useCallback(
    async (id) => {
      const key = String(id);
      const draft = editingDrafts.get(key);
      if (draft) {
        await handleFieldChange(id, "__replace__", draft);
      }
      setEditingIds((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
      setEditingDrafts((prev) => {
        const next = new Map(prev);
        next.delete(key);
        return next;
      });
    },
    [editingDrafts, handleFieldChange]
  );

  const handleBulkApproveValid = useCallback(async () => {
    const validPending = suggestions.filter((s) => {
      const status = text(s.status);
      return status !== "approved" && status !== "rejected" && isProductActionValid(s);
    });
    for (const s of validPending) {
      await handleStatusChange(s.id, "approved");
    }
  }, [suggestions, handleStatusChange]);

  const handleBulkReject = useCallback(async () => {
    const pending = suggestions.filter((s) => {
      const status = text(s.status);
      return status !== "approved" && status !== "rejected";
    });
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
        setError(r.error || r.data?.detail?.message || t("processAnalysis.ai.errorTitle"));
        return;
      }
      await loadSuggestions();
      await loadRagReadiness();
    } catch (e) {
      setError(String(e || t("processAnalysis.ai.errorTitle")));
    } finally {
      setApplying(false);
    }
  }, [sessionId, baseDiagramStateVersion, loadSuggestions, loadRagReadiness, t]);

  const handleSendToRag = useCallback(async () => {
    setRagLoading(true);
    setError(null);
    try {
      const r = await apiTransitionRagReadiness(sessionId, "queued");
      if (!r.ok) {
        setError(r.error || r.data?.detail?.message || t("processAnalysis.ai.errorTitle"));
        return;
      }
      await loadRagReadiness();
    } catch (e) {
      setError(String(e || t("processAnalysis.ai.errorTitle")));
    } finally {
      setRagLoading(false);
    }
  }, [sessionId, loadRagReadiness, t]);

  const approvedCount = counts.approved || 0;
  const pendingCount = counts.pending || 0;
  const rejectedCount = counts.rejected || 0;
  const hasSuggestions = suggestions.length > 0;
  const validPendingCount = useMemo(
    () => suggestions.filter((s) => text(s.status) !== "approved" && text(s.status) !== "rejected" && isProductActionValid(s)).length,
    [suggestions]
  );

  const actions = (
    <>
      {hasSuggestions ? (
        <>
          <button
            type="button"
            className="secondaryBtn smallBtn"
            onClick={handleBulkApproveValid}
            disabled={validPendingCount === 0}
            data-testid="product-actions-bulk-approve"
          >
            {t("processAnalysis.ai.bulkApproveValidOnly")}
          </button>
          <button
            type="button"
            className="secondaryBtn smallBtn"
            onClick={handleBulkReject}
            disabled={pendingCount === 0}
            data-testid="product-actions-bulk-reject"
          >
            {t("processAnalysis.ai.bulkReject")}
          </button>
          <ExportDropdown sessionId={sessionId} t={t} />
        </>
      ) : null}
      <button
        type="button"
        className="primaryBtn smallBtn"
        onClick={handleGenerate}
        disabled={generating || loading}
        data-testid="product-actions-generate"
      >
        {generating ? t("processAnalysis.ai.generating") : t("processAnalysis.ai.generateActions")}
      </button>
    </>
  );

  if (loading && !hasSuggestions) {
    return <AnalysisSkeleton variant="card" count={3} data-testid="product-actions-skeleton" />;
  }

  return (
    <AnalysisSection
      title={t("processAnalysis.ai.title")}
      subtitle={t("processAnalysis.ai.subtitle")}
      actions={actions}
      data-testid="product-action-suggestions-panel"
    >
      {error ? (
        <>
          <AnalysisErrorState
            title={t("processAnalysis.ai.errorTitle")}
            message={formatErrorMessage(error, t)}
            onRetry={() => {
              setError(null);
              void loadSuggestions();
            }}
            retryLabel={t("processAnalysis.ai.retry")}
            data-testid="product-actions-error"
          />
          {getErrorCode(error) ? (
            <div className={styles.analysisHint} data-testid="product-actions-error-code">
              {t("processAnalysis.ai.errorCodeLabel")} {getErrorCode(error)}
            </div>
          ) : null}
        </>
      ) : null}

      {!error && !hasSuggestions && !generating ? (
        <AnalysisEmptyState
          title={t("processAnalysis.ai.emptyTitle")}
          description={t("processAnalysis.ai.emptyDescription")}
          data-testid="product-actions-empty"
        />
      ) : null}

      {hasSuggestions ? (
        <>
          <div className={styles.suggestionStats} data-testid="product-actions-stats">
            <span>{t("processAnalysis.ai.total")}: <b>{counts.total}</b></span>
            <span className={styles.suggestionStatsPending}>{t("processAnalysis.ai.pending")}: <b>{pendingCount}</b></span>
            <span className={styles.suggestionStatsApproved}>{t("processAnalysis.ai.approved")}: <b>{approvedCount}</b></span>
            <span className={styles.suggestionStatsRejected}>{t("processAnalysis.ai.rejected")}: <b>{rejectedCount}</b></span>
          </div>

          <div className={styles.analysisTableWrap} data-testid="product-actions-list">
            <table className={styles.analysisTable}>
              <thead className={styles.analysisTableHead}>
                <tr>
                  <th>{t("processAnalysis.ai.columnAction")}</th>
                  <th>{t("processAnalysis.ai.columnType")}</th>
                  <th>{t("processAnalysis.ai.columnStage")}</th>
                  <th>{t("processAnalysis.ai.columnObject")}</th>
                  <th>{t("processAnalysis.ai.columnMethod")}</th>
                  <th>{t("processAnalysis.ai.columnBinding")}</th>
                  <th>{t("processAnalysis.ai.columnStatus")}</th>
                  <th>{t("processAnalysis.ai.columnActions")}</th>
                </tr>
              </thead>
              <tbody className={styles.analysisTableBody}>
                {suggestions.map((s) => {
                  const editing = editingIds.has(String(s.id));
                  return editing ? (
                    <SuggestionEditRow
                      key={`edit-${String(s.id || Math.random())}`}
                      draft={editingDrafts.get(String(s.id)) || s}
                      stepOptions={stepOptions}
                      onDraftChange={(draft) => {
                        setEditingDrafts((prev) => {
                          const next = new Map(prev);
                          next.set(String(s.id), draft);
                          return next;
                        });
                      }}
                      onDone={() => void doneEdit(s.id)}
                      onCancel={() => cancelEdit(s.id)}
                      t={t}
                    />
                  ) : (
                    <SuggestionDisplayRow
                      key={String(s.id || Math.random())}
                      suggestion={s}
                      onStatusChange={(id, status) => void handleStatusChange(id, status)}
                      onStartEdit={startEdit}
                      t={t}
                    />
                  );
                })}
              </tbody>
            </table>
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
                {applying
                  ? t("processAnalysis.ai.applying")
                  : fmt(t("processAnalysis.ai.applyApproved"), { count: approvedCount })}
              </button>
              <span className={styles.analysisHint}>{t("processAnalysis.ai.applyHint")}</span>
            </div>
          ) : null}
        </>
      ) : null}

      {ragReadiness ? (
        <div className={styles.suggestionRagBanner} data-testid="product-actions-rag-banner">
          <div className={styles.suggestionRagStatus}>
            <span className={styles.suggestionRagLabel}>{t("processAnalysis.ai.ragStatusLabel")}</span>
            <span className={styles.suggestionRagValue}>
              {ragStatusLabel(text(ragReadiness.rag_readiness_status), t)}
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
              {ragLoading ? t("common.loading") : t("processAnalysis.ai.ragStatus.cta")}
            </button>
          ) : null}
          {text(ragReadiness.rag_readiness_status) === "queued" ? (
            <span className={styles.analysisHint}>{t("processAnalysis.ai.ragStatus.queueHint")}</span>
          ) : null}
          {text(ragReadiness.rag_readiness_status) === "indexed" ? (
            <span className={styles.analysisHint}>
              {t("processAnalysis.ai.indexedAt")} {ragReadiness.indexed_at ? new Date(ragReadiness.indexed_at).toLocaleString("ru-RU") : "—"}
              {ragReadiness.has_unindexed_changes ? ` (${t("processAnalysis.ai.ragStatus.dirty")})` : ""}
            </span>
          ) : null}
        </div>
      ) : null}
    </AnalysisSection>
  );
});
