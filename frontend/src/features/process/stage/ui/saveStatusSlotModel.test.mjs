import test from "node:test";
import assert from "node:assert/strict";

import {
  buildSaveStatusSlotView,
  stripSaveStatusSlotPrefix,
} from "./saveStatusSlotModel.js";

test("slot state precedence: conflict dominates any snapshot state", () => {
  const view = buildSaveStatusSlotView({
    saveUploadStatusRaw: { state: "conflict", label: "Конфликт сохранения", title: "Сервер отклонил сохранение." },
    saveSnapshotRaw: { isSaving: true },
  });
  assert.equal(view.state, "conflict");
  assert.equal(view.label.length > 0, true);
});

test("slot state precedence: saving beats failed/dirty/saved", () => {
  const view = buildSaveStatusSlotView({
    saveUploadStatusRaw: { state: "saving" },
    saveSnapshotRaw: { isDirty: true },
  });
  assert.equal(view.state, "saving");
});

test("slot state precedence: failed from upload status or snapshot", () => {
  assert.equal(buildSaveStatusSlotView({ saveUploadStatusRaw: { state: "save_failed" } }).state, "failed");
  assert.equal(buildSaveStatusSlotView({ saveSnapshotRaw: { isFailed: true } }).state, "failed");
});

test("slot state precedence: stale beats dirty, dirty beats saved", () => {
  assert.equal(buildSaveStatusSlotView({ saveSnapshotRaw: { isStale: true, isDirty: true } }).state, "stale");
  assert.equal(buildSaveStatusSlotView({ saveSnapshotRaw: { isDirty: true } }).state, "dirty");
  assert.equal(buildSaveStatusSlotView({ saveSnapshotRaw: {} }).state, "saved");
});

test("idle saved state carries the Сохранено label for the header slot", () => {
  const view = buildSaveStatusSlotView({
    saveUploadStatusRaw: { state: "saved" },
    saveSnapshotRaw: { isSaved: true },
  });
  assert.equal(view.state, "saved");
  assert.equal(view.label, "Сохранено");
});

test("state set is limited to the contract vocabulary", () => {
  const allowed = new Set(["saving", "dirty", "saved", "failed", "stale", "conflict"]);
  const cases = [
    buildSaveStatusSlotView({}),
    buildSaveStatusSlotView({ saveUploadStatusRaw: { state: "conflict" } }),
    buildSaveStatusSlotView({ saveUploadStatusRaw: { state: "saving" } }),
    buildSaveStatusSlotView({ saveUploadStatusRaw: { state: "save_failed" } }),
    buildSaveStatusSlotView({ saveSnapshotRaw: { isStale: true } }),
    buildSaveStatusSlotView({ saveSnapshotRaw: { isDirty: true } }),
  ];
  for (const view of cases) {
    assert.equal(allowed.has(view.state), true, `unexpected state ${view.state}`);
  }
});

test("flash view overrides idle label with stripped short message", () => {
  const view = buildSaveStatusSlotView({
    saveUploadStatusRaw: { state: "saved" },
    saveSnapshotRaw: {},
    flashRaw: { visible: true, message: "Сохранение: сессия сохранена." },
  });
  assert.equal(view.state, "saved");
  assert.equal(view.flashVisible, true);
  assert.equal(view.flashLabel, "сессия сохранена");
});

test("stripSaveStatusSlotPrefix removes known source prefixes and sentence end", () => {
  assert.equal(stripSaveStatusSlotPrefix("Сохранение: сессия сохранена."), "сессия сохранена");
  assert.equal(stripSaveStatusSlotPrefix("Версия BPMN: Создана новая версия BPMN."), "Создана новая версия BPMN");
  assert.equal(stripSaveStatusSlotPrefix("Сохранено локально"), "Сохранено локально");
  assert.equal(stripSaveStatusSlotPrefix(""), "");
});
