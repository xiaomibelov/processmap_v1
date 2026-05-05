import { useEffect, useState } from "react";
import { renderMarkdownPreview } from "../../../../features/process/lib/markdownPreview.jsx";
import Modal from "../../../../shared/ui/Modal";

function toArray(value) {
  return Array.isArray(value) ? value : [];
}

function toText(value) {
  return String(value || "").trim();
}

function asObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function shortHash(hashRaw) {
  return toText(hashRaw).slice(0, 8) || "—";
}

function formatReportCreatedAt(createdAtRaw) {
  const ts = Number(createdAtRaw || 0);
  if (!Number.isFinite(ts) || ts <= 0) return "—";
  try {
    return new Date(ts * 1000).toLocaleString("ru-RU");
  } catch {
    return "—";
  }
}

function formatTraceCreatedAt(isoRaw) {
  const iso = toText(isoRaw);
  if (!iso) return "—";
  const ts = Date.parse(iso);
  if (!Number.isFinite(ts) || ts <= 0) return "—";
  try {
    return new Date(ts).toLocaleTimeString("ru-RU");
  } catch {
    return "—";
  }
}

function toFiniteOrNull(raw) {
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0) return null;
  return value;
}

function pickFirstFinite(...values) {
  for (let i = 0; i < values.length; i += 1) {
    const num = toFiniteOrNull(values[i]);
    if (num !== null) return num;
  }
  return null;
}

function formatDurationSec(rawSec) {
  const sec = toFiniteOrNull(rawSec);
  if (sec === null) return "—";
  const totalMinutes = Math.round(sec / 60);
  if (totalMinutes < 60) return `${totalMinutes}м`;
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return m > 0 ? `${h}ч ${m}м` : `${h}ч`;
}

function formatPercent(raw) {
  const value = toFiniteOrNull(raw);
  if (value === null) return "—";
  return `${Math.round(value * 10) / 10}%`;
}

function hasUnstructuredWarning(reportRaw) {
  const report = asObject(reportRaw);
  const warnings = toArray(report?.warnings).map((item) => toText(item));
  return warnings.some((code) => (
    code === "json_parse_failed"
    || code === "json_candidate_not_found"
    || code === "invalid_json_object"
  ));
}

function hasStructuredReport(reportRaw) {
  const report = asObject(reportRaw);
  const reportJson = asObject(report?.report_json);
  return Object.keys(reportJson).length > 0;
}

function extractReportTotals(reportRaw) {
  const report = asObject(reportRaw);
  const reportJson = asObject(report?.report_json);
  const kpis = asObject(reportJson?.kpis);
  const payloadTotals = asObject(asObject(report?.request_payload_json)?.totals);
  const rootTotals = asObject(report?.totals);
  return {
    steps_count: pickFirstFinite(kpis?.steps_count, report?.steps_count, rootTotals?.steps_count, payloadTotals?.steps_count),
    work_total_sec: pickFirstFinite(
      kpis?.work_total_sec,
      report?.work_total_sec,
      report?.work_time_total_sec,
      rootTotals?.work_total_sec,
      rootTotals?.work_time_total_sec,
      payloadTotals?.work_total_sec,
      payloadTotals?.work_time_total_sec,
    ),
    wait_total_sec: pickFirstFinite(
      kpis?.wait_total_sec,
      report?.wait_total_sec,
      report?.wait_time_total_sec,
      rootTotals?.wait_total_sec,
      rootTotals?.wait_time_total_sec,
      payloadTotals?.wait_total_sec,
      payloadTotals?.wait_time_total_sec,
    ),
    total_sec: pickFirstFinite(
      kpis?.total_sec,
      report?.total_sec,
      report?.total_time_sec,
      rootTotals?.total_sec,
      rootTotals?.total_time_sec,
      payloadTotals?.total_sec,
      payloadTotals?.total_time_sec,
    ),
  };
}

function extractCoverage(reportRaw) {
  const report = asObject(reportRaw);
  const reportJson = asObject(report?.report_json);
  const reportKpis = asObject(reportJson?.kpis);
  const reportCoverage = asObject(reportKpis?.coverage);
  const coverage = asObject(report?.missing_fields_coverage);
  const payloadCoverage = asObject(asObject(report?.request_payload_json)?.missing_fields_coverage);
  return {
    missing_work_duration_pct: pickFirstFinite(reportCoverage?.missing_work_duration_pct, coverage?.missing_work_duration_pct, payloadCoverage?.missing_work_duration_pct),
    missing_wait_duration_pct: pickFirstFinite(reportCoverage?.missing_wait_duration_pct, coverage?.missing_wait_duration_pct, payloadCoverage?.missing_wait_duration_pct),
    missing_notes_pct: pickFirstFinite(reportCoverage?.missing_notes_pct, coverage?.missing_notes_pct, payloadCoverage?.missing_notes_pct),
  };
}

function extractIssueCounts(reportRaw) {
  const report = asObject(reportRaw);
  const quality = asObject(report?.quality_summary);
  const payloadQuality = asObject(asObject(report?.request_payload_json)?.quality_summary);
  const link = asObject(quality?.link_integrity);
  const payloadLink = asObject(payloadQuality?.link_integrity);
  return {
    orphan_count: pickFirstFinite(quality?.orphan_count, payloadQuality?.orphan_count),
    dead_end_count: pickFirstFinite(quality?.dead_end_count, payloadQuality?.dead_end_count),
    link_warn: pickFirstFinite(link?.warn, payloadLink?.warn),
    link_error: pickFirstFinite(link?.error, payloadLink?.error),
  };
}

function normalizeRecommendationScope(raw) {
  return toText(raw).toLowerCase() === "step" ? "step" : "global";
}

function normalizeRecommendationPriority(recRaw) {
  const rec = asObject(recRaw);
  const raw = toText(
    rec?.priority
    || rec?.prio
    || rec?.severity
    || rec?.importance
    || rec?.level
    || rec?.rank,
  ).toUpperCase();
  if (raw === "P0" || raw === "P1" || raw === "P2") return raw;
  const numeric = Number(raw);
  if (Number.isFinite(numeric)) {
    if (numeric <= 0) return "P0";
    if (numeric === 1) return "P1";
    return "P2";
  }
  const text = toText(rec?.text).toLowerCase();
  if (text.includes("сроч") || text.includes("critical") || text.includes("крит")) return "P0";
  return "P1";
}

function recommendationGroupKey(recRaw, priorityRaw) {
  const rec = asObject(recRaw);
  const priority = toText(priorityRaw).toUpperCase();
  if (priority === "P0") return "quick_wins";
  const bag = `${toText(rec?.text)} ${toText(rec?.expected_effect)} ${toText(rec?.category)} ${toText(rec?.tag)}`.toLowerCase();
  if (
    bag.includes("риск")
    || bag.includes("qc")
    || bag.includes("quality")
    || bag.includes("качест")
    || bag.includes("санитар")
    || bag.includes("температур")
    || bag.includes("безопас")
    || bag.includes("контрол")
  ) return "risks_qc";
  if (
    bag.includes("время")
    || bag.includes("тайм")
    || bag.includes("длитель")
    || bag.includes("wait")
    || bag.includes("work_duration")
    || bag.includes("узк")
    || bag.includes("bottleneck")
    || bag.includes("простой")
    || bag.includes("ускор")
  ) return "time_optimization";
  return "data_quality";
}

function recommendationGroupTitle(groupKey) {
  if (groupKey === "quick_wins") return "Быстрые победы (P0)";
  if (groupKey === "data_quality") return "Качество данных";
  if (groupKey === "time_optimization") return "Оптимизация времени";
  if (groupKey === "risks_qc") return "Риски/QC";
  return "Рекомендации";
}

function KpiCard({ label, value, skeleton = false }) {
  if (skeleton) {
    return (
      <div className="interviewPathReportKpiCard isSkeleton" aria-hidden="true">
        <div className="interviewPathReportKpiSkeletonValue" />
        <div className="interviewPathReportKpiSkeletonLabel" />
      </div>
    );
  }
  return (
    <div className="interviewPathReportKpiCard">
      <div className={`interviewPathReportKpiValue ${typeof value === "string" ? "" : "isNode"}`}>
        {value || "—"}
      </div>
      <div className="interviewPathReportKpiLabel">{toText(label) || "—"}</div>
    </div>
  );
}

function ReportAccordion({ title, badge = "", open = false, children }) {
  return (
    <details className="interviewPathReportAccordion" open={open}>
      <summary className="interviewPathReportAccordionSummary">
        <span>{title}</span>
        {badge ? <span className="badge muted">{badge}</span> : null}
      </summary>
      <div className="interviewPathReportAccordionBody">{children}</div>
    </details>
  );
}

export default function ReportsDrawer({
  open = false,
  onClose,
  reportVersionsLoading = false,
  reportLoading = false,
  reportFilterActualOnly = false,
  onToggleActualOnly,
  reportFilterErrorsOnly = false,
  onToggleErrorsOnly,
  visibleReportVersions = [],
  selectedReportId = "",
  onSelectReport,
  onRetryGenerate,
  canGenerateReport = false,
  onCopyMarkdown,
  onDeleteReport,
  canDeleteReport = true,
  deletingReportId = "",
  selectedReportView,
  reportDetailsById = {},
  reportDetailsLoadingId = "",
  latestActualReportId = "",
  onRecommendationClick,
  activeRecommendationOrderIndex = 0,
  reportGenerationTrace = [],
  showReportGenerationTrace = false,
  reportErrorNotice = null,
  reportDetailsErrorNotice = null,
}) {
  const [techlogExpanded, setTechlogExpanded] = useState(false);
  const [deleteCandidate, setDeleteCandidate] = useState(null);
  useEffect(() => {
    if (!open) {
      setTechlogExpanded(false);
      setDeleteCandidate(null);
    }
  }, [open]);

  if (!open) return null;

  const selectedId = toText(selectedReportId);
  const selected = asObject(selectedReportView);
  const selectedStatus = toText(selected?.status || "running").toLowerCase();
  const selectedIsRunning = selectedStatus === "running";
  const selectedIsOk = selectedStatus === "ok";
  const selectedIsError = selectedStatus === "error";
  const selectedHasMarkdown = !!toText(selected?.report_markdown);
  const deleteCandidateReport = asObject(deleteCandidate);
  const deleteCandidateId = toText(deleteCandidateReport?.id);
  const deleteBusy = deleteCandidateId && deleteCandidateId === toText(deletingReportId);

  const structured = asObject(selected?.report_json);
  const structuredOn = hasStructuredReport(selected);
  const reportTitle = toText(structured?.title);
  const summaryItems = toArray(structured?.summary).map((item) => toText(item)).filter(Boolean);
  const bottlenecks = toArray(structured?.bottlenecks);
  const recs = toArray(structuredOn ? structured?.recommendations : selected?.recommendations);
  const missing = toArray(structuredOn ? structured?.missing_data : selected?.missing_data);
  const risks = toArray(selected?.risks);
  const reportSteps = toArray(selected?.request_payload_json?.steps || selected?.steps);
  const rawPayloadPreview = (() => {
    const raw = selected?.payload_raw ?? selected?.raw_json ?? selected?.raw_text ?? "";
    if (typeof raw === "string") return toText(raw);
    if (raw && typeof raw === "object") {
      try {
        return JSON.stringify(raw, null, 2);
      } catch {
        return "";
      }
    }
    return "";
  })();

  const totals = extractReportTotals(selected);
  const coverage = extractCoverage(selected);
  const issues = extractIssueCounts(selected);
  const issueItems = [
    issues.orphan_count !== null ? `orphan ${Math.round(issues.orphan_count)}` : "",
    issues.dead_end_count !== null ? `dead-end ${Math.round(issues.dead_end_count)}` : "",
    issues.link_error !== null ? `link err ${Math.round(issues.link_error)}` : "",
    issues.link_warn !== null ? `link warn ${Math.round(issues.link_warn)}` : "",
    `risks ${risks.length}`,
  ].filter(Boolean);
  const issuesSummaryValue = issueItems.length
    ? (
      <span className="interviewPathReportIssueChips">
        {issueItems.map((item, idx) => (
          <span key={`issue_${idx + 1}`} className="badge muted interviewPathReportIssueChip">{item}</span>
        ))}
      </span>
    )
    : "—";
  const fullHash = toText(selected?.steps_hash);

  const kpis = [
    { label: "Шаги", value: totals.steps_count !== null ? String(Math.round(totals.steps_count)) : "—" },
    { label: "Работа", value: formatDurationSec(totals.work_total_sec) },
    { label: "Ожидание", value: formatDurationSec(totals.wait_total_sec) },
    { label: "Итого", value: formatDurationSec(totals.total_sec) },
    { label: "Missing work", value: formatPercent(coverage.missing_work_duration_pct) },
    { label: "Missing wait", value: formatPercent(coverage.missing_wait_duration_pct) },
    { label: "Missing notes", value: formatPercent(coverage.missing_notes_pct) },
    { label: "Issues", value: issuesSummaryValue },
  ];

  const traceItems = toArray(reportGenerationTrace);
  const latestTrace = asObject(traceItems[traceItems.length - 1]);
  const selectedTrace = (() => {
    const reportId = toText(selectedId);
    if (!reportId) return asObject(latestTrace);
    for (let i = traceItems.length - 1; i >= 0; i -= 1) {
      const row = asObject(traceItems[i]);
      const rowReportId = toText(row?.report_id);
      if (!rowReportId || rowReportId === reportId) return row;
    }
    return asObject(latestTrace);
  })();
  const techlogSummary = traceItems.length
    ? `${toText(latestTrace?.title) || "—"} / ${formatTraceCreatedAt(latestTrace?.at_iso)}`
    : "событий пока нет";
  const progressLine = toText(selectedTrace?.title || selectedTrace?.detail || selectedTrace?.phase);

  const stepTitleByOrderIndex = (() => {
    const map = {};
    reportSteps.forEach((stepRaw) => {
      const step = asObject(stepRaw);
      const orderIndex = Number(step?.order_index || 0);
      if (!Number.isFinite(orderIndex) || orderIndex <= 0 || map[orderIndex]) return;
      map[orderIndex] = toText(step?.title || step?.action || step?.name) || "—";
    });
    return map;
  })();

  const recommendationRows = recs.map((recRaw, idx) => {
    const rec = asObject(recRaw);
    const scope = normalizeRecommendationScope(rec?.scope);
    const orderIndex = Number(rec?.order_index || 0);
    const isStep = scope === "step" && Number.isFinite(orderIndex) && orderIndex > 0;
    const priority = normalizeRecommendationPriority(rec);
    const groupKey = recommendationGroupKey(rec, priority);
    return {
      ...rec,
      _idx: idx + 1,
      _scope: scope,
      _priority: priority,
      _groupKey: groupKey,
      _orderIndex: isStep ? Math.floor(orderIndex) : 0,
      _stepTitle: isStep ? (toText(stepTitleByOrderIndex[Math.floor(orderIndex)]) || "—") : "",
      _effect: toText(rec?.expected_effect),
      _complexity: toText(rec?.complexity || rec?.effort || rec?.implementation_complexity),
      _text: toText(rec?.text),
    };
  });

  const recommendationGroups = (() => {
    const orderedGroupKeys = ["quick_wins", "data_quality", "time_optimization", "risks_qc"];
    return orderedGroupKeys
      .map((groupKey) => ({
        key: groupKey,
        title: recommendationGroupTitle(groupKey),
        items: recommendationRows.filter((item) => item?._groupKey === groupKey),
      }))
      .filter((group) => group.items.length);
  })();

  const planItems = (() => {
    if (!recommendationRows.length) return [];
    const hasEffect = recommendationRows.some((item) => toText(item?._effect));
    const ranked = hasEffect
      ? [...recommendationRows].sort((a, b) => toText(b?._effect).length - toText(a?._effect).length)
      : recommendationRows;
    return ranked.slice(0, 5);
  })();

  return (
    <div
      className="interviewReportsDrawerOverlay"
      role="presentation"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose?.();
      }}
    >
      <aside
        className="interviewReportsDrawer"
        data-testid="interview-path-report-panel"
        role="dialog"
        aria-label="Отчёты"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="interviewReportsDrawerHead">
          <strong>Отчёты</strong>
          <span className="muted small">Результат анализа, не источник процесса</span>
          {reportVersionsLoading ? <span className="muted small">Загрузка версий...</span> : null}
          {reportLoading ? <span className="muted small">Генерация новой версии...</span> : null}
          <label className="muted small">
            <input type="checkbox" checked={reportFilterActualOnly} onChange={(e) => onToggleActualOnly?.(!!e.target.checked)} />
            {" "}только актуальные
          </label>
          <label className="muted small">
            <input type="checkbox" checked={reportFilterErrorsOnly} onChange={(e) => onToggleErrorsOnly?.(!!e.target.checked)} />
            {" "}только ошибки
          </label>
          <button type="button" className="secondaryBtn tinyBtn ml-auto" onClick={() => onClose?.()}>Закрыть</button>
        </div>

        <div className="interviewReportsDashboard">
          <section className="interviewReportsListPane">
            {reportErrorNotice}

            {showReportGenerationTrace ? (
              <details
                className="interviewPathReportSection interviewPathReportTechlog"
                open={techlogExpanded}
                onToggle={(event) => setTechlogExpanded(event.currentTarget.open)}
              >
                <summary className="interviewPathReportTechlogCompact">
                  <span className="interviewPathReportSectionTitle">Диагностика генерации: {techlogSummary}</span>
                  <span className="secondaryBtn tinyBtn" aria-hidden="true">
                    {techlogExpanded ? "Скрыть" : "Показать"}
                  </span>
                </summary>
                {techlogExpanded ? (
                  traceItems.length ? (
                    <div className="interviewPathReportList">
                      {traceItems.map((traceRaw, idx) => {
                        const trace = asObject(traceRaw);
                        const phase = toText(trace?.phase).toLowerCase();
                        const reportStatus = toText(trace?.report_status).toLowerCase();
                        const badgeClass = (
                          phase.includes("error")
                          || reportStatus === "error"
                          || Number(trace?.status || 0) >= 400
                        )
                          ? "danger"
                          : (reportStatus === "ok" ? "ok" : "warn");
                        return (
                          <div key={`report_trace_${Number(trace?.seq || idx + 1)}`} className="interviewPathReportListItem">
                            <div className="interviewPathReportListItemHead">
                              <span className={`badge ${badgeClass}`}>#{Number(trace?.seq || idx + 1)}</span>
                              <span className="muted small">{formatTraceCreatedAt(trace?.at_iso)}</span>
                              {toText(trace?.phase) ? <span className="badge muted">{toText(trace?.phase)}</span> : null}
                              {toText(trace?.report_status) ? (
                                <span className={`badge ${reportStatus === "ok" ? "ok" : reportStatus === "error" ? "danger" : "warn"}`}>
                                  {toText(trace?.report_status)}
                                </span>
                              ) : null}
                            </div>
                            <div>{toText(trace?.title) || "—"}</div>
                            {toText(trace?.detail) ? <div className="muted small">{toText(trace?.detail)}</div> : null}
                            {(toText(trace?.method) || toText(trace?.endpoint) || Number(trace?.status || 0) > 0) ? (
                              <div className="muted small">
                                {toText(trace?.method || "GET")} {toText(trace?.endpoint || "—")}
                                {Number(trace?.status || 0) > 0 ? ` · HTTP ${Number(trace?.status || 0)}` : ""}
                              </div>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="muted small">Событий пока нет.</div>
                  )
                ) : null}
              </details>
            ) : null}

            <div className="interviewPathReportVersions">
              {toArray(visibleReportVersions).length ? (
                toArray(visibleReportVersions).map((itemRaw) => {
                  const item = asObject(itemRaw);
                  const reportId = toText(item?.id);
                  const itemStatus = toText(item?.status || "running").toLowerCase();
                  const itemDetail = asObject(reportDetailsById[reportId]);
                  const itemHasMarkdown = !!toText(
                    itemDetail?.report_markdown
                    || itemDetail?.raw_text
                    || (reportId === selectedId ? selected?.report_markdown : ""),
                  );
                  const isSelected = reportId && reportId === selectedId;
                  return (
                    <div
                      key={`report_version_${reportId || shortHash(item?.steps_hash)}`}
                      className={`interviewPathReportVersionItem ${isSelected ? "isSelected" : ""} ${item?.is_latest_actual ? "isLatestActual" : ""}`}
                      onClick={() => onSelectReport?.(reportId)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") onSelectReport?.(reportId);
                      }}
                    >
                      <div className="interviewPathReportVersionMeta">
                        <strong>v{Number(item?.version || 0)}</strong>
                        <span className="muted small">{formatReportCreatedAt(item?.created_at)}</span>
                        <span className={`badge ${itemStatus === "ok" ? "ok" : itemStatus === "error" ? "danger" : "warn"}`}>{itemStatus || "running"}</span>
                        <span className={`badge ${item?.is_actual ? "ok" : "warn"}`}>{item?.is_actual ? "актуален" : "устарел"}</span>
                        <span className="badge muted">hash {shortHash(item?.steps_hash)}</span>
                        {item?.is_latest_actual ? <span className="badge ok">последний актуальный</span> : null}
                      </div>
                      <div className="interviewPathReportVersionActions">
                        <button type="button" className="secondaryBtn tinyBtn" disabled={itemStatus !== "ok"} onClick={() => onSelectReport?.(reportId)}>
                          Открыть
                        </button>
                        <button type="button" className="secondaryBtn tinyBtn" onClick={() => onRetryGenerate?.()} disabled={!canGenerateReport}>
                          Повторить
                        </button>
                        <button type="button" className="secondaryBtn tinyBtn" disabled={!itemHasMarkdown || itemStatus === "running"} onClick={() => onCopyMarkdown?.(reportId)}>
                          Копировать
                        </button>
                        {canDeleteReport ? (
                          <button
                            type="button"
                            className="secondaryBtn tinyBtn"
                            disabled={!reportId || !!deletingReportId}
                            title="Действия"
                            onClick={(event) => {
                              event.stopPropagation();
                              setDeleteCandidate({ id: reportId, version: Number(item?.version || 0) });
                            }}
                          >
                            ⋯
                          </button>
                        ) : null}
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="muted small">Версий отчёта пока нет.</div>
              )}
            </div>
          </section>

          <section className="interviewReportsViewerPane">
            {reportDetailsErrorNotice}
            {selectedId ? (
              <div className="interviewPathReportVersionView">
                <div className="interviewPathReportViewerHeader">
                  <div className="interviewPathReportPanelHead">
                    <strong>v{Number(selected?.version || 0)}</strong>
                    <span className={`badge ${selectedIsOk ? "ok" : selectedIsError ? "danger" : "warn"}`}>{selectedStatus || "running"}</span>
                    <span className="muted small">{formatReportCreatedAt(selected?.created_at)}</span>
                    <span className={`badge ${selected?.is_actual ? "ok" : "warn"}`}>{selected?.is_actual ? "актуален" : "устарел"}</span>
                    {selectedId === toText(latestActualReportId) ? <span className="badge ok">последний актуальный</span> : null}
                  </div>
                </div>
                <details className="interviewPathReportAdvancedDetails">
                  <summary>Технические сведения версии</summary>
                  <div className="interviewPathReportPanelHead">
                    <span className="badge muted">hash {shortHash(selected?.steps_hash)}</span>
                    {fullHash ? (
                      <button
                        type="button"
                        className="secondaryBtn tinyBtn"
                        title={fullHash}
                        onClick={async () => {
                          try {
                            if (navigator?.clipboard?.writeText) {
                              await navigator.clipboard.writeText(fullHash);
                            }
                          } catch {
                          }
                        }}
                      >
                        Скопировать hash
                      </button>
                    ) : null}
                    {toText(selected?.prompt_template_version) ? <span className="badge muted">tpl {toText(selected?.prompt_template_version)}</span> : null}
                    {toText(selected?.model) ? <span className="badge muted">model {toText(selected?.model)}</span> : null}
                  </div>
                </details>

                {selectedId === toText(reportDetailsLoadingId) ? <div className="muted small">Загружаю детали версии...</div> : null}

                {selectedIsRunning ? (
                  <>
                    <div className="interviewReportStateCard isRunning" role="status" aria-live="polite">
                      <span className="interviewReportSpinner" />
                      <div className="interviewReportStateText">
                        <strong>Генерация отчёта…</strong>
                        <span className="muted small">{progressLine || "Подготавливаем данные и считаем метрики."}</span>
                      </div>
                    </div>
                    <div className="interviewPathReportKpiGrid isSkeleton">
                      {kpis.map((item) => <KpiCard key={item.label} label={item.label} value="" skeleton />)}
                    </div>
                    <div className="muted small">Отчёт ещё генерируется.</div>
                  </>
                ) : null}

                {selectedIsError ? (
                  <div className="interviewReportStateCard isError">
                    <div>
                      <strong>Ошибка генерации отчёта</strong>
                      <div className="muted small">{toText(selected?.error_message) || "Версия завершилась с ошибкой."}</div>
                    </div>
                    <button type="button" className="secondaryBtn tinyBtn" onClick={() => onRetryGenerate?.()} disabled={!canGenerateReport}>
                      Повторить генерацию
                    </button>
                  </div>
                ) : null}

                {selectedIsOk ? (
                  <>
                    {hasUnstructuredWarning(selected) ? <div className="interviewAnnotationNotice warn">Ответ модели частично неструктурирован; применён fallback-парсинг.</div> : null}
                    <div className="interviewPathReportKpiGrid">
                      {kpis.map((item) => <KpiCard key={item.label} label={item.label} value={item.value} />)}
                    </div>

                    {structuredOn ? (
                      <div className="interviewPathReportStructuredSummary">
                        {reportTitle ? <h3 className="interviewPathReportStructuredTitle">{reportTitle}</h3> : null}
                        {summaryItems.length ? (
                          <ul className="interviewPathReportStructuredBullets">
                            {summaryItems.map((item, idx) => <li key={`report_summary_${idx + 1}`}>{item}</li>)}
                          </ul>
                        ) : (
                          <div className="muted small">Сводка отсутствует.</div>
                        )}
                      </div>
                    ) : null}

                    {structuredOn ? (
                      <ReportAccordion title="Bottlenecks (Top 5)" badge={String(bottlenecks.length)}>
                        {bottlenecks.length ? (
                          <div className="interviewPathReportList">
                            {bottlenecks.map((itemRaw, idx) => {
                              const item = asObject(itemRaw);
                              const orderIndex = Number(item?.order_index || 0);
                              return (
                                <div key={`path_report_bottleneck_${idx + 1}`} className="interviewPathReportListItem">
                                  <div className="interviewPathReportListItemHead">
                                    <span className="badge muted">{orderIndex > 0 ? `step #${orderIndex}` : "global"}</span>
                                    {toText(item?.title) ? <span className="badge">{toText(item?.title)}</span> : null}
                                  </div>
                                  {toText(item?.reason) ? <div>{toText(item?.reason)}</div> : <div>—</div>}
                                  {toText(item?.impact) ? <div className="muted small">Impact: {toText(item?.impact)}</div> : null}
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                          <div className="muted small">Узкие места не перечислены.</div>
                        )}
                      </ReportAccordion>
                    ) : null}

                    <ReportAccordion title="Markdown" badge={selectedHasMarkdown ? "есть" : "нет"} open={!structuredOn}>
                      {selectedHasMarkdown ? (
                        <div className="interviewPathReportMarkdown">
                          <div className="interviewPathReportMarkdownBody docProse">{renderMarkdownPreview(selected?.report_markdown)}</div>
                        </div>
                      ) : (
                        <div className="muted small">Markdown отчёта отсутствует.</div>
                      )}
                    </ReportAccordion>

                    <details className="interviewPathReportAdvancedDetails">
                      <summary>Диагностика отчёта</summary>
                      <ReportAccordion title="Сырые данные" badge={rawPayloadPreview ? "есть" : "нет"}>
                        {rawPayloadPreview ? (
                          <pre className="interviewPathReportRawData">{rawPayloadPreview}</pre>
                        ) : (
                          <div className="muted small">Сырые данные отсутствуют.</div>
                        )}
                      </ReportAccordion>
                    </details>

                    <section className="interviewPathReportRecSection">
                      <div className="interviewPathReportSectionTitle">Рекомендации</div>
                      {recommendationRows.length ? (
                        <div className="interviewPathReportRecGroups">
                          {recommendationGroups.map((group) => (
                            <div key={`rec_group_${group.key}`} className="interviewPathReportRecGroup">
                              <div className="interviewPathReportRecGroupHead">
                                <strong>{group.title}</strong>
                                <span className="badge muted">{group.items.length}</span>
                              </div>
                              <div className="interviewPathReportRecTable">
                                <div className="interviewPathReportRecHead">
                                  <span>Priority</span>
                                  <span>Scope</span>
                                  <span>Шаг</span>
                                  <span>Рекомендация</span>
                                  <span>Эффект/Сложность</span>
                                  <span />
                                </div>
                                {group.items.map((rec) => {
                                  const isStep = rec?._scope === "step" && rec?._orderIndex > 0;
                                  const isActive = isStep && rec?._orderIndex === Number(activeRecommendationOrderIndex || 0);
                                  return (
                                    <div key={`path_report_rec_${group.key}_${rec._idx}`} className={`interviewPathReportRecRow ${isActive ? "isActive" : ""}`}>
                                      <span className={`badge interviewRecChipPriority p-${toText(rec?._priority).toLowerCase()}`}>{rec?._priority}</span>
                                      <span className="badge muted">{rec?._scope}</span>
                                      <span className="interviewPathReportRecStepRef">
                                        {isStep ? (
                                          <>
                                            <span>#{rec._orderIndex}</span>
                                            <span className="muted small">{rec._stepTitle}</span>
                                          </>
                                        ) : "—"}
                                      </span>
                                      <span className="interviewPathReportRecTextCell">
                                        <span className="interviewPathReportRecTextClamp">{rec?._text || "—"}</span>
                                        {toText(rec?._text).length > 160 ? (
                                          <details className="interviewPathReportRecExpand">
                                            <summary>Развернуть</summary>
                                            <div className="muted small">{rec?._text}</div>
                                          </details>
                                        ) : null}
                                      </span>
                                      <span className="interviewPathReportRecEffectCell">
                                        <span>{rec?._effect || "—"}</span>
                                        <span className="muted small">{rec?._complexity ? `Сложность: ${rec._complexity}` : ""}</span>
                                      </span>
                                      <span>
                                        {isStep ? (
                                          <button type="button" className="secondaryBtn tinyBtn" onClick={() => onRecommendationClick?.(rec)}>
                                            Перейти к шагу
                                          </button>
                                        ) : null}
                                      </span>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="muted small">Рекомендации отсутствуют.</div>
                      )}
                    </section>

                    <ReportAccordion title="План улучшений (Top 5)" badge={String(planItems.length)}>
                      {planItems.length ? (
                        <div className="interviewPathReportList">
                          {planItems.map((itemRaw, idx) => {
                            const item = asObject(itemRaw);
                            const orderIndex = Number(item?.order_index || 0);
                            const isStep = toText(item?.scope).toLowerCase() === "step" && orderIndex > 0;
                            return (
                              <div key={`path_plan_${idx + 1}`} className="interviewPathReportListItem">
                                <div className="interviewPathReportListItemHead">
                                  <span className={`badge ${isStep ? "warn" : "muted"}`}>{isStep ? `step #${orderIndex}` : "global"}</span>
                                </div>
                                <div>{toText(item?.text) || "—"}</div>
                                {toText(item?.expected_effect) ? <div className="muted small">Эффект: {toText(item?.expected_effect)}</div> : null}
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="muted small">Нет данных для плана.</div>
                      )}
                    </ReportAccordion>

                    <ReportAccordion title="Missing data" badge={String(missing.length)}>
                      {missing.length ? (
                        <div className="interviewPathReportList">
                          {missing.map((itemRaw, idx) => {
                            const item = asObject(itemRaw);
                            const orderIndex = Number(item?.order_index || 0);
                            const fields = toArray(item?.missing).map((x) => toText(x)).filter(Boolean);
                            return (
                              <div key={`path_report_missing_${idx + 1}`} className="interviewPathReportListItem">
                                <div className="interviewPathReportListItemHead">
                                  <span className="badge muted">{orderIndex > 0 ? `step #${orderIndex}` : "global"}</span>
                                </div>
                                <div>{fields.length ? fields.join(", ") : "—"}</div>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="muted small">Пробелов в данных не обнаружено.</div>
                      )}
                    </ReportAccordion>

                    <ReportAccordion title="Риски" badge={String(risks.length)}>
                      {risks.length ? (
                        <div className="interviewPathReportList">
                          {risks.map((riskRaw, idx) => {
                            const risk = asObject(riskRaw);
                            const indexes = toArray(risk?.step_order_indexes)
                              .map((x) => Number(x))
                              .filter((x) => Number.isFinite(x) && x > 0);
                            return (
                              <div key={`path_report_risk_${idx + 1}`} className="interviewPathReportListItem">
                                <div>{toText(risk?.text) || "—"}</div>
                                <div className="muted small">{indexes.length ? `Шаги: ${indexes.join(", ")}` : "Без привязки к шагам"}</div>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="muted small">Риски не перечислены.</div>
                      )}
                    </ReportAccordion>
                  </>
                ) : null}
              </div>
            ) : (
              <div className="muted small">Выберите версию отчёта слева.</div>
            )}
          </section>
        </div>
      </aside>

      <Modal
        open={!!deleteCandidateId}
        title="Удалить версию отчёта?"
        onClose={() => {
          if (deleteBusy) return;
          setDeleteCandidate(null);
        }}
        footer={(
          <>
            <button
              type="button"
              className="secondaryBtn"
              onClick={() => setDeleteCandidate(null)}
              disabled={!!deleteBusy}
            >
              Отмена
            </button>
            <button
              type="button"
              className="dangerBtn"
              disabled={!deleteCandidateId || !!deleteBusy}
              onClick={async () => {
                if (!deleteCandidateId || deleteBusy) return;
                await onDeleteReport?.(deleteCandidateReport);
                setDeleteCandidate(null);
              }}
            >
              {deleteBusy ? "Удаление..." : "Удалить"}
            </button>
          </>
        )}
      >
        <div className="muted small">
          Удалить версию v{Number(deleteCandidateReport?.version || 0)}? Это необратимо.
        </div>
      </Modal>
    </div>
  );
}
