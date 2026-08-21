import test from "node:test";
import assert from "node:assert/strict";

import { scoreClass, formatElementContext, SOURCE_TYPE_LABELS, indexStatusClass, extractBpmnName, extractBpmnId, makeBpmnResultTitle, formatScore, getSourceTypeLabel } from "./RagSearchPanel.helpers.js";

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

// -------- extractBpmnName --------

test("extractBpmnName extracts name with double quotes", () => {
  assert.equal(extractBpmnName('<bpmn:exclusiveGateway id="Gateway_1" name="Вид топпинга">'), "Вид топпинга");
});

test("extractBpmnName extracts name with single quotes", () => {
  assert.equal(extractBpmnName("<bpmn:task id='t1' name='Нарезка'>"), "Нарезка");
});

test("extractBpmnName returns empty for XML without name", () => {
  assert.equal(extractBpmnName('<bpmn:sequenceFlow id="f1" sourceRef="t1" targetRef="t2"/>'), "");
});

test("extractBpmnName returns empty for empty/null input", () => {
  assert.equal(extractBpmnName(""), "");
  assert.equal(extractBpmnName(null), "");
  assert.equal(extractBpmnName(undefined), "");
});

// -------- extractBpmnId --------

test("extractBpmnId extracts id attribute", () => {
  assert.equal(extractBpmnId('<bpmn:exclusiveGateway id="Gateway_0558786" name="Вид">'), "Gateway_0558786");
});

test("extractBpmnId returns empty for no id", () => {
  assert.equal(extractBpmnId("no id here"), "");
});

// -------- makeBpmnResultTitle --------

test("makeBpmnResultTitle returns name when present in chunk_text", () => {
  const meta = { element_tag: "exclusiveGateway", element_index: 5 };
  assert.equal(makeBpmnResultTitle(meta, '<bpmn:exclusiveGateway id="g1" name="Вид топпинга">'), "Вид топпинга");
});

test("makeBpmnResultTitle returns element_tag when no name in chunk_text", () => {
  const meta = { element_tag: "sequenceFlow", element_index: 2 };
  assert.equal(makeBpmnResultTitle(meta, '<bpmn:sequenceFlow id="f1" sourceRef="t1" targetRef="t2"/>'), "sequenceFlow");
});

test("makeBpmnResultTitle returns BPMN фрагмент when neither name nor tag", () => {
  assert.equal(makeBpmnResultTitle({}, "some plain text without xml"), "BPMN фрагмент");
});

test("makeBpmnResultTitle prefers metadata.element_name over regex", () => {
  const meta = { element_name: "Сервер-имя", element_tag: "exclusiveGateway" };
  assert.equal(makeBpmnResultTitle(meta, '<bpmn:exclusiveGateway id="g1" name="Regex-имя">'), "Сервер-имя");
});

test("makeBpmnResultTitle falls back to regex when element_name absent", () => {
  const meta = { element_tag: "exclusiveGateway", element_index: 0 };
  assert.equal(makeBpmnResultTitle(meta, '<bpmn:exclusiveGateway id="g1" name="Regex-имя">'), "Regex-имя");
});

test("makeBpmnResultTitle falls back to element_name even when regex also matches — server wins", () => {
  const meta = { element_name: "Серверное название", element_tag: "task" };
  assert.equal(makeBpmnResultTitle(meta, '<bpmn:task id="t1" name="Другое">'), "Серверное название");
});

test("makeBpmnResultTitle with element_name=null falls back to regex", () => {
  const meta = { element_name: null, element_tag: "task" };
  assert.equal(makeBpmnResultTitle(meta, '<bpmn:task id="t1" name="Нарезка">'), "Нарезка");
});

// -------- formatScore --------

test("formatScore rounds to 2 decimal places", () => {
  assert.equal(formatScore(4.808), "4.81");
  assert.equal(formatScore(5), "5.00");
  assert.equal(formatScore(2.1), "2.10");
});

test("formatScore returns — for non-number", () => {
  assert.equal(formatScore(null), "—");
  assert.equal(formatScore(undefined), "—");
  assert.equal(formatScore("text"), "—");
});

// -------- getSourceTypeLabel --------

test("getSourceTypeLabel returns BPMN XML for bpmn_xml", () => {
  assert.equal(getSourceTypeLabel("bpmn_xml"), "BPMN XML");
});

test("getSourceTypeLabel returns Продуктовое действие for product_action", () => {
  assert.equal(getSourceTypeLabel("product_action"), "Продуктовое действие");
});

test("getSourceTypeLabel passes through unknown type", () => {
  assert.equal(getSourceTypeLabel("unknown_type"), "unknown_type");
});

test("getSourceTypeLabel returns Источник for empty/null", () => {
  assert.equal(getSourceTypeLabel(""), "Источник");
  assert.equal(getSourceTypeLabel(null), "Источник");
});
