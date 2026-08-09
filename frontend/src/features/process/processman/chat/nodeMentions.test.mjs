// PROCESSMAN-REDESIGN — unit-тесты nodeMentions (anti-false-positives).
import test from "node:test";
import assert from "node:assert/strict";

import {
  MIN_NAME_LEN,
  collectMentionCandidates,
  extractNodeMentions,
  splitTextByMentions,
} from "./nodeMentions.js";

const NODES = [
  { id: "Task_1", name: "Проверка документов" },
  { id: "Task_2", name: "Проверка" },
  { id: "Task_3", name: "И" },            // короткое — не кандидат
  { id: "Task_4", name: "Да" },           // короткое — не кандидат
  { id: "Task_5", name: "Отгрузка готовой продукции" },
  { id: "Task_6", name: "" },             // без имени — не кандидат
];

test("кандидаты: только имена ≥ MIN_NAME_LEN, longest-first", () => {
  const cands = collectMentionCandidates(NODES);
  assert.ok(MIN_NAME_LEN >= 4);
  assert.deepEqual(cands.map((c) => c.id), ["Task_5", "Task_1", "Task_2"]);
});

test("точное совпадение фразы: короткие/общие слова не становятся чипами", () => {
  const text = "И потом проверка. Да, именно так.";
  const mentions = extractNodeMentions(text, NODES);
  assert.deepEqual(mentions.map((m) => m.id), ["Task_2"], "«И»/«Да» игнорируются, «проверка» (case-insensitive) — чип");
  assert.equal(mentions[0].start, 8);
});

test("не подстрока: «Проверка» внутри «Проверка123» и «предпроверка» не срабатывает", () => {
  const text = "Узел Проверка123 и предпроверка не считаются.";
  assert.deepEqual(extractNodeMentions(text, NODES), []);
});

test("longest-match: «Проверка документов» съедает «Проверка» на той же позиции", () => {
  const text = "Сначала Проверка документов, потом отгрузка готовой продукции.";
  const mentions = extractNodeMentions(text, NODES);
  assert.deepEqual(mentions.map((m) => m.id), ["Task_1", "Task_5"]);
  assert.equal(mentions[0].end - mentions[0].start, "Проверка документов".length);
});

test("несколько вхождений одного узла — все чипы", () => {
  const text = "Проверка важна. Повторю: проверка!";
  const mentions = extractNodeMentions(text, NODES);
  assert.equal(mentions.length, 2);
  assert.ok(mentions.every((m) => m.id === "Task_2"));
});

test("splitTextByMentions: сегменты сходятся в исходный текст", () => {
  const text = "Шаг Проверка документов ведёт в Отгрузка готовой продукции, затем стоп.";
  const segments = splitTextByMentions(text, NODES);
  assert.equal(segments.map((s) => (s.kind === "text" ? s.text : s.name)).join(""), text);
  assert.deepEqual(
    segments.filter((s) => s.kind === "mention").map((s) => s.id),
    ["Task_1", "Task_5"],
  );
});

test("пустые входы — пустой результат", () => {
  assert.deepEqual(extractNodeMentions("", NODES), []);
  assert.deepEqual(extractNodeMentions("текст", []), []);
  assert.deepEqual(extractNodeMentions("текст", null), []);
  assert.deepEqual(splitTextByMentions("", NODES), []);
});
