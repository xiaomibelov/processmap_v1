import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function readHeaderSource() {
  return fs.readFileSync(path.join(__dirname, "ProcessStageHeader.jsx"), "utf8");
}

function readProcessStageSource() {
  return fs.readFileSync(path.join(__dirname, "../../../../components/ProcessStage.jsx"), "utf8");
}

test("conflict actions are rendered in central modal flow, not in header inline panel", () => {
  const processStageSource = readProcessStageSource();
  const source = readHeaderSource();
  assert.ok(
    processStageSource.includes("ProcessStageSaveConflictModal"),
    "ProcessStage must render dedicated conflict modal",
  );
  assert.ok(
    processStageSource.includes("buildSaveConflictModalView"),
    "ProcessStage must build actor-aware conflict modal view",
  );
  assert.ok(
    source.includes('data-testid="diagram-toolbar-save-conflict-panel"') === false,
    "header inline conflict panel must be removed",
  );
});

test("header dedupes competing conflict surfaces while modal is active", () => {
  const source = readHeaderSource();
  assert.ok(
    source.includes("const showConflictModalActive = isConflictState && saveConflictActions?.visible === true;"),
    "header should derive modal-active conflict state from controller",
  );
  assert.ok(
    source.includes("const uploadStatusState = toText(saveUploadStatus?.state);")
      && source.includes("const showUploadStatusBadge = saveUploadStatus?.visible")
      && source.includes("&& !showConflictModalActive")
      && source.includes("(uploadStatusState === \"save_failed\" || uploadStatusState === \"conflict\")"),
    "upload status badge must hide technical progress noise and stay only for conflict/error states",
  );
  assert.ok(
    source.includes("toolbarInlineMessage") === false
      && source.includes("showToolbarInlineBadge") === false,
    "toolbar inline message surface must stay removed; process statuses go through toast",
  );
  assert.ok(
    source.includes("const showSessionPresenceBadge = hasSession && sessionPresenceView?.visible === true && !showConflictModalActive;"),
    "presence badge must be suppressed while conflict modal is active",
  );
  assert.ok(
    source.includes("const showRemoteSaveHighlightBadge = remoteSaveHighlightView?.visible === true && !showConflictModalActive;"),
    "remote-save highlight badge must be suppressed while conflict modal is active",
  );
  assert.ok(
    source.includes("const showRemoteSaveRefreshAction = showRemoteSaveHighlightBadge && typeof remoteSaveHighlightView?.onRefreshSession === \"function\";"),
    "remote refresh action must be coupled to passive notice visibility and hidden under conflict modal",
  );
  assert.ok(
    source.includes('data-testid="diagram-toolbar-remote-save-refresh"'),
    "header must expose explicit passive refresh action",
  );
});
