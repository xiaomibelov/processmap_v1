import React from "react";
import styles from "./ProcessAnalysis.module.css";
import { formatMinutes, formatPercent, formatThroughput } from "./processAnalysisModel.js";

const TONE_VARS = {
  neutral: "var(--color-primary, #1E3A5F)",
  info: "var(--color-secondary, #2563EB)",
  warning: "#F59E0B",
  success: "var(--color-accent, #059669)",
};

function KpiCard({ card }) {
  return (
    <div
      className={styles.kpiCard}
      style={{ "--kpi-accent": TONE_VARS[card.tone] || TONE_VARS.neutral }}
      role="group"
      aria-label={card.label}
    >
      <div className={styles.kpiLabel}>{card.label}</div>
      <div className={styles.kpiValue}>
        {card.key === "throughput" ? formatThroughput(card.value) : formatMinutes(card.value)}
        <span className={styles.kpiUnit}>{card.unit}</span>
      </div>
    </div>
  );
}

function DistributionCard({ title, items, valueKey = "lead_min", labelKey = "name" }) {
  const maxValue = Math.max(...items.map((item) => Number(item[valueKey] || 0)), 1);
  return (
    <div className={styles.distributionCard}>
      <h3 className={styles.sectionTitle}>{title}</h3>
      {items.length === 0 ? (
        <div className={styles.emptyState}>—</div>
      ) : (
        items.map((item) => {
          const value = Number(item[valueKey] || 0);
          const share = Number(item.share_percent || 0);
          return (
            <div key={item.key} className={styles.barRow}>
              <div className={styles.barLabel}>{item[labelKey] || item.key}</div>
              <div className={styles.barTrack}>
                <div
                  className={styles.barFill}
                  style={{ width: `${maxValue > 0 ? (value / maxValue) * 100 : 0}%` }}
                />
              </div>
              <div className={styles.barValue}>{share}%</div>
            </div>
          );
        })
      )}
    </div>
  );
}

function CoverageMeters({ meters, t }) {
  return (
    <div className={styles.sideCard}>
      <h3 className={styles.sectionTitle}>{t("processAnalysis.sections.coverage")}</h3>
      {meters.map((meter) => {
        const pct = Math.min(100, Math.max(0, Number(meter.percent || 0)));
        const fillClass =
          pct < 50 ? `${styles.meterFill} ${styles.meterFillLow}` : pct < 80 ? `${styles.meterFill} ${styles.meterFillMid}` : styles.meterFill;
        return (
          <div key={meter.key} className={styles.meter}>
            <div className={styles.meterLabel}>{t(meter.label)}</div>
            <div className={styles.meterTrack}>
              <div className={fillClass} style={{ width: `${pct}%` }} />
            </div>
            <div className={styles.meterValue}>{formatPercent(pct)}</div>
          </div>
        );
      })}
    </div>
  );
}

function TopWaits({ waits, t }) {
  return (
    <div className={styles.sideCard}>
      <h3 className={styles.sectionTitle}>{t("processAnalysis.sections.topWaits")}</h3>
      {waits.length === 0 ? (
        <div className={styles.emptyState}>—</div>
      ) : (
        waits.map((wait) => (
          <div key={wait.step_id} className={styles.topWaitRow}>
            <span className={styles.topWaitSeq}>{wait.seq}</span>
            <span className={styles.topWaitTitle} title={wait.title}>{wait.title}</span>
            <span className={styles.topWaitValue}>{wait.wait_min} {t("processAnalysis.unit.min")}</span>
          </div>
        ))
      )}
    </div>
  );
}

function QualitySummary({ quality, t }) {
  return (
    <div className={styles.sideCard}>
      <h3 className={styles.sectionTitle}>{t("processAnalysis.sections.quality")}</h3>
      <div className={styles.qualityRow}>
        <span className={`${styles.qualityBadge} ${styles.qualityBadgeError}`}>{quality.errors_total}</span>
        <span>{t("processAnalysis.sections.qualityErrors")}</span>
      </div>
      <div className={styles.qualityRow}>
        <span className={`${styles.qualityBadge} ${styles.qualityBadgeWarning}`}>{quality.warnings_total}</span>
        <span>{t("processAnalysis.sections.qualityWarnings")}</span>
      </div>
    </div>
  );
}

export function ProcessAnalysisOverview({ model, t }) {
  return (
    <div className={styles.overview} role="tabpanel" id="process-analysis-tab-overview" aria-labelledby="process-analysis-tab-btn-overview">
      <div className={styles.kpiRow}>
        {model.kpi_cards.map((card) => (
          <KpiCard key={card.key} card={card} />
        ))}
      </div>
      <div className={styles.overviewGrid}>
        <div className={styles.leftColumn}>
          <DistributionCard title={t("processAnalysis.sections.distributions") + " — " + t("processAnalysis.coverage.bind")} items={model.distributions.by_lane} valueKey="lead_min" labelKey="name" />
          <DistributionCard title={t("processAnalysis.sections.distributions") + " — " + t("processAnalysis.coverage.ai")} items={model.distributions.by_type} valueKey="lead_min" labelKey="label" />
        </div>
        <div className={styles.sideColumn}>
          <TopWaits waits={model.top_waits} t={t} />
          <CoverageMeters meters={model.coverage} t={t} />
          <QualitySummary quality={model.quality} t={t} />
        </div>
      </div>
    </div>
  );
}
