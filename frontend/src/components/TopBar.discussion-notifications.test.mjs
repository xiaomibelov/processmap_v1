import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const topBarSource = fs.readFileSync(new URL("./TopBar.jsx", import.meta.url), "utf8");
const appShellSource = fs.readFileSync(new URL("./AppShell.jsx", import.meta.url), "utf8");
const appSource = fs.readFileSync(new URL("../App.jsx", import.meta.url), "utf8");
const indexSource = fs.readFileSync(new URL("../../index.html", import.meta.url), "utf8");

test("TopBar keeps existing notification source truth and actions", () => {
  assert.match(topBarSource, /useSessionNoteAggregate\(effectiveSessionId\)/);
  assert.match(topBarSource, /useSessionNoteAggregates\(sessionAggregateIds\)/);
  assert.match(topBarSource, /buildAccountDiscussionNotificationGroups/);
  assert.match(topBarSource, /filterDiscussionNotificationGroups/);
  assert.match(topBarSource, /apiMarkNoteThreadRead/);
  assert.match(topBarSource, /apiAcknowledgeNoteThreadAttention/);
  assert.match(topBarSource, /noteNotificationsAvailable/);
  assert.match(topBarSource, /hasBackendNotificationFeed \? noteNotificationItems : \[\]/);
  assert.match(topBarSource, /hasBackendNotificationFeed \? \[\] : mentionItems/);
  assert.match(topBarSource, /hasBackendNotificationFeed \? new Map\(\) : aggregates/);
  assert.match(topBarSource, /item\.reason === "mention" && item\.mention/);
  assert.match(topBarSource, /await apiMarkNoteThreadRead\(threadId\)/);
  assert.match(topBarSource, /await apiAcknowledgeNoteThreadAttention\(threadId\)/);
  assert.match(topBarSource, /await refreshAccountNotificationsAfterAction\(\)/);
  assert.doesNotMatch(topBarSource, /apiGetSessionNoteAggregate/);
});

test("TopBar account dropdown is a compact notification entry point", () => {
  assert.match(topBarSource, /import DiscussionNotificationCenterPanel from "\.\.\/features\/notes\/DiscussionNotificationCenterPanel\.jsx";/);
  assert.match(topBarSource, /useState\(false\)/);
  assert.match(topBarSource, /const \[notificationCenterOpen, setNotificationCenterOpen\] = useState\(false\)/);
  assert.match(topBarSource, /accountMenuOpen \|\| notificationCenterOpen/);
  assert.match(topBarSource, /rowsFromNotificationCenter\(accountNotificationCenter\)\.slice\(0, 3\)/);
  assert.match(topBarSource, /data-testid="topbar-account-button"/);
  assert.match(topBarSource, /data-testid="topbar-account-menu"/);
  assert.match(topBarSource, /w-\[360px\]/);
  assert.match(topBarSource, /data-testid="topbar-mentions-menu"/);
  assert.match(topBarSource, /data-testid="topbar-notification-summary"/);
  assert.match(topBarSource, /data-testid="topbar-notification-preview-list"/);
  assert.match(topBarSource, /data-testid="topbar-notification-preview-row"/);
  assert.match(topBarSource, /data-testid="topbar-open-notification-center"/);
  assert.match(topBarSource, />\s*Открыть центр уведомлений\s*</);
  assert.match(topBarSource, /onClick=\{openNotificationCenterPanel\}/);
  assert.doesNotMatch(topBarSource, /data-testid="topbar-notification-filters"/);
  assert.doesNotMatch(topBarSource, /data-testid="topbar-notification-filter"/);
  assert.doesNotMatch(topBarSource, /data-testid="topbar-notification-center"/);
  assert.doesNotMatch(topBarSource, /data-testid="topbar-notification-open"/);
  assert.doesNotMatch(topBarSource, /data-testid="topbar-notification-mark-read"/);
  assert.doesNotMatch(topBarSource, /data-testid="topbar-notification-ack-attention"/);
  assert.doesNotMatch(topBarSource, /visibleNotificationRows\.slice\(0, 24\)/);
});

test("TopBar opens the dedicated panel with reused filtered rows and actions", () => {
  assert.match(topBarSource, /function preferredNotificationFilter\(\)/);
  assert.match(topBarSource, /accountNotificationCenter\.unviewedCount > 0/);
  assert.match(topBarSource, /accountNotificationCenter\.attentionCount > 0/);
  assert.match(topBarSource, /setNotificationFilter\(preferredNotificationFilter\(\)\)/);
  assert.match(topBarSource, /setAccountMenuOpen\(false\)/);
  assert.match(topBarSource, /<DiscussionNotificationCenterPanel/);
  assert.match(topBarSource, /open=\{notificationCenterOpen\}/);
  assert.match(topBarSource, /rows=\{visibleNotificationRows\}/);
  assert.match(topBarSource, /totalCount=\{accountNotificationCenter\.rowCount\}/);
  assert.match(topBarSource, /filters=\{notificationFilters\}/);
  assert.match(topBarSource, /activeFilter=\{notificationFilter\}/);
  assert.match(topBarSource, /onOpenNotification=\{\(row\) => void handleAccountNotificationOpen\(row\)\}/);
  assert.match(topBarSource, /onRowAction=\{\(row, action\) => void handleNotificationRowAction\(row, action\)\}/);
  assert.match(topBarSource, /\{ key: "unviewed", label: "Не просмотренные"/);
  assert.match(topBarSource, /\{ key: "attention", label: "Требуют внимания"/);
  assert.match(topBarSource, /\{ key: "viewed", label: "Просмотренные"/);
  assert.doesNotMatch(topBarSource, /\{ key: "all", label: "Все"/);
  assert.doesNotMatch(topBarSource, /\{ key: "mention", label: "Упоминания"/);
  assert.doesNotMatch(topBarSource, /\{ key: "unread", label: "Новые"/);
});

test("TopBar profile menu keeps account actions separate from notifications", () => {
  assert.match(topBarSource, /data-testid="topbar-account-actions"/);
  assert.match(topBarSource, /data-testid="topbar-account-profile-soon"/);
  assert.match(topBarSource, /data-testid="topbar-theme-toggle"/);
  assert.match(topBarSource, /data-testid="topbar-account-logout"/);
  assert.match(topBarSource, /role="switch"/);
  assert.match(topBarSource, /aria-checked=\{uiTheme === "light" \? "true" : "false"\}/);
  assert.match(topBarSource, /toggleTheme\(\)/);
  assert.doesNotMatch(topBarSource, /data-testid="topbar-account-settings"/);
  assert.doesNotMatch(topBarSource, />Настройки</);
});

test("App bridge opens NotesMvpPanel in notification mode without a new router", () => {
  assert.match(appShellSource, /onOpenDiscussionNotifications/);
  assert.match(appShellSource, /<TopBar[\s\S]*onOpenDiscussionNotifications=\{onOpenDiscussionNotifications\}/);
  assert.match(appShellSource, /noteNotifications=\{noteNotifications\}/);
  assert.match(appShellSource, /noteNotificationsAvailable=\{noteNotificationsAvailable\}/);
  assert.match(appSource, /apiListNoteNotifications/);
  assert.match(appSource, /Promise\.allSettled\(\[/);
  assert.match(appSource, /apiListNoteNotifications\(\{ limit: 20, includeRead: true \}\)/);
  assert.match(appSource, /setNoteNotificationsAvailable\(true\)/);
  assert.match(appSource, /setNoteNotificationsAvailable\(false\)/);
  assert.match(appSource, /const mode = String\(options\?\.mode \|\| "discussions"\)\.trim\(\) === "notifications" \? "notifications" : "discussions";/);
  assert.match(appSource, /mode: "notifications"/);
  assert.match(appSource, /source: "topbar_discussion_notifications"/);
  assert.match(appSource, /threadId: options\?\.threadId \|\| options\?\.thread_id \|\| ""/);
  assert.match(appSource, /commentId: options\?\.commentId \|\| options\?\.comment_id \|\| ""/);
  assert.match(appSource, /onFocusNotificationTarget=\{focusDiscussionNotificationTarget\}/);
  assert.match(appSource, /currentUserId=\{user\?\.id\}/);
});

test("frontend index links the source-backed backend favicon", () => {
  assert.match(indexSource, /<link rel="icon" href="\/favicon\.ico" \/>/);
});
