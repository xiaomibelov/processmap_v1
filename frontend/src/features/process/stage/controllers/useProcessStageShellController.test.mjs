import test from "node:test";
import assert from "node:assert/strict";

import { buildSaveUiState } from "./useProcessStageShellController.js";

test("dirty save snapshot keeps save action button visible", () => {
  const ui = buildSaveUiState({
    saveSnapshotRaw: { isDirty: true, status: "dirty" },
    revisionSnapshotRaw: {
      latestRevisionNumber: 1,
      draftState: {
        hasLiveDraft: true,
        isDraftAheadOfLatestRevision: false,
      },
    },
    fallbackLabel: "Save",
  });
  assert.equal(ui.showSaveActionButton, true);
  assert.equal(ui.publishActionRequired, false);
  assert.equal(ui.saveActionText, "Сохранить сессию");
});

test("draft ahead keeps save action visible and keeps publish requirement for revision action", () => {
  const ui = buildSaveUiState({
    saveSnapshotRaw: { isDirty: false, status: "stale" },
    revisionSnapshotRaw: {
      latestRevisionNumber: 1,
      draftState: {
        hasLiveDraft: true,
        isDraftAheadOfLatestRevision: true,
      },
    },
    fallbackLabel: "Save",
  });
  assert.equal(ui.showSaveActionButton, true);
  assert.equal(ui.publishActionRequired, true);
  assert.equal(ui.saveActionText, "Сохранить сессию");
});

test("first publish requirement does not hide session-save reassurance button", () => {
  const ui = buildSaveUiState({
    saveSnapshotRaw: { isDirty: false, status: "saved" },
    revisionSnapshotRaw: {
      latestRevisionNumber: 0,
      draftState: {
        hasLiveDraft: true,
        isDraftAheadOfLatestRevision: false,
      },
    },
    fallbackLabel: "Save",
  });
  assert.equal(ui.showSaveActionButton, true);
  assert.equal(ui.publishActionRequired, true);
  assert.equal(ui.saveActionText, "Сохранить сессию");
});

test("clean published state keeps session-save reassurance button visible", () => {
  const ui = buildSaveUiState({
    saveSnapshotRaw: { isDirty: false, status: "saved" },
    revisionSnapshotRaw: {
      latestRevisionNumber: 2,
      draftState: {
        hasLiveDraft: true,
        isDraftAheadOfLatestRevision: false,
      },
    },
    fallbackLabel: "Save",
  });
  assert.equal(ui.showSaveActionButton, true);
  assert.equal(ui.publishActionRequired, false);
  assert.equal(ui.saveActionText, "Сохранить сессию");
});

test("save action label no longer uses revision semantics", () => {
  const ui = buildSaveUiState({
    saveSnapshotRaw: { isDirty: false, status: "stale" },
    revisionSnapshotRaw: {
      latestRevisionNumber: 2,
      draftState: {
        hasLiveDraft: true,
        isDraftAheadOfLatestRevision: true,
      },
    },
    fallbackLabel: "Save",
  });
  assert.equal(ui.saveActionText, "Сохранить сессию");
  assert.equal(ui.saveActionText.toLowerCase().includes("верси"), false);
});

test("session-save button visibility remains decoupled from publish requirement", () => {
  const ui = buildSaveUiState({
    saveSnapshotRaw: { isDirty: false, status: "saved" },
    revisionSnapshotRaw: {
      latestRevisionNumber: 5,
      draftState: {
        hasLiveDraft: true,
        isDraftAheadOfLatestRevision: true,
      },
    },
    fallbackLabel: "Save",
  });
  assert.equal(ui.publishActionRequired, true);
  assert.equal(ui.showSaveActionButton, true);
});
