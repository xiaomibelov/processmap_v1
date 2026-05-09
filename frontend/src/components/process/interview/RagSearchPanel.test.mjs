import test from "node:test";
import assert from "node:assert/strict";

import { scoreClass, formatElementContext, SOURCE_TYPE_LABELS, indexStatusClass } from "./RagSearchPanel.helpers.js";

// -------- scoreClass --------

test("scoreClass returns ragScoreHigh for score >= 5", () => {
  assert.equal(scoreClass(5), "ragScoreHigh");
  assert.equal(scoreClass(7.2), "ragScoreHigh");
});

test("scoreClass returns ragScoreMed for score >= 2 and < 5", () => {
  assert.equal(scoreClass(2), "ragScoreMed");
  assert.equal(scoreClass(4.99), "ragScoreMed");
});

test("scoreClass returns ragScoreLow for score < 2", () => {
  assert.equal(scoreClass(1.99), "ragScoreLow");
  assert.equal(scoreClass(0), "ragScoreLow");
  assert.equal(scoreClass(-1), "ragScoreLow");
});

// -------- formatElementContext --------

test("formatElementContext returns empty string when no element_tag", () => {
  assert.equal(formatElementContext({}), "");
  assert.equal(formatElementContext(null), "");
  assert.equal(formatElementContext(undefined), "");
});

test("formatElementContext returns tag alone when no element_index", () => {
  assert.equal(formatElementContext({ element_tag: "task" }), "task");
});

test("formatElementContext returns tag #index when both present", () => {
  assert.equal(formatElementContext({ element_tag: "gateway", element_index: 3 }), "gateway #3");
});

test("formatElementContext handles element_index = 0", () => {
  assert.equal(formatElementContext({ element_tag: "event", element_index: 0 }), "event #0");
});

// -------- SOURCE_TYPE_LABELS --------

test("SOURCE_TYPE_LABELS maps bpmn_xml", () => {
  assert.equal(SOURCE_TYPE_LABELS.bpmn_xml, "BPMN XML");
});

test("SOURCE_TYPE_LABELS maps product_action", () => {
  assert.equal(SOURCE_TYPE_LABELS.product_action, "Продуктовое действие");
});

// -------- indexStatusClass --------

test("indexStatusClass returns empty string for falsy input", () => {
  assert.equal(indexStatusClass(""), "");
  assert.equal(indexStatusClass(null), "");
  assert.equal(indexStatusClass(undefined), "");
});

test("indexStatusClass returns ragIndexBadgeErr for error text", () => {
  assert.equal(indexStatusClass("Ошибка: unknown"), "ragIndexBadgeErr");
  assert.equal(indexStatusClass("Ошибка: timeout"), "ragIndexBadgeErr");
});

test("indexStatusClass returns ragIndexBadgeNoop for no-change text", () => {
  assert.equal(indexStatusClass("Без изменений (хэш совпадает)"), "ragIndexBadgeNoop");
});

test("indexStatusClass returns ragIndexBadgeOk for success text", () => {
  assert.equal(indexStatusClass("Проиндексировано: 5 чанков"), "ragIndexBadgeOk");
});
