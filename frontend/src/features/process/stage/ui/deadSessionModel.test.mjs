import test from "node:test";
import assert from "node:assert/strict";

import { buildDeadSessionView } from "./deadSessionModel.js";

test("dead session view: базовый контент и действия (P-1 D3)", () => {
  const view = buildDeadSessionView({
    info: { sessionId: "s1", source: "save:xml", at: 1 },
    sessionTitle: "Разогрев супа",
    canCreate: true,
  });
  assert.equal(view.title, "Сессия удалена или недоступна");
  assert.ok(view.lead.includes("Разогрев супа"));
  assert.ok(view.lead.includes("удалена"));
  assert.ok(view.contextLines.some((l) => l.includes("сохранение")));
  assert.equal(view.actions.backLabel, "К списку сессий");
  assert.equal(view.actions.createLabel, "Создать новую");
});

test("dead session view: без title и без права создания", () => {
  const view = buildDeadSessionView({ info: { source: "presence" }, canCreate: false });
  assert.ok(!view.lead.includes("«"));
  assert.ok(view.contextLines.some((l) => l.includes("синхронизация присутствия")));
  assert.equal(view.actions.createLabel, "");
});

test("dead session view: null-info → unknown source, модал всё равно осмысленный", () => {
  const view = buildDeadSessionView({ info: null });
  assert.equal(view.title, "Сессия удалена или недоступна");
  assert.ok(view.contextLines.some((l) => l.includes("запрос к серверу")));
});

test("dead session view: hasReplacement → действие «Открыть актуальную», без него — пусто", () => {
  const withReplacement = buildDeadSessionView({ info: { source: "save" }, hasReplacement: true });
  assert.equal(withReplacement.actions.openCurrentLabel, "Открыть актуальную");
  assert.ok(withReplacement.actions.openCurrentHint);

  const without = buildDeadSessionView({ info: { source: "save" }, hasReplacement: false });
  assert.equal(without.actions.openCurrentLabel, "");
});

test("dead session view: hasLocalDraft → действие «Восстановить черновик» + контекстная строка", () => {
  const withDraft = buildDeadSessionView({ info: { source: "save" }, hasLocalDraft: true });
  assert.equal(withDraft.actions.restoreLabel, "Восстановить черновик");
  assert.ok(withDraft.contextLines.some((l) => l.includes("локальная копия") && l.includes("можно восстановить")));

  const without = buildDeadSessionView({ info: { source: "save" }, hasLocalDraft: false });
  assert.equal(without.actions.restoreLabel, "");
  assert.ok(without.contextLines.some((l) => l.includes("не найдена")));
});
