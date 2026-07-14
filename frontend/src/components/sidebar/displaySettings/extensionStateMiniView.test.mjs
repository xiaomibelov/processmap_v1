import assert from "node:assert/strict";
import test from "node:test";

import { extensionStateMiniView } from "./extensionStateMiniView.js";

test("mini view: saved -> check icon, green-ish tone, saved tooltip", () => {
  const view = extensionStateMiniView("saved");
  assert.equal(view.icon, "check");
  assert.equal(view.tone, "saved");
  assert.equal(view.tooltip, "Сохранено");
});

test("mini view: local -> pencil icon, dirty tone, unsaved tooltip", () => {
  const view = extensionStateMiniView("local");
  assert.equal(view.icon, "pencil");
  assert.equal(view.tone, "dirty");
  assert.equal(view.tooltip, "Есть несохранённые изменения");
});

test("mini view: syncing/refreshing -> spinner tone", () => {
  assert.equal(extensionStateMiniView("syncing").tone, "syncing");
  assert.equal(extensionStateMiniView("refreshing").tone, "syncing");
  assert.equal(extensionStateMiniView("syncing").icon, "sync");
});

test("mini view: error -> alert tone with retry tooltip", () => {
  const view = extensionStateMiniView("error");
  assert.equal(view.tone, "error");
  assert.equal(view.icon, "alert");
  assert.match(view.tooltip, /Ошибка/);
});

test("mini view: unknown/empty states fall back to saved", () => {
  assert.equal(extensionStateMiniView("").tone, "saved");
  assert.equal(extensionStateMiniView(null).tone, "saved");
  assert.equal(extensionStateMiniView("whatever").tone, "saved");
});
