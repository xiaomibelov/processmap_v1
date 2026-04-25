import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

test("revision dialogs use RU labels for metadata surface", () => {
  const source = fs.readFileSync(path.join(__dirname, "ProcessDialogs.jsx"), "utf8");
  assert.equal(source.includes("История версий BPMN"), true);
  assert.equal(source.includes("Пользовательские версии:"), true);
  assert.equal(source.includes("Пользовательские ревизии:"), false);
  assert.equal(source.includes("Последние версии:"), false);
  assert.equal(source.includes("последняя"), true);
  assert.equal(source.includes("Версия"), true);
  assert.equal(source.includes("нет опубликованных версий"), true);
  assert.equal(source.includes("r{Number("), false);
  assert.equal(source.includes(': "черновик"'), false);
  assert.equal(source.includes(': "без номера ревизии"'), false);
  assert.equal(source.includes(': "без номера версии"'), true);
  assert.equal(source.includes("кто изменил:"), true);
  assert.equal(source.includes("что изменилось:"), true);
  assert.equal(source.includes("с соседней версией"), true);
  assert.equal(source.includes("комментарий:"), true);
  assert.equal(source.includes("хэш:"), true);
  assert.equal(source.includes("размер:"), true);
  assert.equal(source.includes("Версия A (база)"), true);
  assert.equal(source.includes("Версия B (цель)"), true);
});

test("revision dialogs separate loading, empty, and error states", () => {
  const source = fs.readFileSync(path.join(__dirname, "ProcessDialogs.jsx"), "utf8");
  assert.equal(source.includes('versionsLoadState === "loading"'), true);
  assert.equal(source.includes('data-testid="bpmn-versions-loading"'), true);
  assert.equal(source.includes('data-testid="bpmn-versions-empty"'), true);
  assert.equal(source.includes('data-testid="bpmn-versions-error"'), true);
  assert.equal(source.includes("Пустая история не означает, что черновик не сохранён."), true);
  assert.equal(source.includes("Новая версия создаётся отдельным действием кнопкой «Создать новую версию»."), true);
  assert.equal(source.includes("Чтобы понять, кто и что изменил, используйте compare-first"), true);
  assert.equal(source.includes("История ревизий ещё не загружена."), false);
  assert.equal(source.includes("История версий ещё не загружена."), true);
});

test("revision dialogs align empty state text with filtered technical history", () => {
  const source = fs.readFileSync(path.join(__dirname, "ProcessDialogs.jsx"), "utf8");
  assert.equal(source.includes("resolveRevisionHistoryEmptyState"), true);
  assert.equal(source.includes("revisionEmptyState.message"), true);
  assert.equal(source.includes("скрыто технических"), true);
});
