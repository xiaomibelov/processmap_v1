// Source-text assertions for PropertyDisplaySettings (property-panel-redesign).
// Covers AC1/AC2 (two dropdowns + chips, no checkboxes), AC4 (chip checkmark
// only when active), AC11 (a11y attributes), and the Russian UI copy (UI.md §7).
import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync(new URL("./PropertyDisplaySettings.jsx", import.meta.url), "utf8");

test("compact panel uses two native selects with the documented modes", () => {
  assert.match(source, /data-testid="overlay-display-mode-select"/);
  assert.match(source, /data-testid="overlay-v2-mode-select"/);
  for (const value of ['"hover"', '"always"', '"hidden"']) {
    assert.ok(source.includes(`value: ${value}`), `display option ${value} missing`);
  }
  for (const value of ['"none"', '"all"', '"expanded"']) {
    assert.ok(source.includes(`value: ${value}`), `v2 option ${value} missing`);
  }
  assert.doesNotMatch(source, /type="checkbox"/, "checkboxes must be gone");
});

test("every option has an inline hint", () => {
  const hintCount = (source.match(/hint: "/g) || []).length;
  assert.equal(hintCount, 6, "3 display + 3 v2 hints expected");
  assert.match(source, /Карточка появляется при выделении элемента/);
  assert.match(source, /Карточки видны над всеми задачами/);
  assert.match(source, /Оверлеи не показываются/);
});

test("chips: checkmark rendered only when active, aria-pressed mirrors state", () => {
  assert.match(source, /chip\.active && <CheckIcon/);
  assert.match(source, /aria-pressed=\{chip\.active\}/);
  assert.match(source, /overlayFieldChip--active/);
  assert.match(source, /aria-hidden="true"/, "checkmark must be decorative");
});

test("Russian labels and testids are present", () => {
  assert.match(source, /Свойства над задачей/);
  assert.match(source, /V2-оверлеи/);
  assert.match(source, /Поля в оверлее/);
  assert.match(source, /overlay-field-chip-\$\{chip\.name\}/);
});

test("selects are labelled for screen readers and hints are described", () => {
  assert.match(source, /aria-label="Свойства над задачей"/);
  assert.match(source, /aria-label="V2-оверлеи"/);
  assert.match(source, /aria-describedby="overlay-display-mode-hint"/);
  assert.match(source, /aria-describedby="overlay-v2-mode-hint"/);
  assert.match(source, /role="group" aria-label="Настройки отображения свойств"/);
});
