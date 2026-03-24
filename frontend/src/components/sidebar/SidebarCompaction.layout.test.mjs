import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const controlsSource = fs.readFileSync(new URL("./ElementSettingsControls.jsx", import.meta.url), "utf8");
const sectionSource = fs.readFileSync(new URL("./SidebarSection.jsx", import.meta.url), "utf8");
const stylesSource = fs.readFileSync(new URL("../../styles/tailwind.css", import.meta.url), "utf8");

test("Camunda properties sidebar keeps grouped hierarchy with explicit section headers and counts", () => {
  assert.match(controlsSource, /data-testid="camunda-properties-group-general"/);
  assert.match(controlsSource, /data-testid="camunda-properties-group-properties"/);
  assert.match(controlsSource, /data-testid="camunda-properties-group-io"/);
  assert.match(controlsSource, /data-testid="camunda-properties-group-listeners"/);
  assert.match(controlsSource, /const groupedPropertiesCount =/);
  assert.match(controlsSource, /const groupedInputOutputCount =/);
});

test("Listeners rows use compact icon-only delete affordance", () => {
  assert.match(controlsSource, /className="secondaryBtn sidebarPropertiesIconBtn sidebarPropertiesIconBtn--danger"/);
  assert.match(controlsSource, /aria-label="Удалить слушатель"/);
});

test("Sidebar section header uses compact chevron state marker instead of noisy text toggle", () => {
  assert.match(sectionSource, /className="ml-auto sidebarSectionToggleState"/);
  assert.match(sectionSource, /<span className="sr-only">\{open \? "Свернуть" : "Развернуть"\}<\/span>/);
});

test("Sidebar compaction styles include grouped header and compact block meta tokens", () => {
  assert.match(stylesSource, /\.sidebarPropertiesGroupHead \{/);
  assert.match(stylesSource, /\.sidebarPropertiesGroupCount \{/);
  assert.match(stylesSource, /\.sidebarPropertiesBlockMeta \{/);
  assert.match(stylesSource, /\.sidebarSectionToggleState \{/);
});
