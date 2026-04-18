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
    currentUserRaw: {
      user_id: "user_me",
      id: "ext_me",
      email: "me@example.com",
    },
  });
  assert.equal(out.kind, "other_user");
  assert.equal(out.actorLabel, "Анна");
});

test("classifySaveConflictActor marks equal actor as same_user_other_tab", () => {
  const out = classifySaveConflictActor({
    conflictRaw: {
      actorUserId: "USER_INTERNAL_42",
      actorLabel: "Я",
    },
    currentUserRaw: {
      id: "external_provider_id",
      user_id: "user_internal_42",
      email: "me@example.com",
    },
    currentUserIdRaw: "external_provider_id",
  });
  assert.equal(out.kind, "same_user_other_tab");
});

test("classifySaveConflictActor uses email fallback when actor_user_id is missing", () => {
  const out = classifySaveConflictActor({
    conflictRaw: {
      actorUserId: "",
      actorLabel: "Me@Example.com",
    },
    currentUserRaw: {
      id: "external_provider_id",
      user_id: "user_internal_42",
      email: "me@example.com",
    },
  });
  assert.equal(out.kind, "same_user_other_tab");
});

test("classifySaveConflictActor falls back to unknown when current user identity is unavailable", () => {
  const out = classifySaveConflictActor({
    conflictRaw: {
      actorUserId: "user_other",
      actorLabel: "Анна",
    },
    currentUserRaw: {},
    currentUserIdRaw: "",
  });
  assert.equal(out.kind, "fallback_unknown");
});

test("buildSaveConflictModalView returns actor-aware copy and explicit action hints", () => {
  const view = buildSaveConflictModalView({
    currentUserRaw: {
      user_id: "user_1",
      email: "user_1@example.com",
    },
    currentUserIdRaw: "ext_user_1",
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

test("buildSaveConflictModalView keeps neutral copy for fallback_unknown", () => {
  const view = buildSaveConflictModalView({
    currentUserRaw: {},
    currentUserIdRaw: "",
    conflictRaw: {
      actorUserId: "user_2",
      actorLabel: "Иван",
      clientBaseVersion: 7,
      serverCurrentVersion: 8,
    },
  });
  assert.equal(view.actorMode, "fallback_unknown");
  assert.match(view.title, /Конфликт версии сессии/i);
  assert.match(view.lead, /версия сессии изменилась/i);
});
