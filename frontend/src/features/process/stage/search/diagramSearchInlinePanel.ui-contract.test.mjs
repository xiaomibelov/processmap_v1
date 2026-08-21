import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

function readSource(relativePath) {
  return fs.readFileSync(new URL(relativePath, import.meta.url), "utf8");
}

const panelSource = readSource("./diagramSearchInlinePanel.jsx");
const iconSource = readSource("./DiagramSearchTypeIcon.jsx");
const cssSource = readSource("../../../../styles/tailwind.css");

test("dropdown CSS: wide panel (min 420px / 480px typical)", () => {
  assert.ok(
    cssSource.includes("width: min(480px, calc(100vw - 24px))"),
    "panel width should be min(480px, viewport - 24px)",
  );
  assert.ok(
    cssSource.includes("min-width: min(420px, calc(100vw - 24px))"),
    "panel min-width should be min(420px, viewport - 24px)",
  );
  assert.ok(cssSource.includes("max-h-[400px]"), "panel max-height 400px via @apply");
});

test("dropdown CSS: 48px compact result cards", () => {
  assert.ok(
    cssSource.includes(".diagramSearchInlineItem {") && cssSource.includes("h-12"),
    "result item height should be 48px (h-12)",
  );
});

test("dropdown CSS: modern shadow, radius, white bg", () => {
  assert.ok(cssSource.includes("box-shadow: 0 8px 32px"), "deep shadow");
  assert.ok(cssSource.includes("border-radius: 12px"), "radius 12px");
  assert.ok(cssSource.includes("bg-white"), "white background via bg-white");
});

test("panel component: renders collapsible groups, empty state, and stops wheel propagation", () => {
  assert.ok(panelSource.includes("ResultGroup"), "uses ResultGroup subcomponent");
  assert.ok(panelSource.includes("defaultExpanded"), "groups have defaultExpanded");
  assert.ok(panelSource.includes("setExpanded"), "groups are collapsible");
  assert.ok(panelSource.includes("onWheel={handleWheel}"), "stops wheel propagation on panel");
  assert.ok(panelSource.includes("diagramSearchInlineEmpty"), "has empty state");
  assert.ok(cssSource.includes("opacity: 0;") && cssSource.includes(".diagramSearchInlinePanel.isVisible"), "entry animation");
});

test("panel component: no pagination, only scroll", () => {
  assert.ok(!panelSource.includes("diagram-action-search-active-index"), "no active-index pagination");
  assert.ok(!panelSource.includes("Prev"), "no Prev button");
  assert.ok(!panelSource.includes("Next"), "no Next button");
});

test("compact type icon: colored circle with letter per BPMN kind", () => {
  assert.ok(iconSource.includes("resolveTypeIconKind"), "uses kind resolver");
  assert.ok(
    cssSource.includes(".diagramSearchInlineItemIcon {") && cssSource.includes("h-4 w-4"),
    "icon is 16x16 (h-4 w-4)",
  );
  assert.ok(
    cssSource.includes(".diagramSearchInlineItemIcon {") && cssSource.includes("rounded-full"),
    "circular icon via rounded-full",
  );
  assert.ok(iconSource.includes('label: "T"') && iconSource.includes('tone: "#3B82F6"'), "Task blue T");
  assert.ok(iconSource.includes('label: "G"') && iconSource.includes('tone: "#F97316"'), "Gateway orange G");
  assert.ok(iconSource.includes('label: "S"') && iconSource.includes('tone: "#22C55E"'), "SubProcess green S");
});

test("result item: compact layout with title, context, chip, drill arrow", () => {
  assert.ok(panelSource.includes("diagramSearchInlineItemTitle"), "title class");
  assert.ok(panelSource.includes("diagramSearchInlineItemContext"), "context class");
  assert.ok(panelSource.includes("diagramSearchInlineItemProperty"), "property line class");
  assert.ok(panelSource.includes("diagramSearchInlineItemChip"), "type chip class");
  assert.ok(panelSource.includes("diagramSearchInlineItemDrill"), "drill arrow");
  assert.ok(panelSource.includes("isSubprocessSearchRow"), "subprocess row detection");
});
