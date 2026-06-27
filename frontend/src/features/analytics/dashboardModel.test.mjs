import test from "node:test";
import assert from "node:assert/strict";
import {
  sessionAnalyticsToCards,
  sessionAnalyticsToBarChartItems,
  normalizeProjectAnalyticsCards,
  normalizeWorkspaceAnalyticsCards,
  computeBarChartMax,
  dashboardDataToKpiCards,
  dashboardDataToTaskStatusItems,
  dashboardDataToBpmnElementItems,
  dashboardDataToSessionTrendItems,
  dashboardDataToProcessDurationItems,
  hasActivityHeatmapData,
} from "./dashboardModel.js";

test("sessionAnalyticsToCards returns 4 metric cards", () => {
  const analytics = {
    timing: { total_duration_min: 120, critical_path_min: 90 },
    actions: { total: 15 },
    handoffs: { count: 3 },
    coverage: { open_questions: 2, critical_questions: 1 },
  };
  const cards = sessionAnalyticsToCards(analytics);
  assert.equal(cards.length, 4);
  assert.equal(cards[0].title, "Длительность");
  assert.equal(cards[0].value, "120 мин");
  assert.equal(cards[1].title, "Действий");
  assert.equal(cards[1].value, "15");
  assert.equal(cards[2].title, "Передач между ролями");
  assert.equal(cards[2].value, "3");
  assert.equal(cards[3].title, "Открытые вопросы");
  assert.equal(cards[3].value, "2");
  assert.equal(cards[3].tone, "danger");
});

test("sessionAnalyticsToBarChartItems converts by_role to chart items", () => {
  const analytics = {
    actions: {
      by_role: { chef: 5, operator: 3, qc: 2 },
    },
  };
  const items = sessionAnalyticsToBarChartItems(analytics);
  assert.equal(items.length, 3);
  assert.ok(items.every((i) => typeof i.max === "number" && i.max > 0));
});

test("normalizeProjectAnalyticsCards returns correct cards", () => {
  const data = {
    sessions_count: 10,
    total_actions: 150,
    avg_duration_min: 45.5,
    total_critical_questions: 2,
  };
  const cards = normalizeProjectAnalyticsCards(data);
  assert.equal(cards.length, 4);
  assert.equal(cards[0].value, "10");
  assert.equal(cards[1].value, "150");
  assert.equal(cards[2].value, "45.5 мин");
  assert.equal(cards[3].value, "2");
  assert.equal(cards[3].tone, "warning");
});

test("normalizeWorkspaceAnalyticsCards returns correct cards", () => {
  const data = {
    projects_count: 3,
    sessions_count: 12,
    total_actions: 200,
    avg_duration_min: 30,
  };
  const cards = normalizeWorkspaceAnalyticsCards(data);
  assert.equal(cards.length, 4);
  assert.equal(cards[0].value, "3");
  assert.equal(cards[1].value, "12");
  assert.equal(cards[2].value, "200");
  assert.equal(cards[3].value, "30.0 мин");
});

test("computeBarChartMax returns 1 for empty items", () => {
  assert.equal(computeBarChartMax([]), 1);
});

test("computeBarChartMax returns max value", () => {
  assert.equal(computeBarChartMax([{ value: 5 }, { value: 10 }, { value: 3 }]), 10);
});

test("dashboardDataToKpiCards returns 5 KPI cards", () => {
  const kpi = {
    total_sessions: 10,
    total_tasks: 120,
    active_now: 2,
    avg_session_duration_min: 45,
    unique_processes: 3,
  };
  const cards = dashboardDataToKpiCards(kpi);
  assert.equal(cards.length, 5);
  assert.equal(cards[0].value, "10");
  assert.equal(cards[1].value, "120");
  assert.equal(cards[2].value, "2");
  assert.equal(cards[3].value, "45 мин");
  assert.equal(cards[4].value, "3");
});

test("dashboardDataToTaskStatusItems maps statuses and filters zero values", () => {
  const items = dashboardDataToTaskStatusItems({
    task_statuses: { completed: 5, active: 3, pending: 0, failed: 1 },
  });
  assert.equal(items.length, 3);
  assert.equal(items[0].label, "Выполнено");
  assert.equal(items[0].value, 5);
  assert.equal(items[1].label, "Активно");
  assert.equal(items[2].label, "Сбой");
});

test("dashboardDataToBpmnElementItems maps BPMN types", () => {
  const items = dashboardDataToBpmnElementItems({
    bpmn_element_types: { task: 10, gateway: 4, event: 2, subprocess: 0 },
  });
  assert.equal(items.length, 3);
  assert.equal(items[0].label, "Задачи");
  assert.equal(items[0].value, 10);
  assert.equal(items[1].label, "Шлюзы");
  assert.equal(items[2].label, "События");
});

test("dashboardDataToSessionTrendItems converts points", () => {
  const items = dashboardDataToSessionTrendItems({
    session_trend: {
      points: [{ period: "2024-01-15", sessions: 3 }, { period: "2024-01-16", sessions: 5 }],
    },
  });
  assert.equal(items.length, 2);
  assert.equal(items[0].label, "01-15");
  assert.equal(items[0].value, 3);
  assert.equal(items[1].label, "01-16");
});

test("dashboardDataToProcessDurationItems converts process duration list", () => {
  const items = dashboardDataToProcessDurationItems({
    process_duration: [
      { process_title: "Процесс А", avg_duration_min: 120, sessions_count: 5 },
      { process_title: "Процесс Б", avg_duration_min: 80, sessions_count: 3 },
    ],
  });
  assert.equal(items.length, 2);
  assert.equal(items[0].label, "Процесс А");
  assert.equal(items[0].value, 120);
  assert.equal(items[0].sessions_count, 5);
});

test("hasActivityHeatmapData detects non-empty heatmap", () => {
  assert.equal(hasActivityHeatmapData({}), false);
  assert.equal(hasActivityHeatmapData({ activity_heatmap: { by_hour: [0, 1, 0], by_weekday: [0, 0, 0] } }), true);
  assert.equal(hasActivityHeatmapData({ activity_heatmap: { by_hour: [0, 0, 0], by_weekday: [0, 0, 0] } }), false);
});
