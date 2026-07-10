// Pure-JS source-match contract for C4 (quick pinned-slot add/edit + unified
// delete save policy). No jsdom/BpmnModdle — reads source as text so it is not
// blocked by the pre-existing jsdom ERR_REQUIRE_ESM environment issue.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.resolve(__dirname, "../..");
const readSrc = (rel) => fs.readFileSync(path.join(SRC, rel), "utf8");

const CTRL = "components/sidebar/controllers/useBpmnPropertiesController.js";
const ESC = "components/sidebar/ElementSettingsControls.jsx";

test("C4: controller exposes addQuickPropertyRow (preset name, draft push)", () => {
  const ctrl = readSrc(CTRL);
  assert.match(ctrl, /function\s+addQuickPropertyRow\s*\(\s*name\s*,/, "addQuickPropertyRow defined");
  const fn = ctrl.match(/function\s+addQuickPropertyRow[\s\S]*?\n  \}/)?.[0] || "";
  assert.match(fn, /prop_draft_/, "creates a draft id");
  assert.match(fn, /name:\s*nextName/, "writes the preset (trimmed) name");
  assert.ok(/return\s*\{[\s\S]*addQuickPropertyRow,/.test(ctrl), "exported from controller");
});

test("C4: quick empty slot renders an inline-create row + wired create", () => {
  const esc = readSrc(ESC);
  assert.match(esc, /function\s+QuickEmptyPropertyRow\s*\(/, "QuickEmptyPropertyRow component");
  assert.match(esc, /<QuickEmptyPropertyRow/, "empty slot renders QuickEmptyPropertyRow");
  assert.match(esc, /function\s+handleQuickCreate[\s\S]*?addQuickPropertyRow\(\s*name\s*,\s*nextValue\s*\)/,
    "handleQuickCreate calls addQuickPropertyRow(name, value)");
});

test("C4: quick delete is unified with Additional (auto-save via onSaveExtensionState)", () => {
  const esc = readSrc(ESC);
  assert.match(esc, /function\s+handleQuickDelete[\s\S]*?deletePropertyRow\(\s*rowId\s*\)[\s\S]*?onSaveExtensionState\(\s*nextState\s*\)/,
    "handleQuickDelete flushes nextState via onSaveExtensionState");
  assert.match(esc, /deletePropertyRow=\{handleQuickDelete\}/,
    "quick InlineBpmnPropertyRow uses handleQuickDelete");
});
