import test from "node:test";
import assert from "node:assert/strict";

import {
  getProcessMetrics,
  getKpiCards,
  getDistributionLists,
  getCoverageMeters,
  getTopWaits,
  getExtremes,
  formatMinutes,
  formatPercent,
  formatThroughput,
  mapProcessAnalysisViewModel,
  buildSummaryPropsFromProcessMetrics,
} from "./processAnalysisModel.js";
import { ru } from "../../../shared/i18n/ru.js";

function t(key) {
  const keys = key.split(".");
  let current = ru;
  for (const k of keys) {
    if (current == null || typeof current !== "object") return key;
    current = current[k];
  }
  return typeof current === "string" ? current : key;
}

const FULL_VIEW_MODEL = {
  session_id: "s1",
  session_title: "Test Session",
  project_id: "p1",
  project_title: "Test Project",
  workspace_id: "w1",
  analysis: {
    product_actions: { rows: [], summary: {} },
    derived: {
      step_action_counts: { step_1: 1 },
      process_metrics: {
        time: { active_min: 30, wait_min: 10, lead_min: 40, mainline_min: 30, throughput_steps_per_hour: 1.5 },
        counts: { steps_total: 3, steps_bound_to_bpmn: 2, tiers: { P0: 1, P1: 1, P2: 0, None: 1 } },
        coverage: {
          bind_percent: 67,
          ai: { total: 2, done: 1, open: 1, step_coverage_percent: 33 },
          boundaries: { filled: 3, total: 5, percent: 60 },
        },
        distributions: {
          by_type: [{ key: "task", label: "Операция", count: 2, lead_min: 30, share_percent: 67 }],
          by_lane: [{ key: "cook", name: "Повар", count: 2, lead_min: 30, share_percent: 67 }],
          by_subprocess: [{ key: "prep", name: "Приготовление", count: 1, lead_min: 15, share_percent: 33 }],
        },
        top_waits: [{ step_id: "s2", seq: "2", title: "Охлаждение", wait_min: 8 }],
        extremes: {
          max_duration_step: { seq: "1", title: "Нарезка", duration_min: 20 },
          max_wait_step: { seq: "2", title: "Охлаждение", wait_min: 8 },
        },
        exceptions: { count: 1, add_min_total: 5 },
        quality: { errors_total: 0, warnings_total: 1, items: [{ kind: "warning", message: "x" }] },
        path_metrics: { steps_count: 3, work_time_total_sec: 1800, wait_time_total_sec: 600, total_time_sec: 2400 },
        source_state: { source: "process_analysis_read_model", version: "v1", computed_at: 1710000000, diagram_state_version: 7 },
      },
    },
  },
  interview_state: { status: "in_progress" },
};

test("getProcessMetrics returns metrics from view-model", () => {
  const metrics = getProcessMetrics(FULL_VIEW_MODEL);
  assert.equal(metrics.time.active_min, 30);
  assert.equal(metrics.counts.steps_total, 3);
});

test("getProcessMetrics returns fallback for missing metrics", () => {
  const metrics = getProcessMetrics(null);
  assert.equal(metrics.time.active_min, 0);
  assert.equal(metrics.counts.steps_total, 0);
});

test("getKpiCards builds cards with labels", () => {
  const cards = getKpiCards(FULL_VIEW_MODEL.analysis.derived.process_metrics, t);
  assert.equal(cards.length, 7);
  assert.equal(cards[0].key, "lead");
  assert.equal(cards[0].label, "Lead time");
  assert.equal(cards[0].value, 40);
  const labels = cards.map((c) => c.label);
  assert.ok(!labels.some((l) => l.includes("processAnalysis.")), "KPI labels must not contain raw i18n keys");
});

test("getDistributionLists returns lists", () => {
  const dist = getDistributionLists(FULL_VIEW_MODEL.analysis.derived.process_metrics);
  assert.equal(dist.by_lane.length, 1);
  assert.equal(dist.by_type.length, 1);
  assert.equal(dist.by_subprocess.length, 1);
});

test("getCoverageMeters returns meters", () => {
  const meters = getCoverageMeters(FULL_VIEW_MODEL.analysis.derived.process_metrics);
  assert.equal(meters.length, 3);
  assert.equal(meters[0].percent, 67);
});

test("getTopWaits returns top waits", () => {
  const waits = getTopWaits(FULL_VIEW_MODEL.analysis.derived.process_metrics);
  assert.equal(waits.length, 1);
  assert.equal(waits[0].title, "Охлаждение");
});

test("getExtremes returns extremes", () => {
  const extremes = getExtremes(FULL_VIEW_MODEL.analysis.derived.process_metrics);
  assert.equal(extremes.max_duration_step.title, "Нарезка");
});

test("formatters", () => {
  assert.equal(formatMinutes(12.6), "13");
  assert.equal(formatPercent(66.666), "67%");
  assert.equal(formatThroughput(1.5), "1.5");
  assert.equal(formatThroughput(2), "2");
});

test("mapProcessAnalysisViewModel builds full model", () => {
  const model = mapProcessAnalysisViewModel(FULL_VIEW_MODEL, t);
  assert.equal(model.session_id, "s1");
  assert.equal(model.kpi_cards.length, 7);
  assert.equal(model.distributions.by_lane.length, 1);
  assert.equal(model.coverage.length, 3);
  assert.equal(model.top_waits.length, 1);
  assert.equal(model.exceptions.count, 1);
  assert.equal(model.quality.warnings_total, 1);
  assert.equal(model.path_metrics.steps_count, 3);
  assert.equal(model.source_state.diagram_state_version, 7);
  assert.ok(!model.kpi_cards.some((c) => c.label.includes("processAnalysis.")), "KPI labels must not contain raw i18n keys");
});

test("buildSummaryPropsFromProcessMetrics adapts read-model to SummaryBlock props", () => {
  const props = buildSummaryPropsFromProcessMetrics(FULL_VIEW_MODEL.analysis.derived.process_metrics);
  assert.equal(props.collapsed, false);
  assert.equal(typeof props.toggleBlock, "function");
  assert.equal(props.extendedAnalytics.stepsPerHour, 1.5);
  assert.equal(props.extendedAnalytics.maxDurationStep.seq, "1");
  assert.equal(props.extendedAnalytics.maxWaitStep.seq, "2");
  assert.equal(props.extendedAnalytics.exceptionAddMinTotal, 5);
  assert.equal(props.topWaits.length, 1);
  assert.equal(props.topWaits[0].action, "Охлаждение");
  assert.equal(props.exceptionsCount, 1);
  assert.equal(props.dodSnapshot.counts.interview.stepsTotal, 3);
  assert.equal(props.dodSnapshot.counts.interview.stepsBoundToBpmn, 2);
  assert.equal(props.dodSnapshot.time.processTotalSec, 1800);
});

test("buildSummaryPropsFromProcessMetrics falls back for missing metrics", () => {
  const props = buildSummaryPropsFromProcessMetrics(null);
  assert.equal(props.collapsed, false);
  assert.equal(props.extendedAnalytics.stepsPerHour, 0);
  assert.equal(props.topWaits.length, 0);
  assert.equal(props.exceptionsCount, 0);
  assert.equal(props.dodSnapshot.counts.interview.stepsTotal, 0);
});
