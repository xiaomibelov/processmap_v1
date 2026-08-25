import React, { useMemo, useState } from "react";
import { AnalysisEmptyState, AnalysisErrorState, AnalysisKpiCard, AnalysisSection, AnalysisSkeleton } from "./ui/index.js";
import styles from "./ProcessAnalysis.module.css";

function formatValue(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "0";
  return n % 1 === 0 ? String(n) : n.toFixed(1);
}

function formatPercent(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "0%";
  return `${Math.round(n)}%`;
}

function TabState({ loading, error, retry, model, t, children }) {
  if (loading) return <AnalysisSkeleton variant="card" count={4} data-testid="summary-tab-skeleton" />;
  if (error) {
    return (
      <AnalysisErrorState
        title={t ? t("processAnalysis.error.title") : undefined}
        message={String(error)}
        onRetry={retry}
        retryLabel={t ? t("processAnalysis.error.retry") : undefined}
        data-testid="summary-tab-error"
      />
    );
  }
  if (!model) {
    return (
      <AnalysisEmptyState
        title={t ? t("processAnalysis.empty.title") : undefined}
        description={t ? t("processAnalysis.empty.description") : undefined}
        data-testid="summary-tab-empty"
      />
    );
  }
  return children;
}

export const ProcessAnalysisSummaryTab = React.memo(function ProcessAnalysisSummaryTab({
  model,
  loading,
  error,
  retry,
  t,
}) {
  const [advancedOpen, setAdvancedOpen] = useState(false);

  const kpiCards = useMemo(() => {
    if (!model) return [];
    return model.kpi_cards || [];
  }, [model]);

  const kpiTooltipKey = useMemo(() => ({
    avg_step: "avgStep",
    bpmn_binding: "bpmnBinding",
  }), []);

  const allKpiZero = useMemo(() => {
    if (!kpiCards.length) return false;
    return kpiCards.every((card) => Number(card.value || 0) === 0);
  }, [kpiCards]);

  const topWaits = useMemo(() => {
    if (!model) return [];
    return model.top_waits || [];
  }, [model]);

  const distributions = useMemo(() => {
    if (!model) return { by_type: [], by_lane: [], by_subprocess: [] };
    return model.distributions || { by_type: [], by_lane: [], by_subprocess: [] };
  }, [model]);

  const coverage = useMemo(() => {
    if (!model) return [];
    return model.coverage || [];
  }, [model]);

  const extremes = useMemo(() => {
    if (!model) return { max_duration_step: null, max_wait_step: null };
    return model.extremes || { max_duration_step: null, max_wait_step: null };
  }, [model]);

  const exceptions = useMemo(() => {
    if (!model) return { count: 0, add_min_total: 0 };
    return model.exceptions || { count: 0, add_min_total: 0 };
  }, [model]);

  const aiCoverage = useMemo(() => {
    return coverage.find((c) => c.key === "ai") || { percent: 0 };
  }, [coverage]);

  const bindCoverage = useMemo(() => {
    return coverage.find((c) => c.key === "bind") || { percent: 0 };
  }, [coverage]);

  return (
    <div className={styles.tabScroll} data-testid="process-analysis-summary-tab">
      <TabState loading={loading} error={error} retry={retry} model={model} t={t}>
        <div className={styles.tabContent}>
          <div className={styles.summaryGrid}>
            {kpiCards.map((card) => (
              <AnalysisKpiCard
                key={card.key}
                value={formatValue(card.value)}
                label={card.label}
                unit={card.unit}
                tooltip={t ? t(`processAnalysis.kpi.tooltip.${kpiTooltipKey[card.key] || card.key}`) : undefined}
                data-testid={`summary-kpi-${card.key}`}
              />
            ))}
          </div>
          {allKpiZero ? (
            <div className={styles.analysisHint} data-testid="summary-kpi-zero-hint">
              {t ? t("processAnalysis.summary.zeroKpiHint") : "Метрики равны 0, потому что границы не заданы или нет данных о длительностях."}
            </div>
          ) : null}

          <AnalysisSection
            title={t ? t("processAnalysis.topWaits.title") : "Топ-3 ожидания"}
            subtitle={topWaits.length ? `${topWaits.length} шагов с ожиданием` : undefined}
            data-testid="summary-top-waits-section"
          >
            {!topWaits.length ? (
              <AnalysisEmptyState
                title={t ? t("processAnalysis.topWaits.empty") : "Пока нет шагов с ожиданием"}
                data-testid="summary-top-waits-empty"
              />
            ) : (
              <ul className={styles.summaryList} data-testid="summary-top-waits-list">
                {topWaits.slice(0, 3).map((x) => (
                  <li key={x.step_id || x.id} className={styles.summaryListItem}>
                    <span className={styles.summaryListSeq}>#{x.seq}</span>
                    <span className={styles.summaryListLabel}>{x.title || x.action || "—"}</span>
                    <span className={styles.summaryListValue}>{formatValue(x.wait_min)} мин</span>
                  </li>
                ))}
              </ul>
            )}
            {extremes.max_duration_step || extremes.max_wait_step ? (
              <div className="muted small" style={{ marginTop: 8 }}>
                {extremes.max_duration_step
                  ? `Самый долгий активный шаг: #${extremes.max_duration_step.seq} (${formatValue(extremes.max_duration_step.duration_min)} мин).`
                  : null}
                {" "}
                {extremes.max_wait_step
                  ? `Самое длинное ожидание: #${extremes.max_wait_step.seq} (${formatValue(extremes.max_wait_step.wait_min)} мин).`
                  : null}
              </div>
            ) : null}
          </AnalysisSection>

          <AnalysisSection
            title={t ? t("processAnalysis.advanced.title") : "Распределения, AI и диагностика"}
            collapsible
            collapsed={!advancedOpen}
            onToggleCollapse={() => setAdvancedOpen((prev) => !prev)}
            data-testid="summary-advanced-section"
          >
            <div className={styles.summaryGrid}>
              <AnalysisKpiCard
                value={formatPercent(bindCoverage.percent)}
                label={t ? t("processAnalysis.coverage.bind") : "Привязка к BPMN"}
                unit="%"
                data-testid="summary-coverage-bind"
              />
              <AnalysisKpiCard
                value={formatPercent(aiCoverage.percent)}
                label={t ? t("processAnalysis.coverage.ai") : "AI-покрытие шагов"}
                unit="%"
                data-testid="summary-coverage-ai"
              />
              <AnalysisKpiCard
                value={formatValue(exceptions.count)}
                label={t ? t("processAnalysis.exceptions.title") : "Исключений"}
                data-testid="summary-exceptions-count"
              />
              <AnalysisKpiCard
                value={formatValue(exceptions.add_min_total)}
                label={t ? t("processAnalysis.exceptions.addMin") : "Влияние исключений"}
                unit="мин"
                data-testid="summary-exceptions-add-min"
              />
            </div>

            <div className={styles.summaryDistributions}>
              <div className={styles.summaryDistributionCard} data-testid="summary-dist-type">
                <div className="muted small">Распределение по типам шагов</div>
                {!distributions.by_type?.length ? (
                  <div className="muted small">Нет шагов.</div>
                ) : (
                  <ul className={styles.summaryList}>
                    {distributions.by_type.map((x) => (
                      <li key={x.key} className={styles.summaryListItem}>
                        <span className={styles.summaryListLabel}>{x.label || x.name}</span>
                        <span className={styles.summaryListValue}>{x.count} ({formatPercent(x.sharePct || x.share_percent)}) · lead {formatValue(x.lead)} мин</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div className={styles.summaryDistributionCard} data-testid="summary-dist-lane">
                <div className="muted small">Распределение по лайнам</div>
                {!distributions.by_lane?.length ? (
                  <div className="muted small">Нет лайнов.</div>
                ) : (
                  <ul className={styles.summaryList}>
                    {distributions.by_lane.map((x) => (
                      <li key={x.key} className={styles.summaryListItem}>
                        <span className={styles.summaryListLabel}>{x.label || x.name}</span>
                        <span className={styles.summaryListValue}>{x.count} ({formatPercent(x.sharePct || x.share_percent)}) · lead {formatValue(x.lead)} мин</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div className={styles.summaryDistributionCard} data-testid="summary-dist-subprocess">
                <div className="muted small">Распределение по подпроцессам</div>
                {!distributions.by_subprocess?.length ? (
                  <div className="muted small">Подпроцессы не выделены.</div>
                ) : (
                  <ul className={styles.summaryList}>
                    {distributions.by_subprocess.map((x) => (
                      <li key={x.key} className={styles.summaryListItem}>
                        <span className={styles.summaryListLabel}>{x.label || x.name}</span>
                        <span className={styles.summaryListValue}>{x.count} ({formatPercent(x.sharePct || x.share_percent)}) · lead {formatValue(x.lead)} мин</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </AnalysisSection>
        </div>
      </TabState>
    </div>
  );
});
