// Source-text contract tests for DisplaySettingsBlock (property panel UX
// redesign, P1): RU copy, roles/testids, dependent sub-control behavior.

import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync(new URL("./DisplaySettingsBlock.jsx", import.meta.url), "utf8");

test("DisplaySettingsBlock: RU copy for all segments and controls", () => {
  ["При наведении", "Всегда", "Скрыто", "V2-оверлеи", "Документы", "Компактно", "Раскрыто",
    "Свойства над задачей", "Настройки отображения свойств",
    "Карточка появляется при выделении элемента",
    "Карточки видны над всеми задачами",
    "Оверлеи не показываются"].forEach((copy) => {
    assert.ok(source.includes(copy), `missing copy: ${copy}`);
  });
});

test("DisplaySettingsBlock: uses P0 primitives with stable testids", () => {
  assert.match(source, /import SegmentedControl from "\.\.\/controls\/SegmentedControl\.jsx"/);
  assert.match(source, /import ToggleSwitch from "\.\.\/controls\/ToggleSwitch\.jsx"/);
  assert.match(source, /testIdPrefix="display-mode"/);
  assert.match(source, /testId="v2-toggle"/);
  assert.match(source, /testId="tobe-toggle"/);
  assert.match(source, /testIdPrefix="v2-mode"/);
  assert.match(source, /data-testid="v2-sub-control"/);
});

test("DisplaySettingsBlock: V2 sub-control is hidden (not disabled) when OFF", () => {
  assert.match(source, /v2Enabled \? "v2SubControl v2SubControl--open" : "v2SubControl"/);
  assert.match(source, /aria-hidden=\{v2Enabled \? undefined : "true"\}/);
  assert.match(source, /disabled=\{disabled \|\| !v2Enabled\}/);
});

test("DisplaySettingsBlock: display mode is sanitized through the pure model", () => {
  assert.match(source, /import \{ sanitizeDisplayMode \} from "\.\/displaySettingsModel\.js"/);
  assert.match(source, /sanitizeDisplayMode\(displayMode\)/);
});
