import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

test("revision dialogs use RU labels for metadata surface", () => {
  const source = fs.readFileSync(path.join(__dirname, "ProcessDialogs.jsx"), "utf8");
  assert.equal(source.includes("Пользовательские ревизии:"), true);
  assert.equal(source.includes("Последние версии:"), false);
  assert.equal(source.includes("последняя"), true);
  assert.equal(source.includes("Версия"), true);
  assert.equal(source.includes("r{Number("), false);
  assert.equal(source.includes(': "черновик"'), false);
  assert.equal(source.includes(': "без номера ревизии"'), true);
  assert.equal(source.includes("кто изменил:"), true);
  assert.equal(source.includes("что изменилось:"), true);
  assert.equal(source.includes("комментарий:"), true);
  assert.equal(source.includes("хэш:"), true);
  assert.equal(source.includes("размер:"), true);
});

test("revision dialogs separate loading, empty, and error states", () => {
  const source = fs.readFileSync(path.join(__dirname, "ProcessDialogs.jsx"), "utf8");
  assert.equal(source.includes('versionsLoadState === "loading"'), true);
  assert.equal(source.includes('data-testid="bpmn-versions-loading"'), true);
  assert.equal(source.includes('data-testid="bpmn-versions-empty"'), true);
  assert.equal(source.includes('data-testid="bpmn-versions-error"'), true);
  assert.equal(source.includes("Пустая история не означает, что черновик не сохранён."), true);
  assert.equal(source.includes("Новая ревизия появляется отдельным действием при значимом изменении схемы."), true);
  assert.equal(source.includes("Чтобы понять, кто и что изменил, используйте compare-first"), true);
  assert.equal(source.includes("История пуста."), false);
});

test("revision dialogs align empty state text with filtered technical history", () => {
  const source = fs.readFileSync(path.join(__dirname, "ProcessDialogs.jsx"), "utf8");
  assert.equal(source.includes("resolveRevisionHistoryEmptyState"), true);
  assert.equal(source.includes("revisionEmptyState.message"), true);
  assert.equal(source.includes("скрыто технических"), true);
});
