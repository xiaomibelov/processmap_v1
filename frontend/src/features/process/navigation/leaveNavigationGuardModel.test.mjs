import test from "node:test";
import assert from "node:assert/strict";

import {
  buildLeaveNavigationConfirmText,
  deriveLeaveNavigationRisk,
} from "./leaveNavigationGuardModel.js";

test("safe leave when draft is synchronized and no save/conflict activity", () => {
  const risk = deriveLeaveNavigationRisk({
    hasSession: true,
    saveSnapshotRaw: {
      isDirty: false,
      isSaving: false,
      isFailed: false,
      isStale: false,
      isSaved: true,
    },
    saveUploadStatusRaw: { state: "saved" },
  });
  assert.equal(risk.unsafe, false);
  assert.equal(risk.reason, "safe");
});

test("unsafe leave when unsaved local changes exist", () => {
  const risk = deriveLeaveNavigationRisk({
    hasSession: true,
    saveSnapshotRaw: { isDirty: true },
    saveUploadStatusRaw: { state: "saved" },
  });
  assert.equal(risk.unsafe, true);
  assert.equal(risk.reason, "unsaved_changes");
  assert.match(risk.message, /несохранённые изменения/i);
});

test("unsafe leave during in-progress save and on conflict", () => {
  const savingRisk = deriveLeaveNavigationRisk({
    hasSession: true,
    saveSnapshotRaw: { isSaving: true },
    saveUploadStatusRaw: { state: "saving" },
  });
  assert.equal(savingRisk.unsafe, true);
  assert.equal(savingRisk.reason, "saving_in_progress");

  const conflictRisk = deriveLeaveNavigationRisk({
    hasSession: true,
    saveSnapshotRaw: { isDirty: true },
    saveUploadStatusRaw: { state: "conflict" },
  });
  assert.equal(conflictRisk.unsafe, true);
  assert.equal(conflictRisk.reason, "save_conflict");
});

test("successful saved/synced state does not trigger leave confirm", () => {
  const risk = deriveLeaveNavigationRisk({
    hasSession: true,
    saveSnapshotRaw: {
      isSaving: false,
      isDirty: false,
      isFailed: false,
      isStale: false,
      isSaved: true,
      status: "saved",
    },
    saveUploadStatusRaw: { state: "saved" },
  });
  assert.equal(risk.unsafe, false);
  assert.equal(risk.reason, "safe");
});

test("no-op clean state does not trigger leave confirm", () => {
  const risk = deriveLeaveNavigationRisk({
    hasSession: true,
    saveSnapshotRaw: {
      isSaving: false,
      isDirty: false,
      isFailed: false,
      isStale: false,
      status: "saved",
    },
    saveUploadStatusRaw: { state: "saved" },
  });
  assert.equal(risk.unsafe, false);
  assert.equal(risk.reason, "safe");
});

test("autosave-synced stale/fallback marker alone is not treated as unsaved leave risk", () => {
  const risk = deriveLeaveNavigationRisk({
    hasSession: true,
    saveSnapshotRaw: {
      isSaving: false,
      isDirty: false,
      isFailed: false,
      isStale: true,
      status: "stale",
    },
    saveUploadStatusRaw: { state: "saved" },
  });
  assert.equal(risk.unsafe, false);
  assert.equal(risk.reason, "safe");
});

test("conflict without unsaved local changes is not treated as leave-loss risk", () => {
  const risk = deriveLeaveNavigationRisk({
    hasSession: true,
    saveSnapshotRaw: {
      isSaving: false,
      isDirty: false,
      isFailed: false,
      isStale: true,
      status: "stale",
    },
    saveUploadStatusRaw: { state: "conflict" },
  });
  assert.equal(risk.unsafe, false);
  assert.equal(risk.reason, "safe");
});

test("new edits after clean state re-enable leave risk", () => {
  const clean = deriveLeaveNavigationRisk({
    hasSession: true,
    saveSnapshotRaw: { isDirty: false, isSaving: false, isFailed: false, isStale: false, status: "saved" },
    saveUploadStatusRaw: { state: "saved" },
  });
  assert.equal(clean.unsafe, false);

  const dirty = deriveLeaveNavigationRisk({
    hasSession: true,
    saveSnapshotRaw: { isDirty: true, isSaving: false, isFailed: false, isStale: false, status: "dirty" },
    saveUploadStatusRaw: { state: "saved" },
  });
  assert.equal(dirty.unsafe, true);
  assert.equal(dirty.reason, "unsaved_changes");
});

test("confirm text is human-readable", () => {
  const text = buildLeaveNavigationConfirmText({
    unsafe: true,
    message: "Есть несохранённые изменения.",
  });
  assert.match(text, /несохранённые изменения/i);
  assert.match(text, /Уйти со страницы/i);
});
