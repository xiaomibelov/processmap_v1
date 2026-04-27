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

test("AppShell forwards mention notification contract into TopBar", () => {
  assert.match(source, /mentionNotifications/);
  assert.match(source, /<TopBar[\s\S]*mentionNotifications=\{mentionNotifications\}/);
  assert.match(source, /<TopBar[\s\S]*onOpenMentionNotification=\{onOpenMentionNotification\}/);
  assert.match(source, /<TopBar[\s\S]*onRefreshMentionNotifications=\{onRefreshMentionNotifications\}/);
});

test("AppShell replaces legacy footer helper copy with app version source of truth", () => {
  assert.match(source, /import \{ appVersionInfo \} from "\.\.\/config\/appVersion\.js"/);
  assert.match(source, /data-testid="app-version-footer"/);
  assert.match(source, /data-testid="app-version-link"/);
  assert.match(source, /href="#updates"/);
  assert.match(source, /Версия \{appVersionInfo\.currentVersion\}/);
  assert.doesNotMatch(source, /Навигация: мышь — пан\/зум на схеме · ✦ AI — подсветить узкие места на узлах/);
});

test("AppShell renders an updates page from appVersionInfo changelog", () => {
  assert.match(source, /function AppUpdatesPage\(\{ onClose \}\)/);
  assert.match(source, /data-testid="app-updates-page"/);
  assert.match(source, /appVersionInfo\.changelog/);
  assert.match(source, /normalizeChangelogLink\(entry\?\.link\)/);
  assert.match(source, /У записи может быть ссылка на задачу, PR или документ с подробностями/);
});
