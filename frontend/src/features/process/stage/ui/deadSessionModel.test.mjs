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

test("dead session view: локальный черновик есть → restore-действие и честная копи (F2)", () => {
  const view = buildDeadSessionView({
    info: { source: "save:hybrid" },
    hasLocalDraft: true,
  });
  assert.equal(view.actions.restoreLabel, "Восстановить черновик");
  assert.ok(view.contextLines.some((l) => l.includes("можно восстановить")));
  assert.ok(!view.contextLines.some((l) => l.includes("не найдена")));
});

test("dead session view: черновика нет → restore скрыт, копи честная (F2)", () => {
  const view = buildDeadSessionView({ info: { source: "presence" }, hasLocalDraft: false });
  assert.equal(view.actions.restoreLabel, "");
  assert.ok(view.contextLines.some((l) => l.includes("не найдена")));
});

test("dead session view: есть сессия-замена → действие «Открыть актуальную» (F2)", () => {
  const withReplacement = buildDeadSessionView({ info: { source: "save:xml" }, hasReplacement: true });
  assert.equal(withReplacement.actions.openCurrentLabel, "Открыть актуальную");
  const withoutReplacement = buildDeadSessionView({ info: { source: "save:xml" }, hasReplacement: false });
  assert.equal(withoutReplacement.actions.openCurrentLabel, "");
});
