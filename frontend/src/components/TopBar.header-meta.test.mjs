import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

test("TopBar header meta keeps only project/session/org labels without created-by blocks", () => {
  const source = fs.readFileSync(path.join(__dirname, "TopBar.jsx"), "utf8");
  assert.equal(source.includes("Created by"), false);
  assert.equal(source.includes("Updated by"), false);
  assert.equal(source.includes("justify-end"), true);
  assert.match(source, /data-testid="topbar-account-button"/);
  assert.match(source, /data-testid="topbar-account-notification-count"/);
  assert.match(source, /data-testid="topbar-mentions-menu"/);
  assert.match(source, /data-testid="topbar-mention-item"/);
  assert.match(source, /onOpenMentionNotification/);
});
