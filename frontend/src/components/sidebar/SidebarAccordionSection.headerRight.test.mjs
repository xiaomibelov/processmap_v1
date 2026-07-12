// Source-text assertions for the SidebarAccordion headerRight slot
// (sidebar-redesign-v2, G1): the extension-state mini indicator lives in
// the accordion header, and clicks on it must not toggle the section.
import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync(new URL("./SidebarAccordionSection.jsx", import.meta.url), "utf8");

test("accordion head exposes a headerRight slot before the chevron", () => {
  assert.match(source, /headerRight = null/);
  assert.match(source, /className="sidebarAccordionHeaderRight"/);
  const slotIndex = source.indexOf("sidebarAccordionHeaderRight");
  const chevronIndex = source.indexOf("sidebarAccordionChevron");
  assert.ok(slotIndex > -1 && chevronIndex > -1, "slot and chevron must exist");
  assert.ok(slotIndex < chevronIndex, "slot must render before the chevron");
});

test("clicks on the headerRight slot do not toggle the accordion", () => {
  assert.match(source, /event\.stopPropagation\(\)/);
});
