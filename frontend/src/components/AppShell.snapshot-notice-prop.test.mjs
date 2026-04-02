import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync(new URL("./AppShell.jsx", import.meta.url), "utf8");

test("AppShell forwards snapshot notice consume callback into ProcessStage", () => {
  assert.match(source, /onSnapshotRestoreNoticeConsumed/);
  assert.match(source, /<ProcessStage[\s\S]*onSnapshotRestoreNoticeConsumed=\{onSnapshotRestoreNoticeConsumed\}/);
});

test("AppShell uses shellSessionId for shell continuity while keeping ProcessStage on real sessionId", () => {
  assert.match(source, /shellSessionId = ""/);
  assert.match(source, /const hasActiveSession = String\(shellSessionId \|\| sessionId \|\| ""\)\.trim\(\)\.length > 0;/);
  assert.match(source, /<TopBar[\s\S]*sessionId=\{String\(shellSessionId \|\| sessionId \|\| ""\)\.trim\(\)\}/);
  assert.match(source, /<ProcessStage[\s\S]*sessionId=\{sessionId\}/);
});
