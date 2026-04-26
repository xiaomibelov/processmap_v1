import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const topBarSource = fs.readFileSync(new URL("./TopBar.jsx", import.meta.url), "utf8");
const appShellSource = fs.readFileSync(new URL("./AppShell.jsx", import.meta.url), "utf8");
const appSource = fs.readFileSync(new URL("../App.jsx", import.meta.url), "utf8");

test("TopBar exposes bounded discussion notification entry from existing note aggregate truth", () => {
  assert.match(topBarSource, /useSessionNoteAggregate\(effectiveSessionId\)/);
  assert.doesNotMatch(topBarSource, /apiGetSessionNoteAggregate/);
  assert.doesNotMatch(topBarSource, /data-testid="topbar-mentions-button"/);
  assert.match(topBarSource, /data-testid="topbar-account-button"/);
  assert.match(topBarSource, /data-testid="topbar-account-notification-count"/);
  assert.match(topBarSource, /data-testid="topbar-mentions-menu"/);
  assert.match(topBarSource, /data-testid="topbar-discussion-notifications"/);
  assert.match(topBarSource, /Мои обсуждения/);
  assert.match(topBarSource, /data-notes-panel-trigger="true"/);
  assert.match(topBarSource, /onOpenDiscussionNotifications\?\.\(\)/);
  assert.match(topBarSource, /personalDiscussionCount = Math\.max\(0, Number\(notesAggregate\?\.personal_discussions_count \|\| 0\)/);
  assert.match(topBarSource, /accountNotificationCount = mentionCount \+ personalDiscussionCount/);
  assert.match(topBarSource, /count=\{notesAggregate\?\.personal_discussions_count\}/);
  assert.match(topBarSource, /NotesAggregateBadge[\s\S]*label="Мои обсуждения"/);
  assert.match(topBarSource, /fixed right-3 top-14/);
  assert.match(topBarSource, /max-h-\[calc\(100vh-4\.25rem\)\]/);
  assert.match(topBarSource, /overflow-y-auto/);
  assert.match(topBarSource, /mentionItems\.slice\(0, 4\)/);
});

test("TopBar profile menu uses a direct theme switch instead of settings row", () => {
  assert.match(topBarSource, /data-testid="topbar-theme-toggle"/);
  assert.match(topBarSource, /role="switch"/);
  assert.match(topBarSource, /aria-checked=\{uiTheme === "light" \? "true" : "false"\}/);
  assert.match(topBarSource, /toggleTheme\(\)/);
  assert.match(topBarSource, /Тёмная/);
  assert.match(topBarSource, /Светлая/);
  assert.doesNotMatch(topBarSource, /data-testid="topbar-account-settings"/);
  assert.doesNotMatch(topBarSource, />Настройки</);
});

test("App bridge opens NotesMvpPanel in notification mode without a new router", () => {
  assert.match(appShellSource, /onOpenDiscussionNotifications/);
  assert.match(appShellSource, /<TopBar[\s\S]*onOpenDiscussionNotifications=\{onOpenDiscussionNotifications\}/);
  assert.match(appSource, /const mode = String\(options\?\.mode \|\| "discussions"\)\.trim\(\) === "notifications" \? "notifications" : "discussions";/);
  assert.match(appSource, /mode: "notifications"/);
  assert.match(appSource, /source: "topbar_discussion_notifications"/);
  assert.match(appSource, /onFocusNotificationTarget=\{focusDiscussionNotificationTarget\}/);
  assert.match(appSource, /currentUserId=\{user\?\.id\}/);
});
