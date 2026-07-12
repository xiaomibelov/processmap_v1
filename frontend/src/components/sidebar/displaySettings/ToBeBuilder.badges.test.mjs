// Source-text assertions for ToBeBuilder (property-panel-redesign, Phase 2).
// Covers AC7/AC8 (summary pills, four status badges, Pool "+" action) and
// a11y (UI.md §6): list roles, aria-pressed toggles, labelled "+" buttons.
// Badge/pill terms are strictly per the user document (UI.md §7).
import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync(new URL("./ToBeBuilder.jsx", import.meta.url), "utf8");

test("summary pills render the documented 'X in To-Be / Y skipped' text", () => {
  assert.match(source, /in To-Be \/ /);
  assert.match(source, / skipped/);
  assert.match(source, /inToBeCount/);
  assert.match(source, /skippedCount/);
});

test("all four status badges are rendered as text with modifier classes", () => {
  assert.match(source, /toBeBadge--inToBe/);
  assert.match(source, /toBeBadge--added/);
  assert.match(source, /toBeBadge--removed/);
  assert.match(source, /toBeBadge--notFilled/);
  assert.match(source, /\{row\.badge\}/, "badge label rendered as text, not color-only");
});

test("section titles and lists follow the documented Russian copy and roles", () => {
  assert.match(source, />To-Be</);
  assert.match(source, /Настроено/);
  assert.match(source, /Не заполнено/);
  assert.match(source, /role="list"/);
  assert.match(source, /role="listitem"/);
});

test("rows toggle To-Be membership with aria-pressed; pool rows add via labelled button", () => {
  assert.match(source, /aria-pressed=/);
  assert.match(source, /onToggleToBe\?\.\(row\.name\)/);
  assert.match(source, /onAddFromPool\?\.\(row\.name\)/);
  assert.match(source, /aria-label=\{`Добавить \$\{row\.name\} в To-Be`\}/);
  assert.match(source, /data-testid=\{`to-be-add-\$\{row\.name\}`\}/);
});
