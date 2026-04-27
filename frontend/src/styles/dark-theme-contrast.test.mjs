import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const tailwindSource = fs.readFileSync(new URL("./tailwind.css", import.meta.url), "utf8");
const topBarSource = fs.readFileSync(new URL("../components/TopBar.jsx", import.meta.url), "utf8");
const notesPanelSource = fs.readFileSync(new URL("../components/NotesMvpPanel.jsx", import.meta.url), "utf8");
const elementSettingsSource = fs.readFileSync(new URL("../components/sidebar/ElementSettingsControls.jsx", import.meta.url), "utf8");
const workspacePermissionsSource = fs.readFileSync(new URL("../features/workspace/workspacePermissions.js", import.meta.url), "utf8");
const versionSource = fs.readFileSync(new URL("../config/appVersion.js", import.meta.url), "utf8");

test("dark theme contrast guard covers sidebar properties and selection states", () => {
  assert.match(tailwindSource, /dark_theme_contrast_guard_v1/);
  assert.match(tailwindSource, /\.dark \.sidebarFieldLabel/);
  assert.match(tailwindSource, /\.dark \.sidebarSelectButton,/);
  assert.match(tailwindSource, /\.dark \.sidebarSelectOption\.isActive,/);
  assert.match(tailwindSource, /\.dark \.sidebarInlineTabs/);
  assert.match(tailwindSource, /\.dark \.sidebarPropertiesInlineToggle \{/);
  assert.match(tailwindSource, /\.dark \.sidebarPropertiesInlineToggle \{[\s\S]*color: #D7E3F9;[\s\S]*\}/);
  assert.match(tailwindSource, /\.dark \.sidebarPropertiesInlineToggle input\[type="checkbox"\] \{[\s\S]*accent-color: #7EB0FF;[\s\S]*\}/);
  assert.match(tailwindSource, /\.dark \.sidebarPropertiesDisplaySettings/);
  assert.match(tailwindSource, /\.dark \.sidebarStatusPill\.is-attention/);
  assert.match(tailwindSource, /\.dark \.sidebarEmptyHint/);
  assert.match(tailwindSource, /\.dark \.bpmnCanvas \.djs-outline/);
  assert.doesNotMatch(elementSettingsSource, /bg-white\/50/);
});

test("dark theme topbar and discussions use semantic colors instead of white status fills", () => {
  assert.match(workspacePermissionsSource, /draft:[\s\S]*dark:border-borderStrong dark:bg-panel2 dark:text-fg/);
  assert.match(topBarSource, /statusComboPill/);
  assert.match(topBarSource, /border-danger\/55 bg-danger\/15 text-danger/);
  assert.match(topBarSource, /hover:border-info\/55 hover:bg-panel2\/85/);
  assert.doesNotMatch(topBarSource, /bg-rose-50 text-rose-900/);
  assert.match(notesPanelSource, /bg-info\/10/);
  assert.match(notesPanelSource, /text-info/);
  assert.match(notesPanelSource, /border-danger\/50 bg-danger\/10 text-danger/);
  assert.doesNotMatch(notesPanelSource, /hover:bg-white/);
  assert.doesNotMatch(notesPanelSource, /bg-white\/85/);
  assert.match(versionSource, /currentVersion: "v1\.0\.19"/);
  assert.match(versionSource, /Исправлена видимость свойств и overlay-текста в тёмной теме\./);
});
