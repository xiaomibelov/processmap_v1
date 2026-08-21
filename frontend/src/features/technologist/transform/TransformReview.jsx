import React, { useEffect, useMemo, useRef, useState } from "react";

import { apiTransformAsis } from "../../../lib/api";
import GraphCanvas from "../graph/GraphCanvas";
import WorkflowBar from "../workflow/WorkflowBar";
import { t } from "../i18n";
import "./TransformReview.css";

const E4_HANDOFF_KEY = "fpc_e4_handoff";
const ASIS_FILE_KEY = "fpc_asis_file_handoff";

const FATE_META = {
  transformed_to: { icon: "🔁", label: "Трансформирован" },
  pushed_below: { icon: "⬇️", label: "Ниже схемы" },
  dropped: { icon: "🗑", label: "Исключён" },
  open_question: { icon: "❓", label: "Открытый вопрос" },
};

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function navigateToConstructor() {
  if (typeof window === "undefined") return;
  window.history.pushState({}, "/technologist/constructor?from=transform", "/technologist/constructor?from=transform");
  try {
    window.dispatchEvent(new PopStateEvent("popstate"));
  } catch {
    window.dispatchEvent(new Event("popstate"));
  }
}

export default function TransformReview() {
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);
  const [selectedAsisId, setSelectedAsisId] = useState("");
  const [rejectedIds, setRejectedIds] = useState(() => new Set());
  const asisRefs = useRef({});
  const draftRefs = useRef({});
  const formRef = useRef(null);

  // UX1/U1.1: handoff файла с экрана импорта — автозагрузка и автостарт
  useEffect(() => {
    try {
      const raw = window.sessionStorage?.getItem(ASIS_FILE_KEY);
      if (!raw) return;
      window.sessionStorage?.removeItem(ASIS_FILE_KEY);
      const payload = JSON.parse(raw);
      if (payload?.content) {
        const handoffFile = new File([payload.content], payload.name || "as_is.bpmn", { type: "text/xml" });
        setFile(handoffFile);
        // автостарт трансформации сразу (без клика)
        void doTransform(handoffFile);
      }
    } catch {
      // ignore storage errors
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const traceMap = useMemo(() => asArray(result?.trace_map), [result]);
  const traceById = useMemo(() => {
    const map = new Map();
    traceMap.forEach((t) => map.set(String(t?.element_id || ""), t));
    return map;
  }, [traceMap]);

  const decisions = useMemo(
    () =>
      traceMap.filter(
        (t) =>
          !["sequenceFlow", "textAnnotation"].includes(String(t?.element_type || "")) &&
          !String(t?.element_type || "").endsWith("Event") &&
          !String(t?.element_type || "").endsWith("Gateway"),
      ),
    [traceMap],
  );

  // draft с учётом reject-ов: узлы, произведённые из отклонённых решений, удаляются
  const effectiveDraft = useMemo(() => {
    const draft = result?.draft_ui_model;
    if (!draft) return null;
    const removed = new Set();
    traceMap.forEach((t) => {
      if (!rejectedIds.has(String(t?.element_id || ""))) return;
      asArray(t?.draft_node_ids).forEach((id) => removed.add(String(id)));
    });
    const nodes = asArray(draft.nodes).filter((n) => !removed.has(String(n?.id || "")));
    const nodeIds = new Set(nodes.map((n) => String(n?.id || "")));
    const flows = asArray(draft.flows).filter(
      (f) => nodeIds.has(String(f?.source_ref || "")) && nodeIds.has(String(f?.target_ref || "")),
    );
    return { ...draft, nodes, flows };
  }, [result, traceMap, rejectedIds]);

  const asIsModel = result?.as_is_ui_model || null;
  const openQuestions = asArray(result?.open_questions);
  const validationSummary = result?.validation_report?.summary || {};
  const llmStatus = String(result?.llm_status || "");

  // подсветка derived_from связей
  const selectedTrace = selectedAsisId ? traceById.get(selectedAsisId) : null;
  const selectedDraftId = useMemo(() => {
    if (!selectedTrace || !effectiveDraft) return "";
    const ids = asArray(selectedTrace.draft_node_ids).map(String);
    const remaining = new Set(asArray(effectiveDraft.nodes).map((n) => String(n?.id || "")));
    return ids.find((id) => remaining.has(id)) || "";
  }, [selectedTrace, effectiveDraft]);

  async function doTransform(targetFile) {
    if (!targetFile || loading) return;
    setLoading(true);
    setError("");
    setResult(null);
    setSelectedAsisId("");
    setRejectedIds(new Set());
    try {
      const r = await apiTransformAsis(targetFile);
      if (r?.ok) {
        setResult(r.result || {});
      } else {
        setError(String(r?.error || t("transform.failed")));
      }
    } catch (err) {
      setError(String(err?.message || err || t("transform.failed")));
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(event) {
    event.preventDefault();
    await doTransform(file);
  }

  function handleSelectAsis(elementId) {
    const id = String(elementId || "").trim();
    if (!id) return;
    setSelectedAsisId(id);
    const el = asisRefs.current[id];
    if (el && typeof el.scrollIntoView === "function") {
      el.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" });
    }
  }

  function handleSelectDraft(elementId) {
    const id = String(elementId || "").trim();
    if (!id || !effectiveDraft) return;
    const node = asArray(effectiveDraft.nodes).find((n) => String(n?.id || "") === id);
    const derived = asArray(node?.derived_from).map(String);
    if (derived[0]) handleSelectAsis(derived[0]);
  }

  function toggleDecision(elementId, accept) {
    setRejectedIds((prev) => {
      const next = new Set(prev);
      if (accept) {
        next.delete(elementId);
      } else {
        next.add(elementId);
      }
      return next;
    });
  }

  function handleOpenInConstructor() {
    if (!effectiveDraft) return;
    try {
      window.sessionStorage?.setItem(
        E4_HANDOFF_KEY,
        JSON.stringify({ ui_model: effectiveDraft, draft_entities: asArray(result?.draft_entities) }),
      );
    } catch {
      // ignore storage errors
    }
    navigateToConstructor();
  }

  return (
    <div className="transform-review">
      <WorkflowBar current="transform" />
      <h1 className="transform-review__title">{t("transform.title")}</h1>

      <form className="transform-review__form" onSubmit={handleSubmit} ref={formRef}>
        <label className="transform-review__file-btn" data-testid="file-choose">
          {file ? file.name : t("import.choose")}
          <input
            type="file"
            accept=".bpmn,.xml"
            hidden
            onChange={(e) => setFile(e.target.files?.[0] || null)}
            aria-label="BPMN-файл AS IS"
          />
        </label>
        <button type="submit" disabled={!file || loading}>
          {loading ? t("transform.loading") : t("transform.submit")}
        </button>
      </form>

      {error ? <div className="transform-review__error" role="alert">{error}</div> : null}

      {result ? (
        <>
          <div className="transform-review__summary" data-testid="transform-summary">
            <span>{t("transform.draftNodes")} {asArray(effectiveDraft?.nodes).length}</span>
            <span>{t("import.flows")} {asArray(effectiveDraft?.flows).length}</span>
            <span className="transform-review__summary-item--errors">
              {t("transform.validatorErrors")} {Number(validationSummary.errors) || 0}
            </span>
            <span className="transform-review__summary-item--warnings">
              {t("import.warnings")} {Number(validationSummary.warnings) || 0}
            </span>
            <span>LLM: {llmStatus || "n/a"}</span>
            <button type="button" className="transform-review__to-constructor" onClick={handleOpenInConstructor}>
              {t("transform.toConstructor")}
            </button>
          </div>

          <div className="transform-review__graphs">
            <section className="transform-review__pane">
              <h2>AS IS</h2>
              <GraphCanvas
                uiModel={asIsModel}
                selectedElementId={selectedAsisId}
                onSelectNode={handleSelectAsis}
                nodeRefs={asisRefs}
                ariaLabel={t("transform.asIsAria")}
              />
            </section>
            <section className="transform-review__pane">
              <h2>{t("transform.toBeDraft")}</h2>
              <GraphCanvas
                uiModel={effectiveDraft}
                selectedElementId={selectedDraftId}
                onSelectNode={handleSelectDraft}
                nodeRefs={draftRefs}
                ariaLabel={t("transform.toBeAria")}
              />
            </section>
          </div>

          <div className="transform-review__bottom">
            <section className="transform-review__decisions">
              <h2>{t("transform.decisions")}</h2>
              <ul className="transform-review__decision-list">
                {decisions.map((tr) => {
                  const id = String(tr?.element_id || "");
                  const fate = String(tr?.fate || "");
                  const meta = FATE_META[fate] || { icon: "•", label: fate };
                  const rejected = rejectedIds.has(id);
                  return (
                    <li
                      key={id}
                      className={`transform-review__decision${rejected ? " transform-review__decision--rejected" : ""}${
                        id === selectedAsisId ? " transform-review__decision--selected" : ""
                      }`}
                      data-element-id={id}
                    >
                      <button type="button" className="transform-review__decision-main" onClick={() => handleSelectAsis(id)}>
                        <span className="transform-review__decision-icon" title={meta.label}>{meta.icon}</span>
                        <span className="transform-review__decision-name">{String(tr?.name || id)}</span>
                        <span className="transform-review__decision-rule">{String(tr?.rule_id || "—")}</span>
                        <span className="transform-review__decision-note">{String(tr?.note || "")}</span>
                      </button>
                      <span className="transform-review__decision-actions">
                        <button
                          type="button"
                          className="transform-review__accept"
                          disabled={!rejected}
                          onClick={() => toggleDecision(id, true)}
                        >
                          {t("transform.accept")}
                        </button>
                        <button
                          type="button"
                          className="transform-review__reject"
                          disabled={rejected}
                          onClick={() => toggleDecision(id, false)}
                        >
                          {t("transform.reject")}
                        </button>
                      </span>
                    </li>
                  );
                })}
              </ul>
            </section>

            <section className="transform-review__questions">
              <h2>{t("transform.openQuestions")} ({openQuestions.length})</h2>
              {openQuestions.length === 0 ? (
                <div className="transform-review__empty">{t("transform.noQuestions")}</div>
              ) : (
                <ul className="transform-review__question-list">
                  {openQuestions.map((q) => (
                    <li key={String(q?.id || q?.question)} className="transform-review__question">
                      <span className="transform-review__question-id">{String(q?.id || "")}</span>
                      <span className="transform-review__question-text">{String(q?.question || "")}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        </>
      ) : null}
    </div>
  );
}
