import test from "node:test";
import assert from "node:assert/strict";
import {
  sessionAnalyticsToCards,
  sessionAnalyticsToBarChartItems,
  normalizeProjectAnalyticsCards,
  normalizeWorkspaceAnalyticsCards,
  computeBarChartMax,
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
