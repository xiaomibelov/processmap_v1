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
  assert.equal(ui.saveActionText, "Сохранить");
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
  assert.equal(ui.showSaveActionButton, true);
  assert.equal(ui.publishActionRequired, true);
  assert.equal(ui.saveActionText, "Сохранить версию");
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
  assert.equal(ui.showSaveActionButton, true);
  assert.equal(ui.publishActionRequired, true);
  assert.equal(ui.saveActionText, "Сохранить версию");
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
