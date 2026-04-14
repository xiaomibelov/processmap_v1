import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function readAppSource() {
  return fs.readFileSync(path.join(__dirname, "App.jsx"), "utf8");
}

test("app uses centralized leave risk model and browser beforeunload guard", () => {
  const source = readAppSource();
  assert.equal(source.includes("deriveLeaveNavigationRisk"), true);
  assert.equal(source.includes("buildLeaveNavigationConfirmText"), true);
  assert.equal(source.includes("window.addEventListener(\"beforeunload\", onBeforeUnload)"), true);
  assert.equal(source.includes("if (leaveNavigationRisk?.unsafe !== true) return undefined;"), true);
});

test("app guards popstate and project/session navigation with same leave confirmation", () => {
  const source = readAppSource();
  assert.equal(source.includes("confirmLeaveIfUnsafe(\"popstate_navigation\")"), true);
  assert.equal(source.includes("writeSelectionToUrl({ projectId: currentProjectId, sessionId: currentSessionId });"), true);
  assert.equal(source.includes("if (activeSid && !confirmLeaveIfUnsafe(\"project_change\")) return;"), true);
  assert.equal(source.includes("onOpenSession={openSessionWithLeaveGuard}"), true);
  assert.equal(source.includes("returnToSessionList(reason = \"manual_return\", options = {})"), true);
  assert.equal(source.includes("if (sid && !confirmLeaveIfUnsafe(reason))"), true);
});
