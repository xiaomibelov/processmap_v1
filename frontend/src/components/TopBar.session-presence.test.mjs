import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

test("TopBar renders bounded session presence indicator in session status cluster", () => {
  const source = fs.readFileSync(path.join(__dirname, "TopBar.jsx"), "utf8");
  assert.equal(source.includes("useSessionPresence"), true);
  assert.equal(source.includes("buildSessionPresenceCopy"), true);
  assert.equal(source.includes("data-testid=\"topbar-session-presence-indicator\""), true);
  assert.equal(source.includes("data-testid=\"topbar-session-presence-count\""), true);
  assert.equal(source.includes("PresenceUsersIcon"), true);
  assert.equal(source.includes("sessionPresenceCount > 0"), true);
});

test("TopBar keeps status token separate from session selector and compacts project/session widths", () => {
  const source = fs.readFileSync(path.join(__dirname, "TopBar.jsx"), "utf8");
  assert.equal(source.includes("data-testid=\"topbar-session-status\""), true);
  assert.equal(source.includes("topbar-session-review-status-label"), true);
  assert.equal(source.includes("topbar-session-review-menu"), true);
  assert.equal(source.includes("REVIEW_STATUS_OPTIONS"), true);
  assert.equal(source.includes("min-w-[148px] max-w-[228px] grow-0"), true);
  assert.equal(source.includes("min-w-[164px] max-w-[244px] grow-0"), true);
});

test("TopBar keeps only meaningful remote-sync indicators in session cluster", () => {
  const source = fs.readFileSync(path.join(__dirname, "TopBar.jsx"), "utf8");
  assert.equal(source.includes("sessionRemoteSyncState"), true);
  assert.equal(source.includes("onApplySessionRemoteSync"), true);
  assert.equal(source.includes("data-testid=\"topbar-session-remote-sync-apply\""), true);
  assert.equal(source.includes("data-testid=\"topbar-session-remote-sync-syncing\""), false);
  assert.equal(source.includes("data-testid=\"topbar-session-remote-sync-error\""), true);
});
