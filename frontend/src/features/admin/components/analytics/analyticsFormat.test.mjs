import assert from "node:assert/strict";
import test from "node:test";

import { analyticsStatusMeta, formatDateRu, formatDurationSeconds } from "./analyticsFormat.js";

test("formatDurationSeconds: minutes, hours, days", () => {
  assert.equal(formatDurationSeconds(0), "0мин");
  assert.equal(formatDurationSeconds(1800), "30мин");
  assert.equal(formatDurationSeconds(3600), "1ч");
  assert.equal(formatDurationSeconds(50000), "13ч 53мин");
  assert.equal(formatDurationSeconds(200000), "2д 7ч");
  assert.equal(formatDurationSeconds(8 * 86400), "8д");
  assert.equal(formatDurationSeconds(-5), "0мин");
  assert.equal(formatDurationSeconds("abc"), "0мин");
});

test("analyticsStatusMeta maps server statuses", () => {
  assert.equal(analyticsStatusMeta("real_work").label, "Работа");
  assert.equal(analyticsStatusMeta("abandoned").label, "Заброшена");
  assert.equal(analyticsStatusMeta("short").label, "Короткая");
  assert.equal(analyticsStatusMeta("nope").label, "nope");
});

test("formatDateRu formats epoch seconds, guards bad input", () => {
  assert.equal(formatDateRu(0), "—");
  assert.equal(formatDateRu("x"), "—");
  const formatted = formatDateRu(1700000000);
  assert.match(formatted, /^\d{2}\.\d{2}\.\d{4}$/);
});
