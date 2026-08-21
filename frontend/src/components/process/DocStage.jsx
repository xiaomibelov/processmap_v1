import { Fragment, useEffect, useMemo, useState } from "react";
import { computeDodSnapshotFromDraft } from "../../features/process/dod/computeDodSnapshot";
import { buildSessionDocMarkdown } from "../../features/process/lib/docMarkdown";
import { copyText } from "../../features/process/lib/markdownPreview";

function toText(value) {
  return String(value || "").trim();
}

function asObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function toArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeTier(value) {
  const tier = toText(value).toUpperCase();
  if (tier === "P0" || tier === "P1" || tier === "P2") return tier;
  return "None";
}

function normalizeRtier(value) {
  const tier = toText(value).toUpperCase();
  if (tier === "R0" || tier === "R1" || tier === "R2") return tier;
  if (tier.startsWith("R2.")) return tier;
  return "";
}

function secToLabel(secRaw) {
  const sec = Number(secRaw);
  if (!Number.isFinite(sec) || sec <= 0) return "не задано";
  if (sec < 60) return `${Math.round(sec)} сек`;
  if (sec < 3600) {
    const m = Math.floor(sec / 60);
    const s = Math.round(sec % 60);
    return s > 0 ? `${m} мин ${s} сек` : `${m} мин`;
  }
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return m > 0 ? `${h} ч ${m} мин` : `${h} ч`;
}

function percent(value, total) {
  const v = Number(value);
  const t = Number(total);
  if (!Number.isFinite(v) || !Number.isFinite(t) || t <= 0) return 0;
  return Math.round((v / t) * 100);
}

function prevNextPills(rows) {
  const list = toArray(rows);
  if (!list.length) return <span className="docMuted">—</span>;
  return (
    <div className="docPills">
      {list.map((item, idx) => {
        const node = toText(item?.title || item?.nodeId || "—");
        const label = toText(item?.label);
        const tier = normalizeTier(item?.tier);
        return (
          <span
            key={`flow_pill_${idx + 1}_${toText(item?.flowId) || node}`}
            className={`docPill tier-${tier.toLowerCase()}`}
            title={`flow=${toText(item?.flowId) || "—"}${label ? ` · ${label}` : ""}${toText(item?.nodeId) ? ` · node=${toText(item?.nodeId)}` : ""}`}
          >
            {node}
          </span>
        );
      })}
    </div>
  );
}

function buildVariantTabs(snapshot) {
  const variants = toArray(snapshot?.r_variants);
  if (!variants.length) return ["R0", "R1", "R2"];
  const keys = variants
    .map((variant) => normalizeRtier(variant?.key))
    .filter(Boolean);
  const uniq = [];
  keys.forEach((key) => {
    if (!uniq.includes(key)) uniq.push(key);
  });
  uniq.sort((a, b) => {
    const rank = (key) => {
      if (key === "R0") return 1;
      if (key === "R1") return 2;
      if (key === "R2") return 3;
      if (key.startsWith("R2.")) return 4;
      return 9;
    };
    const ar = rank(a);
    const br = rank(b);
    if (ar !== br) return ar - br;
    return a.localeCompare(b, "ru");
  });
  return uniq;
}

function pickVariantByTab(snapshot, variantTab) {
  const variants = toArray(snapshot?.r_variants);
  const target = normalizeRtier(variantTab);
  if (!target) return null;
  const exact = variants.find((variant) => normalizeRtier(variant?.key) === target);
  if (exact) return exact;
  if (target === "R2") {
    return variants.find((variant) => normalizeRtier(variant?.key).startsWith("R2")) || null;
  }
  return null;
}

function buildVariantRows(snapshot, variant) {
  const graphNodes = toArray(asObject(snapshot?.graph).nodes);
  const titleByNodeId = {};
  graphNodes.forEach((node) => {
    const nodeId = toText(node?.nodeId);
    if (!nodeId) return;
    titleByNodeId[nodeId] = toText(node?.nodeName || nodeId) || nodeId;
  });
  const edges = toArray(variant?.edges);
  return edges.map((edge, idx) => {
    const fromId = toText(edge?.from);
    const toId = toText(edge?.to);
    return {
      key: `variant_row_${toText(variant?.key)}_${idx + 1}`,
      idx: idx + 1,
      fromId,
      toId,
      fromTitle: titleByNodeId[fromId] || fromId || "Старт процесса",
      stepTitle: titleByNodeId[fromId] || fromId || "—",
      flowId: toText(edge?.flowId),
      condition: toText(edge?.label),
      toTitle: titleByNodeId[toId] || toId || "Финиш процесса",
      rtier: normalizeRtier(edge?.rtier) || normalizeRtier(variant?.key) || "—",
    };
  });
}

function buildReportSummary(snapshot) {
  const steps = toArray(snapshot?.steps);
  const totalChecks = steps.reduce((sum, step) => sum + Number(step?.dod?.total || 0), 0);
  const doneChecks = steps.reduce((sum, step) => sum + Number(step?.dod?.done || 0), 0);
  return {
    dodCoveragePct: percent(doneChecks, totalChecks),
    dodMissing: Math.max(0, totalChecks - doneChecks),
    processTime: secToLabel(asObject(snapshot?.time).processTotalSec),
    sourceText: `Источник данных: ${toText(asObject(snapshot?.meta).version) || "DoDSnapshot.v1"} · ${toText(asObject(snapshot?.meta).generatedAtIso) || "—"}`,
  };
}

function downloadMarkdown(markdown, processTitle) {
  if (typeof window === "undefined") return;
  const name = toText(processTitle).replace(/[^\p{L}\p{N}_-]+/gu, "_") || "process";
  const blob = new Blob([markdown], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${name}.md`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function DocStage({
  sessionId,
  draft,
  qualityErrorCount = 0,
  onRecalculateRtiers,
  onClose,
}) {
  const [mode, setMode] = useState("report");
  const [copyState, setCopyState] = useState("idle");
  const [exportOpen, setExportOpen] = useState(false);
  const [tierTab, setTierTab] = useState("R0");
  const [laneFilter, setLaneFilter] = useState("all");
  const [density, setDensity] = useState("comfortable");
  const [expandedStepKey, setExpandedStepKey] = useState("");
  const [rtierBusy, setRtierBusy] = useState(false);
  const [rtierMessage, setRtierMessage] = useState("");

  const snapshot = useMemo(
    () =>
      computeDodSnapshotFromDraft({
        draft,
        bpmnXml: toText(asObject(draft)?.bpmn_xml || asObject(draft)?.bpmnXml),
        uiState: {
          sessionId: toText(sessionId || asObject(draft)?.id || asObject(draft)?.session_id),
          sessionTitle: toText(asObject(draft)?.title || asObject(draft)?.name),
          processTitle: toText(asObject(draft)?.title || asObject(draft)?.name),
          version: "DoDSnapshot.v1",
          mode: "doc_report",
        },
      }),
    [sessionId, draft],
  );

  const markdown = useMemo(
    () => buildSessionDocMarkdown({ sessionId, draft, includeTechnical: true, snapshot }),
    [sessionId, draft, snapshot],
  );

  const meta = asObject(snapshot?.meta);
  const counts = asObject(snapshot?.counts);
  const bpmn = asObject(counts?.bpmn);
  const interview = asObject(counts?.interview);
  const tiers = asObject(counts?.tiers);
  const quality = asObject(snapshot?.quality);
  const lanes = toArray(snapshot?.lanes);
  const allSteps = toArray(snapshot?.steps);
  const processTitle = toText(meta?.processTitle || meta?.sessionTitle) || "Без названия";
  const summary = buildReportSummary(snapshot);

  const variantTabs = useMemo(() => buildVariantTabs(snapshot), [snapshot]);
  const selectedVariant = useMemo(() => pickVariantByTab(snapshot, tierTab), [snapshot, tierTab]);
  const scenarioRows = useMemo(() => buildVariantRows(snapshot, selectedVariant), [snapshot, selectedVariant]);
  const variantSummary = asObject(selectedVariant?.summary);
  const rtiersMeta = asObject(snapshot?.r_tiers);
  const rVariantCounts = useMemo(() => {
    const counts = { R0: 0, R1: 0, R2: 0 };
    toArray(snapshot?.r_variants).forEach((variant) => {
      const key = normalizeRtier(variant?.key);
      if (key === "R0") counts.R0 += 1;
      else if (key === "R1") counts.R1 += 1;
      else if (key === "R2" || key.startsWith("R2.")) counts.R2 += 1;
    });
    return counts;
  }, [snapshot]);

  useEffect(() => {
    if (!variantTabs.length) return;
    if (variantTabs.includes(tierTab)) return;
    setTierTab(variantTabs[0]);
  }, [variantTabs, tierTab]);

  const filteredSteps = useMemo(() => {
    if (laneFilter === "all") return allSteps;
    return allSteps.filter((step) => toText(step?.laneId) === laneFilter);
  }, [allSteps, laneFilter]);

  const qualityErrors = useMemo(
    () => toArray(quality?.items).filter((item) => toText(item?.level) === "error"),
    [quality],
  );
  const qualityWarnings = useMemo(
    () => toArray(quality?.items).filter((item) => toText(item?.level) === "warn"),
    [quality],
  );

  useEffect(() => {
    if (copyState === "idle") return undefined;
    const timer = window.setTimeout(() => setCopyState("idle"), 1800);
    return () => window.clearTimeout(timer);
  }, [copyState]);

  useEffect(() => {
    if (!exportOpen) return undefined;
    function onDocClick(event) {
      if (event?.target instanceof Element && event.target.closest(".docExportMenuWrap")) return;
      setExportOpen(false);
    }
    document.addEventListener("click", onDocClick);
    return () => document.removeEventListener("click", onDocClick);
  }, [exportOpen]);

  async function handleCopyMarkdown() {
    const errors = Number(qualityErrorCount || 0);
    if (errors > 0) {
      const proceed = window.confirm(
        [
          `Обнаружены критичные ошибки качества: ${errors}.`,
          "Рекомендуется исправить их перед экспортом документа.",
          "Продолжить экспорт DOC?",
        ].join("\n"),
      );
      if (!proceed) return;
    }
    const ok = await copyText(markdown);
    setCopyState(ok ? "copied" : "failed");
  }

  async function handleRecalculateRtiers() {
    if (typeof onRecalculateRtiers !== "function" || rtierBusy) return;
    setRtierBusy(true);
    setRtierMessage("");
    try {
      const result = await onRecalculateRtiers();
      if (result?.ok) {
        setRtierMessage("R-tier пересчитан и сохранён в bpmn_meta.flow_meta.");
      } else {
        setRtierMessage(toText(result?.error) || "Не удалось пересчитать R-tier.");
      }
    } catch (error) {
      setRtierMessage(toText(error) || "Не удалось пересчитать R-tier.");
    } finally {
      setRtierBusy(false);
    }
  }

  const toc = [
    { id: "doc-scenarios", label: "Сценарии прохождения" },
    { id: "doc-actors", label: "Акторы" },
    { id: "doc-nodes", label: "Узлы BPMN" },
    { id: "doc-flows", label: "Переходы" },
    { id: "doc-steps", label: "Шаги (From → Step → To)" },
    { id: "doc-quality", label: "Quality / Ошибки" },
    { id: "doc-tech", label: "Технические сведения" },
  ];

  return (
    <section className="docStage" data-testid="doc-stage">
      <div className="docToolbar">
        <div className="docToolbarTitle">
          <div className="docToolbarHeading">Документ процесса</div>
          <div className="docToolbarSubTitle">{processTitle}</div>
        </div>
        <div className="docToolbarActions">
          <div className="docSegmented">
            <button
              type="button"
              className={`docSegmentBtn ${mode === "report" ? "isActive" : ""}`}
              onClick={() => setMode("report")}
            >
              Просмотр
            </button>
            <button
              type="button"
              className={`docSegmentBtn ${mode === "raw" ? "isActive" : ""}`}
              onClick={() => setMode("raw")}
            >
              Markdown
            </button>
          </div>
          <button type="button" className="primaryBtn h-9 px-3 text-xs" onClick={handleCopyMarkdown} data-testid="doc-export-copy">
            Копировать Markdown
          </button>
          <div className="docExportMenuWrap">
            <button type="button" className="secondaryBtn h-9 px-3 text-xs" onClick={() => setExportOpen((v) => !v)}>
              Экспорт ···
            </button>
            {exportOpen ? (
              <div className="docExportMenu">
                <button type="button" className="docExportItem" onClick={() => downloadMarkdown(markdown, processTitle)}>
                  Скачать .md
                </button>
                <button type="button" className="docExportItem" disabled>PDF (скоро)</button>
                <button type="button" className="docExportItem" disabled>HTML (скоро)</button>
              </div>
            ) : null}
          </div>
          <button type="button" className="secondaryBtn h-9 px-3 text-xs" onClick={() => onClose?.()}>
            Закрыть
          </button>
        </div>
      </div>

      {copyState === "copied" ? <div className="docNotice ok">Исходный Markdown скопирован</div> : null}
      {copyState === "failed" ? <div className="docNotice err">Не удалось скопировать</div> : null}

      {mode === "report" ? (
        <div className="docPreview">
          <div className="docHero">
            <div className="docHeroTitle">{processTitle}</div>
            <div className="docHeroMeta">{summary.sourceText}</div>
            <div className="docCardsGrid cols-3">
              <button type="button" className="docCard metric" onClick={() => setTierTab("R0")}>
                <div className="docCardLabel">Варианты прохождения</div>
                <div className="docCardValue">R0 {Number(rVariantCounts?.R0 || 0)} · R1 {Number(rVariantCounts?.R1 || 0)} · R2 {Number(rVariantCounts?.R2 || 0)}</div>
              </button>
              <div className="docCard metric">
                <div className="docCardLabel">Время процесса</div>
                <div className="docCardValue">{summary.processTime}</div>
              </div>
              <div className="docCard metric">
                <div className="docCardLabel">DoD покрытие</div>
                <div className="docCardValue">{summary.dodCoveragePct}%</div>
                <div className="docCardHint">missing: {summary.dodMissing}</div>
              </div>
            </div>
            <div className="docCardsGrid cols-4">
              <div className="docCard"><div className="docCardLabel">Узлы</div><div className="docCardValue">{Number(bpmn?.nodesTotal || 0)}</div></div>
              <div className="docCard"><div className="docCardLabel">Переходы</div><div className="docCardValue">{Number(bpmn?.flowsTotal || 0)}</div></div>
              <div className="docCard"><div className="docCardLabel">Аннотации</div><div className="docCardValue">{Number(bpmn?.annotationsTotal || 0)}</div></div>
              <div className="docCard"><div className="docCardLabel">Subprocess</div><div className="docCardValue">{Number(bpmn?.subprocessNodesTotal || 0)}</div></div>
            </div>
            <div className="docCardsGrid cols-4">
              <div className="docCard"><div className="docCardLabel">Шаги</div><div className="docCardValue">{Number(interview?.stepsTotal || 0)}</div></div>
              <div className="docCard"><div className="docCardLabel">Привязано к BPMN</div><div className="docCardValue">{Number(interview?.stepsBoundToBpmn || 0)}</div></div>
              <div className="docCard"><div className="docCardLabel">Notes</div><div className="docCardValue">{Number(interview?.notesByElementTotal || 0)}</div></div>
              <div className="docCard"><div className="docCardLabel">AI вопросы</div><div className="docCardValue">{Number(interview?.aiQuestionsTotal || 0)}</div></div>
            </div>
          </div>

          <div className="docReportLayout">
            <aside className="docToc">
              <div className="docSectionTitle">Оглавление</div>
              <nav>
                {toc.map((item) => (
                  <a key={item.id} className="docTocLink" href={`#${item.id}`}>{item.label}</a>
                ))}
              </nav>
            </aside>

            <div className="docReportContent">
              <section id="doc-scenarios" className="docSection">
                <h3 className="docSectionTitle">Варианты прохождения процесса</h3>
                <div className="docTabs">
                  {variantTabs.map((tier) => (
                    <button
                      key={tier}
                      type="button"
                      className={`docTab ${tierTab === tier ? "isActive" : ""}`}
                      onClick={() => setTierTab(tier)}
                    >
                      {tier}
                    </button>
                  ))}
                </div>
                {typeof onRecalculateRtiers === "function" ? (
                  <div className="docScenarioSummary">
                    <button
                      type="button"
                      className="secondaryBtn h-8 px-2 text-xs"
                      onClick={handleRecalculateRtiers}
                      disabled={rtierBusy}
                    >
                      {rtierBusy ? "Пересчитываю…" : "Пересчитать R0/R1/R2"}
                    </button>
                  </div>
                ) : null}
                {toText(rtiersMeta?.warning) ? (
                  <div className="docNotice err">
                    {toText(rtiersMeta?.warning)}
                  </div>
                ) : null}
                {rtierMessage ? <div className="docNotice ok">{rtierMessage}</div> : null}
                <div className="docScenarioSummary">
                  <span className="badge">rows: {scenarioRows.length}</span>
                  <span className="badge">steps: {Number(variantSummary?.stepsCount || toArray(selectedVariant?.steps).length || 0)}</span>
                  <span className="badge">time: {secToLabel(variantSummary?.totalTimeSec)}</span>
                  <span className="badge">DoD: {Number(variantSummary?.dodPct || 0)}%</span>
                  <span className="badge">stop: {toText(selectedVariant?.stopReason || "—")}</span>
                </div>
                <div className="docTableWrap">
                  <table className="docTable">
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>Откуда</th>
                        <th>Flow</th>
                        <th>Условие</th>
                        <th>Шаг</th>
                        <th>Куда</th>
                        <th>R-tier</th>
                      </tr>
                    </thead>
                    <tbody>
                      {!scenarioRows.length ? (
                        <tr><td colSpan={7} className="docMuted">Для {tierTab} нет строк сценария.</td></tr>
                      ) : scenarioRows.map((row) => (
                        <tr key={row.key}>
                          <td>{row.idx}</td>
                          <td>{row.fromTitle}</td>
                          <td>{row.flowId || "—"}</td>
                          <td>{row.condition || "—"}</td>
                          <td>{row.stepTitle}</td>
                          <td>{row.toTitle}</td>
                          <td>{row.rtier}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>

              <section id="doc-actors" className="docSection">
                <h3 className="docSectionTitle">Акторы / Лайны</h3>
                <div className="docTableWrap">
                  <table className="docTable">
                    <thead>
                      <tr>
                        <th>Lane</th>
                        <th>steps</th>
                        <th>time</th>
                        <th>nodes</th>
                        <th>notes</th>
                        <th>ai</th>
                      </tr>
                    </thead>
                    <tbody>
                      {lanes.map((lane) => {
                        const laneId = toText(lane?.laneId) || "unassigned";
                        const active = laneFilter === laneId;
                        return (
                          <tr key={laneId} className={active ? "isActive" : ""} onClick={() => setLaneFilter((v) => (v === laneId ? "all" : laneId))}>
                            <td>{toText(lane?.laneName) || laneId}</td>
                            <td>{Number(lane?.stepsCount || 0)}</td>
                            <td>{secToLabel(lane?.timeTotalSec)}</td>
                            <td>{Number(lane?.elementsCount || 0)}</td>
                            <td>{Number(lane?.notesCount || 0)}</td>
                            <td>{Number(lane?.aiQuestionsCount || 0)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </section>

              <section id="doc-nodes" className="docSection">
                <h3 className="docSectionTitle">Узлы BPMN</h3>
                <div className="docTableWrap">
                  <table className="docTable">
                    <thead>
                      <tr>
                        <th>path</th>
                        <th>name</th>
                        <th>type</th>
                        <th>lane</th>
                        <th>in</th>
                        <th>out</th>
                        <th>class</th>
                      </tr>
                    </thead>
                    <tbody>
                      {toArray(asObject(snapshot?.graph).nodes).map((node) => (
                        <tr key={toText(node?.nodeId)}>
                          <td>{toText(node?.graphPath) || "—"}</td>
                          <td>{toText(node?.nodeName) || toText(node?.nodeId)}</td>
                          <td>{toText(node?.nodeType) || "—"}</td>
                          <td>{toText(node?.laneName) || "—"}</td>
                          <td>{Number(node?.incoming || 0)}</td>
                          <td>{Number(node?.outgoing || 0)}</td>
                          <td>{toText(node?.class) || "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>

              <section id="doc-flows" className="docSection">
                <h3 className="docSectionTitle">Переходы (sequence flows)</h3>
                <div className="docTableWrap">
                  <table className="docTable">
                    <thead>
                      <tr>
                        <th>Flow</th>
                        <th>From</th>
                        <th>To</th>
                        <th>Condition</th>
                        <th>Tier</th>
                      </tr>
                    </thead>
                    <tbody>
                      {toArray(asObject(snapshot?.graph).flows).map((flow) => (
                        <tr key={toText(flow?.flowId)}>
                          <td>{toText(flow?.flowId) || "—"}</td>
                          <td>{toText(flow?.sourceName) || toText(flow?.sourceId) || "—"}</td>
                          <td>{toText(flow?.targetName) || toText(flow?.targetId) || "—"}</td>
                          <td>{toText(flow?.label) || "—"}</td>
                          <td><span className={`docPill tier-${normalizeTier(flow?.tier).toLowerCase()}`}>{normalizeTier(flow?.tier)}</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>

              <section id="doc-steps" className="docSection">
                <div className="docSectionHead">
                  <h3 className="docSectionTitle">Шаги (Откуда → Шаг → Куда)</h3>
                  <div className="docInlineControls">
                    <span className="docMuted">Density</span>
                    <button type="button" className={`docDensityBtn ${density === "comfortable" ? "isActive" : ""}`} onClick={() => setDensity("comfortable")}>M</button>
                    <button type="button" className={`docDensityBtn ${density === "compact" ? "isActive" : ""}`} onClick={() => setDensity("compact")}>S</button>
                    <span className="docMuted">Lane filter:</span>
                    <select className="select h-8 min-w-[180px]" value={laneFilter} onChange={(e) => setLaneFilter(e.target.value)}>
                      <option value="all">Все</option>
                      {lanes.map((lane) => (
                        <option key={`lane_filter_${toText(lane?.laneId) || "unassigned"}`} value={toText(lane?.laneId) || "unassigned"}>
                          {toText(lane?.laneName) || toText(lane?.laneId)}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="docTableWrap">
                  <table className={`docTable docStepsTable ${density === "compact" ? "compact" : ""}`}>
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>Lane</th>
                        <th>Prev</th>
                        <th>Step</th>
                        <th>Next</th>
                        <th>Tier</th>
                        <th>Time</th>
                        <th>DoD</th>
                        <th>AI/Notes</th>
                      </tr>
                    </thead>
                    <tbody>
                      {!filteredSteps.length ? (
                        <tr><td colSpan={9} className="docMuted">Шаги не найдены для выбранного фильтра.</td></tr>
                      ) : filteredSteps.map((step) => {
                        const stepKey = toText(step?.stepId) || String(step?.index || "");
                        const isOpen = expandedStepKey === stepKey;
                        return (
                          <Fragment key={`step_group_${stepKey}`}>
                            <tr key={`step_row_${stepKey}`} className={isOpen ? "isOpen" : ""}>
                              <td>{toText(asObject(step?.graph).graphNo || step?.index) || "—"}</td>
                              <td>{toText(step?.laneName) || "—"}</td>
                              <td>{prevNextPills(asObject(step?.graph).prev)}</td>
                              <td>
                                <button
                                  type="button"
                                  className="docStepBtn"
                                  onClick={() => setExpandedStepKey((v) => (v === stepKey ? "" : stepKey))}
                                >
                                  {toText(step?.title) || "—"}
                                </button>
                              </td>
                              <td>{prevNextPills(asObject(step?.graph).next)}</td>
                              <td><span className={`docPill tier-${normalizeTier(step?.tier).toLowerCase()}`}>{normalizeTier(step?.tier)}</span></td>
                              <td>{secToLabel(step?.durationSec)}</td>
                              <td>{Number(step?.dod?.done || 0)}/{Number(step?.dod?.total || 0)}</td>
                              <td>AI {Number(asObject(step?.ai).questionsCount || 0)} · N {Number(asObject(step?.notes).elementCount || 0)}</td>
                            </tr>
                            {isOpen ? (
                              <tr key={`step_detail_${stepKey}`} className="docStepDetailsRow">
                                <td colSpan={9}>
                                  <div className="docStepDetails">
                                    <div><b>BPMN:</b> {toText(asObject(step?.bpmn).nodeName) || "—"} ({toText(asObject(step?.bpmn).nodeType) || "—"})</div>
                                    <div><b>Накопительное время:</b> {secToLabel(step?.cumulativeSec)}</div>
                                    <div><b>DoD missing:</b> {toArray(asObject(step?.dod).missingKeys).join(", ") || "нет"}</div>
                                    {asObject(asObject(step?.graph).betweenBranchesSummary).rows ? (
                                      <div>
                                        <b>Ветки:</b>
                                        <div className="docPills">
                                          {toArray(asObject(asObject(step?.graph).betweenBranchesSummary).rows).map((row, idx) => (
                                            <span key={`branch_row_${idx + 1}`} className={`docPill tier-${normalizeTier(row?.tier).toLowerCase()}`} title={toText(row?.outcome)}>
                                              {toText(row?.label) || `Ветка ${idx + 1}`} · {normalizeTier(row?.tier)}
                                            </span>
                                          ))}
                                        </div>
                                      </div>
                                    ) : null}
                                  </div>
                                </td>
                              </tr>
                            ) : null}
                          </Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </section>

              <section id="doc-quality" className="docSection">
                <h3 className="docSectionTitle">Quality / Проверки</h3>
                <div className="docIssueColumns">
                  <div className="docIssueCol">
                    <div className="docIssueHead err">Ошибки: {qualityErrors.length}</div>
                    {!qualityErrors.length ? <div className="docMuted">Нет критичных ошибок.</div> : qualityErrors.map((item, idx) => (
                      <div key={`err_${idx + 1}`} className="docIssueCard err">
                        <div className="docIssueTitle">{toText(item?.message) || "—"}</div>
                        <div className="docIssueHint">{toText(item?.fix) || "Способ исправления не указан."}</div>
                      </div>
                    ))}
                  </div>
                  <div className="docIssueCol">
                    <div className="docIssueHead warn">Предупреждения: {qualityWarnings.length}</div>
                    {!qualityWarnings.length ? <div className="docMuted">Нет предупреждений.</div> : qualityWarnings.map((item, idx) => (
                      <div key={`warn_${idx + 1}`} className="docIssueCard warn">
                        <div className="docIssueTitle">{toText(item?.message) || "—"}</div>
                        <div className="docIssueHint">{toText(item?.fix) || "Рекомендация не указана."}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </section>

              <section id="doc-tech" className="docSection">
                <details className="docTechnicalDetails">
                  <summary>Технические сведения</summary>
                  <pre className="docTechnicalPre">
                    {JSON.stringify({
                      session_id: toText(meta?.sessionId),
                      generated_at: toText(meta?.generatedAtIso),
                      snapshot_version: toText(meta?.version),
                      internal_node_ids: toArray(asObject(snapshot?.graph).nodes).map((node) => toText(node?.nodeId)).filter(Boolean),
                      internal_flow_ids: toArray(asObject(snapshot?.graph).flows).map((flow) => toText(flow?.flowId)).filter(Boolean),
                      detached_node_ids: toArray(asObject(snapshot?.technical).detachedNodeIds),
                    }, null, 2)}
                  </pre>
                </details>
              </section>
            </div>
          </div>
        </div>
      ) : (
        <div className="docRawWrap">
          <textarea className="docRawTextarea" value={markdown} readOnly />
        </div>
      )}
    </section>
  );
}
