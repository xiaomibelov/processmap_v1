import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const panelSource = fs.readFileSync(new URL("./DiscussionNotificationCenterPanel.jsx", import.meta.url), "utf8");

test("dedicated panel renders a responsive drawer with header controls", () => {
  assert.match(panelSource, /import \{ createPortal \} from "react-dom";/);
  assert.match(panelSource, /export default function DiscussionNotificationCenterPanel/);
  assert.match(panelSource, /data-testid="discussion-notification-center-panel"/);
  assert.match(panelSource, /data-testid="discussion-notification-panel-backdrop"/);
  assert.match(panelSource, /w-\[720px\]/);
  assert.match(panelSource, /max-w-\[calc\(100vw-1rem\)\]/);
  assert.match(panelSource, />\s*Уведомления\s*</);
  assert.match(panelSource, /data-testid="discussion-notification-panel-refresh"/);
  assert.match(panelSource, /data-testid="discussion-notification-panel-close"/);
  assert.match(panelSource, /onClick=\{\(\) => onClose\?\.\(\)\}/);
});

test("closed dedicated panel renders nothing before portal work", () => {
  assert.match(panelSource, /if \(!open\) return null;/);
});

test("dedicated panel portals to document body to avoid TopBar containing block", () => {
  assert.match(panelSource, /const content = \(/);
  assert.match(panelSource, /typeof document === "undefined" \|\| !document\.body/);
  assert.match(panelSource, /return content;/);
  assert.match(panelSource, /return createPortal\(content, document\.body\);/);
  assert.doesNotMatch(panelSource, /return createPortal\(content, document\.getElementById/);
});

test("dedicated panel owns the full filter and list UI", () => {
  assert.match(panelSource, /data-testid="discussion-notification-panel-filters"/);
  assert.match(panelSource, /data-testid="discussion-notification-panel-filter"/);
  assert.match(panelSource, /data-filter=\{filter\.key\}/);
  assert.match(panelSource, /onClick=\{\(\) => onFilterChange\?\.\(filter\.key\)\}/);
  assert.match(panelSource, /data-testid="discussion-notification-panel-list"/);
  assert.match(panelSource, /data-testid="discussion-notification-panel-row"/);
  assert.match(panelSource, /safeRows\.map/);
  assert.doesNotMatch(panelSource, /slice\(0,\s*3\)/);
});

test("dedicated panel renders row hierarchy, state, and source-backed actions", () => {
  assert.match(panelSource, /row\?\.primaryLabel \|\| row\?\.title \|\| "Обсуждение"/);
  assert.match(panelSource, /row\?\.secondaryLabel/);
  assert.match(panelSource, /row\?\.contextLabel/);
  assert.match(panelSource, /row\?\.authorLabel/);
  assert.match(panelSource, /formatNotificationTime\(row\?\.timestamp\)/);
  assert.match(panelSource, /data-view-state=\{row\?\.viewState \|\| ""\}/);
  assert.match(panelSource, /row\?\.viewState === "viewed"/);
  assert.match(panelSource, /row\?\.isAttentionActive === true \|\| row\?\.requiresAttentionActive === true/);
  assert.match(panelSource, /data-testid="discussion-notification-panel-open"/);
  assert.match(panelSource, /onOpenNotification\?\.\(row\)/);
  assert.match(panelSource, /data-testid="discussion-notification-panel-mark-read"/);
  assert.match(panelSource, /onRowAction\?\.\(row, "read"\)/);
  assert.match(panelSource, /data-testid="discussion-notification-panel-ack-attention"/);
  assert.match(panelSource, /onRowAction\?\.\(row, "attention"\)/);
  assert.match(panelSource, /data-testid="discussion-notification-panel-action-error"/);
});

test("dedicated panel keeps viewed and empty states visible", () => {
  assert.match(panelSource, />\s*Просмотрено\s*</);
  assert.match(panelSource, /Просмотренные уведомления появятся здесь после обработки\./);
  assert.match(panelSource, /Нет уведомлений, требующих внимания\./);
  assert.match(panelSource, /Нет непросмотренных уведомлений\./);
  assert.match(panelSource, /data-testid="discussion-notification-panel-empty"/);
});
