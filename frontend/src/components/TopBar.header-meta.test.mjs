import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const source = fs.readFileSync(path.join(__dirname, "TopBar.jsx"), "utf8");

test("TopBar header meta keeps only project/session/org labels without created-by blocks", () => {
  assert.equal(source.includes("Created by"), false);
  assert.equal(source.includes("Updated by"), false);
  assert.equal(source.includes("justify-end"), true);
  assert.match(source, /data-testid="topbar-account-button"/);
  assert.match(source, /data-testid="topbar-account-notification-count"/);
  assert.match(source, /data-testid="topbar-mentions-menu"/);
  assert.match(source, /mentionItems/);
  assert.match(source, /data-testid="topbar-theme-toggle"/);
  assert.match(source, /onOpenMentionNotification/);
});

test("TopBar no longer exposes the global AI entry", () => {
  assert.equal(source.includes('data-testid="topbar-ai-button"'), false);
  assert.equal(source.includes("AiToolsModal"), false);
  assert.equal(source.includes("aiToolsOpen"), false);
});

test("TopBar no longer owns session status control UI", () => {
  assert.doesNotMatch(source, /import\s*\{[^}]*getAllowedNextStatuses[^}]*\}\s*from\s*"\.\.\/features\/workspace\/sessionStatus\.js"/);
  assert.doesNotMatch(source, /MANUAL_SESSION_STATUSES/);
  assert.doesNotMatch(source, /statusOptions/);
  assert.doesNotMatch(source, /hasStatusAlternatives/);
});

test("TopBar keeps status change callback prop for downstream wiring", () => {
  assert.match(source, /onChangeSessionStatus,/);
  assert.match(source, /isChangingSessionStatus\s*=\s*false/);
});
