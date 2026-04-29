import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const topBarSource = fs.readFileSync(new URL("./TopBar.jsx", import.meta.url), "utf8");
const appShellSource = fs.readFileSync(new URL("./AppShell.jsx", import.meta.url), "utf8");
const appSource = fs.readFileSync(new URL("../App.jsx", import.meta.url), "utf8");

test("TopBar exposes bounded discussion notification entry from existing note aggregate truth", () => {
  assert.match(topBarSource, /useSessionNoteAggregate\(effectiveSessionId\)/);
  assert.match(topBarSource, /useSessionNoteAggregates\(sessionAggregateIds\)/);
  assert.match(topBarSource, /buildAccountDiscussionNotificationGroups/);
  assert.doesNotMatch(topBarSource, /apiGetSessionNoteAggregate/);
  assert.doesNotMatch(topBarSource, /data-testid="topbar-mentions-button"/);
  assert.match(topBarSource, /data-testid="topbar-account-button"/);
  assert.match(topBarSource, /data-testid="topbar-account-notification-count"/);
  assert.match(topBarSource, /data-testid="topbar-mentions-menu"/);
  assert.match(topBarSource, /data-testid="topbar-notification-center"/);
  assert.match(topBarSource, /data-testid="topbar-notification-session-group"/);
  assert.match(topBarSource, /data-testid="topbar-notification-empty"/);
  assert.match(topBarSource, /"topbar-discussion-notifications"/);
  assert.match(topBarSource, /data-notes-panel-trigger=\{isCurrentAggregate \? "true" : undefined\}/);
  assert.match(topBarSource, /onOpenDiscussionNotifications\?\.\(\)/);
  assert.match(topBarSource, /accountNotificationCount = accountNotificationCenter\.badgeCount/);
  assert.match(topBarSource, /hasAccountNotifications = accountNotificationCenter\.rowCount > 0/);
  assert.match(topBarSource, /Нет активных уведомлений/);
  assert.match(topBarSource, /Новые сообщения, упоминания и обсуждения появятся здесь\./);
  assert.doesNotMatch(topBarSource, /personalDiscussionCount/);
  assert.match(topBarSource, /fixed right-3 top-14/);
  assert.match(topBarSource, /max-h-\[calc\(100vh-4\.25rem\)\]/);
  assert.match(topBarSource, /overflow-x-hidden overflow-y-auto/);
  assert.match(topBarSource, /min-w-0 gap-1 overflow-x-hidden overflow-y-auto[\s\S]*data-testid="topbar-account-menu"/);
  assert.match(topBarSource, /min-w-0 overflow-x-hidden rounded-lg[\s\S]*data-testid="topbar-mentions-menu"/);
  assert.match(topBarSource, /"topbar-mention-item"/);
  assert.match(topBarSource, /w-full min-w-0 overflow-hidden rounded-md/);
  assert.match(topBarSource, /line-clamp-2 break-words/);
  assert.match(topBarSource, /max-h-\[286px\]/);
  assert.doesNotMatch(topBarSource, /Здесь появятся персональные упоминания из обсуждений\./);
  assert.match(topBarSource, /overflow-y-auto/);
  assert.match(topBarSource, /groups\.slice\(0, 8\)/);
  assert.match(topBarSource, /rows\.slice\(0, 3\)/);
});

test("TopBar profile menu uses a direct theme switch instead of settings row", () => {
  assert.match(topBarSource, /data-testid="topbar-theme-toggle"/);
  assert.match(topBarSource, /role="switch"/);
  assert.match(topBarSource, /aria-checked=\{uiTheme === "light" \? "true" : "false"\}/);
  assert.match(topBarSource, /toggleTheme\(\)/);
  assert.match(topBarSource, /secondaryBtn h-9 w-full min-w-0 justify-start gap-2 overflow-hidden[\s\S]*data-testid="topbar-theme-toggle"/);
  assert.match(topBarSource, /relative h-5 w-9 shrink-0/);
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
