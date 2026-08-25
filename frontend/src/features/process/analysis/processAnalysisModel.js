import { toText, toArray } from "../../../components/process/interview/utils.js";

function asObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

const FALLBACK_METRICS = {
  time: { active_min: 0, wait_min: 0, lead_min: 0, mainline_min: 0, throughput_steps_per_hour: 0 },
  counts: { steps_total: 0, steps_bound_to_bpmn: 0, tiers: { P0: 0, P1: 0, P2: 0, None: 0 } },
  coverage: {
    bind_percent: 0,
    ai: { total: 0, done: 0, open: 0, step_coverage_percent: 0 },
    boundaries: { filled: 0, total: 5, percent: 0 },
  },
  distributions: { by_type: [], by_lane: [], by_subprocess: [] },
  top_waits: [],
  extremes: { max_duration_step: null, max_wait_step: null },
  exceptions: { count: 0, add_min_total: 0 },
  quality: { errors_total: 0, warnings_total: 0, items: [] },
  path_metrics: { steps_count: 0, work_time_total_sec: 0, wait_time_total_sec: 0, total_time_sec: 0 },
  source_state: { source: "process_analysis_read_model", version: "v1", computed_at: 0, diagram_state_version: 0 },
};

export function getProcessMetrics(viewModel) {
  const derived = asObject(asObject(viewModel).analysis).derived;
  const processMetrics = asObject(derived?.process_metrics);
  if (!processMetrics || !processMetrics.time) return FALLBACK_METRICS;
  return processMetrics;
}

export function getKpiCards(metrics, t) {
  const time = asObject(metrics?.time);
  const counts = asObject(metrics?.counts);
  const coverage = asObject(metrics?.coverage);
  const stepsTotal = Number(counts?.steps_total || 0);
  const leadMin = Number(time.lead_min || 0);
  const bindPercent = Number(coverage?.bind_percent || 0);
  return [
    {
      key: "lead",
      label: t("processAnalysis.kpi.lead"),
      value: leadMin,
      unit: t("processAnalysis.unit.min"),
      tone: "neutral",
    },
    {
      key: "active",
      label: t("processAnalysis.kpi.active"),
      value: Number(time.active_min || 0),
      unit: t("processAnalysis.unit.min"),
      tone: "info",
    },
    {
      key: "wait",
      label: t("processAnalysis.kpi.wait"),
      value: Number(time.wait_min || 0),
      unit: t("processAnalysis.unit.min"),
      tone: "warning",
    },
    {
      key: "mainline",
      label: t("processAnalysis.kpi.mainline") || "Mainline время",
      value: Number(time.mainline_min || 0),
      unit: t("processAnalysis.unit.min"),
      tone: "info",
    },
    {
      key: "avg_step",
      label: t("processAnalysis.kpi.avgStep") || "Средняя длительность шага",
      value: stepsTotal > 0 ? Math.round(leadMin / stepsTotal) : 0,
      unit: t("processAnalysis.unit.min"),
      tone: "neutral",
    },
    {
      key: "bpmn_binding",
      label: t("processAnalysis.kpi.bpmnBinding") || "Привязка к BPMN",
      value: bindPercent,
      unit: "%",
      tone: bindPercent >= 80 ? "success" : bindPercent >= 50 ? "warning" : "danger",
    },
    {
      key: "throughput",
      label: t("processAnalysis.kpi.throughput"),
      value: Number(time.throughput_steps_per_hour || 0),
      unit: t("processAnalysis.unit.stepsPerHour"),
      tone: "success",
    },
  ];
}

export function getDistributionLists(metrics) {
  const distributions = asObject(metrics?.distributions);
  return {
    by_lane: toArray(distributions?.by_lane),
    by_type: toArray(distributions?.by_type),
    by_subprocess: toArray(distributions?.by_subprocess),
  };
}

export function getCoverageMeters(metrics) {
  const coverage = asObject(metrics?.coverage);
  const ai = asObject(coverage?.ai);
  const boundaries = asObject(coverage?.boundaries);
  return [
    { key: "bind", label: "processAnalysis.coverage.bind", percent: Number(coverage?.bind_percent || 0) },
    { key: "ai", label: "processAnalysis.coverage.ai", percent: Number(ai?.step_coverage_percent || 0) },
    { key: "boundaries", label: "processAnalysis.coverage.boundaries", percent: Number(boundaries?.percent || 0) },
  ];
}

export function getTopWaits(metrics) {
  return toArray(metrics?.top_waits);
}

export function getExtremes(metrics) {
  return asObject(metrics?.extremes);
}

export function getExceptionsSummary(metrics) {
  return asObject(metrics?.exceptions);
}

export function getQualitySummary(metrics) {
  return asObject(metrics?.quality);
}

export function getPathMetrics(metrics) {
  return asObject(metrics?.path_metrics);
}

const SECONDS_PER_MINUTE = 60;

export function buildSummaryPropsFromProcessMetrics(processMetrics) {
  const metrics = processMetrics && typeof processMetrics === "object" ? processMetrics : FALLBACK_METRICS;
  const time = asObject(metrics.time);
  const counts = asObject(metrics.counts);
  const coverage = asObject(metrics.coverage);
  const ai = asObject(coverage.ai);
  const tiers = asObject(counts.tiers);
  const distributions = asObject(metrics.distributions);
  const extremes = asObject(metrics.extremes);
  const exceptions = asObject(metrics.exceptions);
  const topWaits = toArray(metrics.top_waits);

  const activeMin = Number(time.active_min || 0);
  const waitMin = Number(time.wait_min || 0);
  const mainlineMin = Number(time.mainline_min || 0);
  const stepsTotal = Number(counts.steps_total || 0);
  const boundSteps = Number(counts.steps_bound_to_bpmn || 0);
  const aiTotal = Number(ai.total || 0);
  const aiDone = Number(ai.done || 0);
  const aiOpen = Number(ai.open || 0);

  const dodSnapshot = {
    counts: {
      interview: {
        stepsTotal,
        stepsBoundToBpmn: boundSteps,
        aiQuestionsTotal: aiTotal,
        aiQuestionsDoneTotal: aiDone,
        aiQuestionsOpenTotal: aiOpen,
        exceptionsTotal: Number(exceptions.count || 0),
        tiers: {
          P0: Number(tiers.P0 || 0),
          P1: Number(tiers.P1 || 0),
          P2: Number(tiers.P2 || 0),
          None: Number(tiers.None || 0),
        },
      },
    },
    time: {
      processTotalSec: activeMin * SECONDS_PER_MINUTE,
      mainlineTotalSec: mainlineMin * SECONDS_PER_MINUTE,
      waitTotalSec: waitMin * SECONDS_PER_MINUTE,
    },
  };

  const mapDistribution = (item) => ({
    key: item.key,
    label: item.label,
    name: item.name,
    count: item.count,
    sharePct: item.share_percent,
    lead: item.lead_min,
  });

  const extendedAnalytics = {
    stepsPerHour: Number(time.throughput_steps_per_hour || 0),
    maxDurationStep: extremes.max_duration_step
      ? {
          seq: extremes.max_duration_step.seq,
          duration: extremes.max_duration_step.duration_min,
        }
      : null,
    maxWaitStep: extremes.max_wait_step
      ? {
          seq: extremes.max_wait_step.seq,
          wait: extremes.max_wait_step.wait_min,
        }
      : null,
    exceptionAddMinTotal: Number(exceptions.add_min_total || 0),
    typeStats: toArray(distributions.by_type).map(mapDistribution),
    laneStats: toArray(distributions.by_lane).map(mapDistribution),
    subprocessStats: toArray(distributions.by_subprocess).map(mapDistribution),
  };

  return {
    collapsed: false,
    toggleBlock: () => {},
    extendedAnalytics,
    topWaits: topWaits.map((x) => ({
      id: x.step_id,
      seq: x.seq,
      action: x.title,
      wait: x.wait_min,
    })),
    exceptionsCount: Number(exceptions.count || 0),
    dodSnapshot,
  };
}

export function formatPercent(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "0%";
  return `${Math.round(n)}%`;
}

export function formatMinutes(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "0";
  return String(Math.round(n));
}

export function formatThroughput(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "0";
  return n % 1 === 0 ? String(n) : n.toFixed(1);
}

export function mapProcessAnalysisViewModel(viewModel, t) {
  const metrics = getProcessMetrics(viewModel);
  return {
    session_id: toText(viewModel?.session_id),
    session_title: toText(viewModel?.session_title) || toText(viewModel?.session_id),
    project_id: toText(viewModel?.project_id),
    project_title: toText(viewModel?.project_title),
    workspace_id: toText(viewModel?.workspace_id),
    interview_state: asObject(viewModel?.interview_state),
    product_actions: asObject(asObject(viewModel?.analysis).product_actions),
    step_action_counts: asObject(asObject(asObject(viewModel?.analysis).derived).step_action_counts),
    metrics,
    kpi_cards: getKpiCards(metrics, t),
    distributions: getDistributionLists(metrics),
    coverage: getCoverageMeters(metrics),
    top_waits: getTopWaits(metrics),
    extremes: getExtremes(metrics),
    exceptions: getExceptionsSummary(metrics),
    quality: getQualitySummary(metrics),
    path_metrics: getPathMetrics(metrics),
    source_state: asObject(metrics?.source_state),
  };
}
