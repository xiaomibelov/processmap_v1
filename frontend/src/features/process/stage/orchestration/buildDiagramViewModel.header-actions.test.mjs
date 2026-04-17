import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

test("buildDiagramHeaderView forwards both save-session and create-revision handlers", () => {
  const source = fs.readFileSync(path.join(__dirname, "buildDiagramViewModel.js"), "utf8");
  assert.ok(source.includes("export function buildDiagramHeaderView({"));
  assert.ok(source.includes("handleSaveCurrentTab,"));
  assert.ok(source.includes("handleCreateRevisionAction,"));
  assert.ok(source.includes("handleRedoAction,"));
});
