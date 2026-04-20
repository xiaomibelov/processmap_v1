import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { buildSaveUiState } from "./useProcessStageShellController.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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
  assert.equal(ui.saveSmartText, "Сохранить сессию");
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
  assert.equal(ui.saveSmartText, "Сохранено внутри версии");
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
  assert.equal(ui.saveSmartText, "Сохранено внутри версии");
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

test("save smart text transitions through dirty -> saving -> saved within version", () => {
  const dirty = buildSaveUiState({
    saveSnapshotRaw: { isDirty: true, status: "dirty" },
    revisionSnapshotRaw: { latestRevisionNumber: 3, draftState: { hasLiveDraft: true } },
    fallbackLabel: "Save",
  });
  const saving = buildSaveUiState({
    saveSnapshotRaw: { isSaving: true, status: "saving" },
    revisionSnapshotRaw: { latestRevisionNumber: 3, draftState: { hasLiveDraft: true } },
    fallbackLabel: "Save",
  });
  const saved = buildSaveUiState({
    saveSnapshotRaw: { isSaved: true, status: "saved" },
    revisionSnapshotRaw: { latestRevisionNumber: 3, draftState: { hasLiveDraft: true } },
    fallbackLabel: "Save",
  });
  assert.equal(dirty.saveSmartText, "Сохранить сессию");
  assert.equal(saving.saveSmartText, "Сохранение...");
  assert.equal(saved.saveSmartText, "Сохранено внутри версии");
});

test("save smart text returns to dirty state after next xml mutation", () => {
  const saved = buildSaveUiState({
    saveSnapshotRaw: { isSaved: true, status: "saved", isDirty: false },
    revisionSnapshotRaw: { latestRevisionNumber: 7, draftState: { hasLiveDraft: true } },
    fallbackLabel: "Save",
  });
  const dirtyAgain = buildSaveUiState({
    saveSnapshotRaw: { isSaved: false, isDirty: true, status: "dirty" },
    revisionSnapshotRaw: { latestRevisionNumber: 7, draftState: { hasLiveDraft: true } },
    fallbackLabel: "Save",
  });
  assert.equal(saved.saveSmartText, "Сохранено внутри версии");
  assert.equal(dirtyAgain.saveSmartText, "Сохранить сессию");
});

test("create-version availability is decoupled from transient saving state", () => {
  const source = fs.readFileSync(path.join(__dirname, "useProcessStageShellController.js"), "utf8");
  assert.equal(source.includes("const canSaveNow = ("), true);
  assert.equal(source.includes("&& saveSnapshot.isSaving !== true"), true);
  assert.equal(source.includes("const canCreateRevisionNow = ("), true);
  assert.equal(source.includes("canCreateRevisionNow,"), true);
});
