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

test("draft ahead keeps publish action visible even when save dirty flag is false", () => {
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
  assert.equal(ui.showSaveActionButton, false);
  assert.equal(ui.publishActionRequired, true);
  assert.equal(ui.saveActionText, "Save");
});

test("first publish is available when no revisions exist yet and live draft exists", () => {
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
  assert.equal(ui.showSaveActionButton, false);
  assert.equal(ui.publishActionRequired, true);
  assert.equal(ui.saveActionText, "Черновик сохранён");
});

test("clean published state without draft-ahead hides save action button", () => {
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
  assert.equal(ui.showSaveActionButton, false);
  assert.equal(ui.publishActionRequired, false);
  assert.equal(ui.saveActionText, "Черновик сохранён");
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
  assert.equal(ui.saveActionText, "Save");
  assert.equal(ui.saveActionText.toLowerCase().includes("верси"), false);
});

test("session-save button visibility is no longer coupled to publish requirement", () => {
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
  assert.equal(ui.showSaveActionButton, false);
});
