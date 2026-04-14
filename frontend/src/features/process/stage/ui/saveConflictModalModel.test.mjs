import test from "node:test";
import assert from "node:assert/strict";

import {
  buildSaveConflictModalView,
  classifySaveConflictActor,
} from "./saveConflictModalModel.js";

test("classifySaveConflictActor marks actor mismatch as other_user", () => {
  const out = classifySaveConflictActor({
    conflictRaw: {
      actorUserId: "user_other",
      actorLabel: "Анна",
    },
    currentUserIdRaw: "user_me",
  });
  assert.equal(out.kind, "other_user");
  assert.equal(out.actorLabel, "Анна");
});

test("classifySaveConflictActor marks equal actor as same_user", () => {
  const out = classifySaveConflictActor({
    conflictRaw: {
      actorUserId: "USER_ME",
      actorLabel: "Я",
    },
    currentUserIdRaw: "user_me",
  });
  assert.equal(out.kind, "same_user");
});

test("buildSaveConflictModalView returns actor-aware copy and explicit action hints", () => {
  const view = buildSaveConflictModalView({
    currentUserIdRaw: "user_1",
    conflictRaw: {
      actorUserId: "user_2",
      actorLabel: "Иван",
      clientBaseVersion: 7,
      serverCurrentVersion: 8,
      at: 1776147496,
      changedKeys: ["bpmn_xml", "nodes"],
    },
  });
  assert.equal(view.actorMode, "other_user");
  assert.match(view.title, /другой пользователь/i);
  assert.match(view.contextLines.join(" "), /Серверная версия:\s*8/i);
  assert.match(view.contextLines.join(" "), /Ваша базовая версия:\s*7/i);
  assert.match(view.contextLines.join(" "), /Изменения на сервере:/i);
  assert.match(view.contextLines.join(" "), /Изменена схема/i);
  assert.equal(/bpmn_xml|nodes/i.test(view.contextLines.join(" ")), false);
  assert.equal(view.actions.refreshLabel, "Обновить сессию");
  assert.match(view.actions.refreshHint, /заменены/i);
});
