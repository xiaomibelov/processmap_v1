import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function readSource(rel) {
  return fs.readFileSync(path.join(__dirname, rel), "utf8");
}

test("save status slot renders in header right status container with contract testids", () => {
  const source = readSource("DiagramToolbarSaveStatusSlot.jsx");
  assert.equal(source.includes('data-testid="diagram-toolbar-save-status-slot"'), true);
  // -empty присваивается через переменную (data-testid={labelTestId}).
  assert.equal(source.includes('"diagram-toolbar-save-status-empty"'), true);
  assert.equal(source.includes('data-testid="diagram-toolbar-save-status-icon"'), true);
  assert.equal(source.includes("data-state="), true);
});

test("save status slot never uses the forbidden legacy testid", () => {
  const slotSource = readSource("DiagramToolbarSaveStatusSlot.jsx");
  const headerSource = readSource("ProcessStageHeader.jsx");
  assert.equal(slotSource.includes('data-testid="diagram-toolbar-save-status"'), false);
  assert.equal(headerSource.includes('data-testid="diagram-toolbar-save-status"'), false);
});

test("save status slot uses design tokens instead of hardcoded light palette", () => {
  const source = readSource("DiagramToolbarSaveStatusSlot.jsx");
  assert.equal(source.includes("text-muted"), true);
  assert.equal(source.includes("emerald-"), false);
  assert.equal(source.includes("amber-"), false);
  assert.equal(source.includes("sky-"), false);
  assert.equal(source.includes("rose-"), false);
});

test("header mounts the visible slot inside the right status area and drops the invisible anchor marker", () => {
  const source = readSource("ProcessStageHeader.jsx");
  assert.equal(source.includes("DiagramToolbarSaveStatusSlot"), true);
  assert.equal(source.includes('data-testid="diagram-toolbar-notification-anchor"'), false);
  assert.equal(source.includes("diagramToolbarRightStatus"), true);
});
