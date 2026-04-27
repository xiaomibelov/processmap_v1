import test from "node:test";
import assert from "node:assert/strict";

import { resolveProcessToastView } from "./processToastMessage.js";

test("process toast prefixes manual save feedback with source", () => {
  const toast = resolveProcessToastView({
    source: "save",
    tone: "success",
    message: "Сохранено внутри версии.",
  });

  assert.equal(toast.source, "save");
  assert.equal(toast.message, "Сохранение: сессия сохранена.");
});

test("process toast normalizes in-flight save and version wording", () => {
  const save = resolveProcessToastView({
    source: "save",
    tone: "info",
    message: "Сохранение...",
  });
  const version = resolveProcessToastView({
    source: "bpmn_version",
    tone: "info",
    message: "Сохранение...",
  });

  assert.equal(save.message, "Сохранение: выполняется...");
  assert.equal(version.message, "Версия BPMN: создание версии...");
});

test("process toast prefixes BPMN version creation without repeating source words", () => {
  const toast = resolveProcessToastView({
    source: "bpmn_version",
    tone: "success",
    message: "Создана новая версия BPMN.",
  });

  assert.equal(toast.source, "bpmn_version");
  assert.equal(toast.message, "Версия BPMN: создана новая версия.");
});

test("process toast classifies conflict and document messages", () => {
  const conflict = resolveProcessToastView({
    tone: "warning",
    message: "Конфликт сохранения (HTTP 409)",
  });
  const document = resolveProcessToastView({
    tone: "info",
    message: "Отчёт сохранён.",
  });

  assert.equal(conflict.source, "conflict");
  assert.match(conflict.message, /^Конфликт:/);
  assert.equal(document.source, "document");
  assert.match(document.message, /^Документ:/);
});
