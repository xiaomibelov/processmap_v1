import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const topBarSource = fs.readFileSync(new URL("./TopBar.jsx", import.meta.url), "utf8");
const appShellSource = fs.readFileSync(new URL("./AppShell.jsx", import.meta.url), "utf8");
const appSource = fs.readFileSync(new URL("../App.jsx", import.meta.url), "utf8");

test("TopBar exposes bounded discussion notification entry from existing note aggregate truth", () => {
  assert.match(topBarSource, /apiGetSessionNoteAggregate/);
  assert.match(topBarSource, /processmap:notes-aggregate-changed/);
  assert.doesNotMatch(topBarSource, /data-testid="topbar-mentions-button"/);
  assert.match(topBarSource, /data-testid="topbar-account-button"/);
  assert.match(topBarSource, /data-testid="topbar-account-notification-count"/);
  assert.match(topBarSource, /data-testid="topbar-mentions-menu"/);
  assert.match(topBarSource, /data-testid="topbar-discussion-notifications"/);
  assert.match(topBarSource, /Уведомления обсуждений/);
  assert.match(topBarSource, /data-notes-panel-trigger="true"/);
  assert.match(topBarSource, /onOpenDiscussionNotifications\?\.\(\)/);
  assert.match(topBarSource, /count=\{notesAggregate\?\.attention_discussions_count\}/);
  assert.match(topBarSource, /NotesAggregateBadge[\s\S]*label="Обсуждения"/);
  assert.match(topBarSource, /max-h-\[min\(76vh,620px\)\]/);
});

test("App bridge opens NotesMvpPanel in notification mode without a new router", () => {
  assert.match(appShellSource, /onOpenDiscussionNotifications/);
  assert.match(appShellSource, /<TopBar[\s\S]*onOpenDiscussionNotifications=\{onOpenDiscussionNotifications\}/);
  assert.match(appSource, /const mode = String\(options\?\.mode \|\| "discussions"\)\.trim\(\) === "notifications" \? "notifications" : "discussions";/);
  assert.match(appSource, /mode: "notifications"/);
  assert.match(appSource, /source: "topbar_discussion_notifications"/);
  assert.match(appSource, /onFocusNotificationTarget=\{focusDiscussionNotificationTarget\}/);
});
