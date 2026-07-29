import React, { useMemo, useRef, useState } from "react";

import { apiImportBpmn } from "../../../lib/api";
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

function computeViewBox(nodes) {
  const pad = 40;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  nodes.forEach((n) => {
    const x = Number(n?.x) || 0;
    const y = Number(n?.y) || 0;
    const w = Number(n?.width) || 100;
    const h = Number(n?.height) || 60;
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x + w);
    maxY = Math.max(maxY, y + h);
  });
  if (!Number.isFinite(minX)) {
    minX = 0; minY = 0; maxX = 400; maxY = 200;
  }
  return `${minX - pad} ${minY - pad} ${Math.max(maxX - minX + pad * 2, 100)} ${Math.max(maxY - minY + pad * 2, 100)}`;
}

function nodeCenter(node) {
  const x = Number(node?.x) || 0;
  const y = Number(node?.y) || 0;
  const w = Number(node?.width) || 100;
  const h = Number(node?.height) || 60;
  return { cx: x + w / 2, cy: y + h / 2, x, y, w, h };
}

function flowPoints(source, target) {
  const s = nodeCenter(source);
  const t = nodeCenter(target);
  const sx = s.x + s.w;
  const sy = s.cy;
  const tx = t.x;
  const ty = t.cy;
  const midX = sx + Math.max((tx - sx) / 2, 24);
  return `${sx},${sy} ${midX},${sy} ${midX},${ty} ${tx},${ty}`;
}

export default function ImportBpmn() {
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);
  const [selectedElementId, setSelectedElementId] = useState("");
  const nodeRefs = useRef({});

  const parsed = useMemo(() => (result ? normalizeResult(result) : null), [result]);
  const viewBox = useMemo(() => (parsed ? computeViewBox(parsed.uiModel.nodes) : "0 0 400 200"), [parsed]);
  const nodesById = useMemo(() => {
    const map = new Map();
    (parsed?.uiModel.nodes || []).forEach((n) => map.set(String(n?.id || ""), n));
    return map;
  }, [parsed]);

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
        setError(String(r?.error || "Ошибка импорта"));
      }
    } catch (err) {
      setError(String(err?.message || err || "Ошибка импорта"));
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
      <h1 className="import-bpmn__title">Импорт BPMN-шаблона</h1>

      <form className="import-bpmn__form" onSubmit={handleSubmit}>
        <input
          type="file"
          accept=".bpmn,.xml"
          onChange={(e) => setFile(e.target.files?.[0] || null)}
          aria-label="BPMN-файл"
        />
        <button type="submit" disabled={!file || loading}>
          {loading ? "Импорт..." : "Импортировать"}
        </button>
      </form>

      {error ? <div className="import-bpmn__error" role="alert">{error}</div> : null}

      {parsed ? (
        <>
          <div className="import-bpmn__summary" data-testid="import-summary">
            <span className="import-bpmn__summary-item">узлов {parsed.summary.nodes}</span>
            <span className="import-bpmn__summary-item">потоков {parsed.summary.flows}</span>
            <span className="import-bpmn__summary-item import-bpmn__summary-item--errors">
              ошибок {parsed.summary.errors}
            </span>
            <span className="import-bpmn__summary-item import-bpmn__summary-item--warnings">
              предупреждений {parsed.summary.warnings}
            </span>
          </div>

          <div className="import-bpmn__content">
            <section className="import-bpmn__preview">
              <h2>Предпросмотр графа</h2>
              <svg
                className="import-bpmn__svg"
                viewBox={viewBox}
                role="img"
                aria-label="Предпросмотр графа процесса"
              >
                <defs>
                  <marker
                    id="import-bpmn-arrow"
                    viewBox="0 0 10 10"
                    refX="9"
                    refY="5"
                    markerWidth="8"
                    markerHeight="8"
                    orient="auto-start-reverse"
                  >
                    <path d="M 0 0 L 10 5 L 0 10 z" fill="#555" />
                  </marker>
                </defs>
                {parsed.uiModel.flows.map((flow) => {
                  const source = nodesById.get(String(flow?.source_ref || ""));
                  const target = nodesById.get(String(flow?.target_ref || ""));
                  if (!source || !target) return null;
                  return (
                    <polyline
                      key={String(flow?.id || `${flow?.source_ref}->${flow?.target_ref}`)}
                      points={flowPoints(source, target)}
                      fill="none"
                      stroke="#555"
                      strokeWidth="1.5"
                      markerEnd="url(#import-bpmn-arrow)"
                    />
                  );
                })}
                {parsed.uiModel.nodes.map((node) => {
                  const id = String(node?.id || "");
                  const { x, y, w, h, cx, cy } = nodeCenter(node);
                  const label = String(node?.display_name || node?.name || id || "").trim();
                  const selected = id && id === selectedElementId;
                  return (
                    <g
                      key={id || `${x}_${y}`}
                      ref={(el) => { if (id) nodeRefs.current[id] = el; }}
                      data-element-id={id}
                      data-selected={selected ? "true" : "false"}
                      className={`import-bpmn__node${selected ? " import-bpmn__node--selected" : ""}`}
                      onClick={() => id && setSelectedElementId(id)}
                    >
                      <rect x={x} y={y} width={w} height={h} rx={6} />
                      <text x={cx} y={cy} textAnchor="middle" dominantBaseline="middle">
                        {label}
                      </text>
                    </g>
                  );
                })}
              </svg>
            </section>

            <section className="import-bpmn__findings">
              <h2>Замечания</h2>
              {parsed.report.findings.length === 0 ? (
                <div className="import-bpmn__empty">Замечаний нет</div>
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
                            <span className="import-bpmn__finding-icon" title={meta.label}>{meta.icon}</span>
                            <span className="import-bpmn__finding-code">{String(finding?.code || "")}</span>
                            {finding?.element_name ? (
                              <span className="import-bpmn__finding-element">{String(finding.element_name)}</span>
                            ) : null}
                          </span>
                          <span className="import-bpmn__finding-message">{String(finding?.message || "")}</span>
                          {finding?.recommendation ? (
                            <span className="import-bpmn__finding-recommendation">
                              Рекомендация: {String(finding.recommendation)}
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
              <h2>Черновые сущности</h2>
              <table className="import-bpmn__drafts-table">
                <thead>
                  <tr>
                    <th>Ссылка (ref)</th>
                    <th>Категория (предположение)</th>
                    <th>Используется в</th>
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
