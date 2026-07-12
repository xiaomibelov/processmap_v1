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

// C5a — Option C pin model (pin-by-name, persisted per-user) + single source
// of truth for the quick/additional split (controller-owned).
test("C5a: controller owns pin model (defaults + persisted userPins, by name)", () => {
  const ctrl = readSrc(CTRL);
  assert.match(ctrl, /DEFAULT_QUICK_PROPERTY_NAMES\s*=\s*\[\s*"ee_time"\s*,\s*"ingredient_value"\s*\]/,
    "defaults ee_time + ingredient_value");
  assert.match(ctrl, /QUICK_PINS_STORAGE_KEY\s*=\s*"processmap_quick_pins"/,
    "userPins storage key");
  assert.match(ctrl, /localStorage\.setItem\(\s*QUICK_PINS_STORAGE_KEY/, "userPins persisted");
  assert.match(ctrl, /function\s+pinName\s*\(/, "pinName defined");
  assert.match(ctrl, /function\s+unpinName\s*\(/, "unpinName defined");
  assert.match(ctrl, /function\s+isUserPinnedName\s*\(/, "isUserPinnedName defined");
  assert.match(ctrl, /normalizePinName[\s\S]*?toLowerCase\(\)/, "pins normalized (lowercased)");
  for (const sym of ["quickPropertyNames", "quickRows", "otherAdditionalBpmnRows", "userPins", "pinName", "unpinName"]) {
    assert.ok(new RegExp(`return\\s*\\{[\\s\\S]*${sym},`).test(ctrl), `controller returns ${sym}`);
  }
});

test("C5a: ElementSettingsControls consumes the split (no local re-derivation)", () => {
  const esc = readSrc(ESC);
  assert.ok(!/const\s+QUICK_PROPERTY_NAMES\s*=/.test(esc), "no local QUICK_PROPERTY_NAMES");
  assert.ok(!/quickPropertyNamesSet\s*=\s*new\s+Set/.test(esc), "no local quickPropertyNamesSet");
  assert.match(esc, /quickPropertyNames\.map\(\s*\(name\)\s*=>/, "quick table iterates controller quickPropertyNames");
});

test("C5a: delete-from-Quick unpins any pinned row (defaults are initial pins only)", () => {
  const esc = readSrc(ESC);
  const fn = esc.match(/function\s+handleQuickDelete[\s\S]*?\n  \}/)?.[0] || "";
  assert.match(fn, /isUserPinnedName\(\s*rowName\s*\)/, "checks pinned");
  assert.match(fn, /unpinName\(\s*rowName\s*\)/, "unpins pinned rows (defaults included; row kept)");
  assert.match(fn, /deletePropertyRow\(\s*rowId\s*\)[\s\S]*?onSaveExtensionState\(\s*nextState\s*\)/,
    "non-pinned fallback hard-deletes + auto-saves");
});

test("C5a: defaults are initial pins only (seeded, not locked)", () => {
  const ctrl = readSrc(CTRL);
  const pin = ctrl.match(/function\s+pinName[\s\S]*?\n  \}/)?.[0] || "";
  const unpin = ctrl.match(/function\s+unpinName[\s\S]*?\n  \}/)?.[0] || "";
  assert.doesNotMatch(pin, /DEFAULT_QUICK_PROPERTY_NAMES/, "pinName has no default lock");
  assert.doesNotMatch(unpin, /DEFAULT_QUICK_PROPERTY_NAMES/, "unpinName has no default lock (defaults removable)");
  const load = ctrl.match(/function\s+loadQuickPins[\s\S]*?\n\}/)?.[0] || "";
  assert.match(load, /DEFAULT_QUICK_PROPERTY_NAMES/, "fresh users still seeded with defaults");
  assert.match(load, /raw\s*===\s*null/, "stored list (even empty) wins over defaults");
});

// C5b — generic "+ Добавить быстрое свойство" entry (inline name -> create+pin).
test("C5b: generic quick-add button + inline name entry wired to create+pin", () => {
  const esc = readSrc(ESC);
  assert.match(esc, /function\s+QuickNewPropertyRow\s*\(/, "QuickNewPropertyRow component");
  assert.match(esc, /<QuickNewPropertyRow/, "entry row rendered");
  assert.match(esc, /\+\s*Добавить быстрое свойство/, "add button label");
  assert.match(esc, /const\s*\[\s*addingQuick\s*,\s*setAddingQuick\s*\]\s*=\s*useState/, "addingQuick state");
  const fn = esc.match(/function\s+handleQuickAddNamed[\s\S]*?\n  \}/)?.[0] || "";
  assert.match(fn, /addQuickPropertyRow\(\s*name\s*,/, "creates the row");
  assert.match(fn, /pinName\(\s*name\s*\)/, "pins the name");
  assert.match(fn, /setAddingQuick\(\s*false\s*\)/, "closes entry on commit");
});
