import React, { useMemo, useRef, useState } from "react";

import { apiImportBpmn } from "../../../lib/api";
import GraphCanvas from "../graph/GraphCanvas";
import { t, tf } from "../i18n";
import "./ImportBpmn.css";

const SEVERITY_META = {
  error: { icon: "⛔", label: "Ошибка", className: "import-bpmn__finding--error" },
  warning: { icon: "⚠️", label: "Предупреждение", className: "import-bpmn__finding--warning" },
};

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeResult(raw) {
  const src = raw && typeof raw === "object" ? raw : {};
  const uiModel = src.ui_model && typeof src.ui_model === "object" ? src.ui_model : {};
  const report = src.report && typeof src.report === "object" ? src.report : {};
  const summary = report.summary && typeof report.summary === "object" ? report.summary : {};
  const nodes = asArray(uiModel.nodes);
  const flows = asArray(uiModel.flows);
  const findings = asArray(report.findings);
  return {
    uiModel: { ...uiModel, nodes, flows },
    report: { ...report, summary, findings },
    summary: {
      nodes: Number.isFinite(Number(summary.nodes)) ? Number(summary.nodes) : nodes.length,
      flows: Number.isFinite(Number(summary.flows)) ? Number(summary.flows) : flows.length,
      errors: Number(summary.errors) || findings.filter((f) => f?.severity === "error").length,
      warnings: Number(summary.warnings) || findings.filter((f) => f?.severity === "warning").length,
    },
    draftEntities: asArray(src.draft_entities),
  };
}

export const E4_HANDOFF_KEY = "fpc_e4_handoff";

function navigateToConstructor() {
  if (typeof window === "undefined") return;
  window.history.pushState({}, "/technologist/constructor?from=import", "/technologist/constructor?from=import");
  try {
    window.dispatchEvent(new PopStateEvent("popstate"));
  } catch {
    window.dispatchEvent(new Event("popstate"));
  }
}

export default function ImportBpmn() {
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);
  const [selectedElementId, setSelectedElementId] = useState("");
  const nodeRefs = useRef({});

  const parsed = useMemo(() => (result ? normalizeResult(result) : null), [result]);

  function handleOpenInConstructor() {
    if (!parsed) return;
    try {
      window.sessionStorage?.setItem(
        E4_HANDOFF_KEY,
        JSON.stringify({ ui_model: parsed.uiModel, draft_entities: parsed.draftEntities }),
      );
    } catch {
      // ignore storage errors
    }
    navigateToConstructor();
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (!file || loading) return;
    setLoading(true);
    setError("");
    setResult(null);
    setSelectedElementId("");
    try {
      const r = await apiImportBpmn(file);
      if (r?.ok) {
        setResult(r.result || {});
      } else {
        setError(String(r?.error || t("import.failed")));
      }
    } catch (err) {
      setError(String(err?.message || err || t("import.failed")));
    } finally {
      setLoading(false);
    }
  }

  function handleSelectElement(elementId) {
    const id = String(elementId || "").trim();
    if (!id) return;
    setSelectedElementId(id);
    const el = nodeRefs.current[id];
    if (el && typeof el.scrollIntoView === "function") {
      el.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" });
    }
  }

  return (
    <div className="import-bpmn">
      <h1 className="import-bpmn__title">{t("import.title")}</h1>

      <form className="import-bpmn__form" onSubmit={handleSubmit}>
        <label className="import-bpmn__file-btn" data-testid="file-choose">
          {file ? file.name : t("import.choose")}
          <input
            type="file"
            accept=".bpmn,.xml"
            hidden
            onChange={(e) => setFile(e.target.files?.[0] || null)}
            aria-label="BPMN-файл"
          />
        </label>
        <button type="submit" disabled={!file || loading}>
          {loading ? t("import.loading") : t("import.submit")}
        </button>
      </form>

      {error ? <div className="import-bpmn__error" role="alert">{error}</div> : null}

      {parsed ? (
        <>
          <div className="import-bpmn__summary" data-testid="import-summary">
            <span className="import-bpmn__summary-item">{t("import.nodes")} {parsed.summary.nodes}</span>
            <span className="import-bpmn__summary-item">{t("import.flows")} {parsed.summary.flows}</span>
            <span className="import-bpmn__summary-item import-bpmn__summary-item--errors">
              {t("import.errors")} {parsed.summary.errors}
            </span>
            <span className="import-bpmn__summary-item import-bpmn__summary-item--warnings">
              {t("import.warnings")} {parsed.summary.warnings}
            </span>
          </div>

          <div className="import-bpmn__content">
            <section className="import-bpmn__preview">
              <h2>{t("import.preview")}</h2>
              <div className="import-bpmn__preview-actions">
                <button
                  type="button"
                  className="import-bpmn__to-constructor"
                  onClick={handleOpenInConstructor}
                >
                  {t("import.toConstructor")}
                </button>
              </div>
              <GraphCanvas
                uiModel={parsed.uiModel}
                selectedElementId={selectedElementId}
                onSelectNode={setSelectedElementId}
                nodeRefs={nodeRefs}
                ariaLabel={t("import.previewAria")}
              />
            </section>

            <section className="import-bpmn__findings">
              <h2>{t("import.findings")}</h2>
              {parsed.report.findings.length === 0 ? (
                <div className="import-bpmn__empty">{t("import.findingsEmpty")}</div>
              ) : (
                <ul className="import-bpmn__findings-list">
                  {parsed.report.findings.map((finding, idx) => {
                    const meta = SEVERITY_META[String(finding?.severity || "")] || {
                      icon: "ℹ️",
                      label: "Инфо",
                      className: "import-bpmn__finding--info",
                    };
                    const elementId = String(finding?.element_id || "");
                    return (
                      <li key={`${String(finding?.code || "finding")}_${idx}`}>
                        <button
                          type="button"
                          className={`import-bpmn__finding ${meta.className}`}
                          data-element-id={elementId}
                          onClick={() => handleSelectElement(elementId)}
                        >
                          <span className="import-bpmn__finding-head">
                            <span className="import-bpmn__finding-icon" title={meta.icon ? meta.label : meta.label}>{meta.icon}</span>
                            {finding?.element_name ? (
                              <span className="import-bpmn__finding-element">{String(finding.element_name)}</span>
                            ) : null}
                          </span>
                          <span className="import-bpmn__finding-message">{String(finding?.message || "")}</span>
                          {/* L10N (критерий 4): код — мелким после message */}
                          <span className="import-bpmn__finding-code" title={String(finding?.code || "")}>
                            {String(finding?.code || "")}
                          </span>
                          {finding?.recommendation ? (
                            <span className="import-bpmn__finding-recommendation">
                              {tf("check.recommendation", { text: String(finding.recommendation) })}
                            </span>
                          ) : null}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          </div>

          {parsed.draftEntities.length > 0 ? (
            <section className="import-bpmn__drafts">
              <h2>{t("import.draftEntities")}</h2>
              <table className="import-bpmn__drafts-table">
                <thead>
                  <tr>
                    <th>{t("import.draftRef")}</th>
                    <th>{t("import.draftCategory")}</th>
                    <th>{t("import.draftUsedBy")}</th>
                  </tr>
                </thead>
                <tbody>
                  {parsed.draftEntities.map((draft, idx) => (
                    <tr key={`${String(draft?.ref || "draft")}_${idx}`}>
                      <td>{String(draft?.ref || "")}</td>
                      <td>{String(draft?.guessed_category || "")}</td>
                      <td>{asArray(draft?.used_by).map(String).join(", ")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
