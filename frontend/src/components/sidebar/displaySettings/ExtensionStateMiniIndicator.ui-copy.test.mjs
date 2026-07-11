// Source-text assertions for ExtensionStateMiniIndicator
// (property-panel-redesign, UI refresh). Covers the mini-icon contract:
// no visible text, tooltip via title + aria-label, tone class, testid.
import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync(new URL("./ExtensionStateMiniIndicator.jsx", import.meta.url), "utf8");

test("mini indicator renders an icon-only status with a testid and tone", () => {
  assert.match(source, /data-testid="extension-state-mini"/);
  assert.match(source, /role="status"/);
  assert.match(source, /data-tone=\{view\.tone\}/);
  assert.match(source, /extensionStateMini--\$\{view\.tone\}/);
});

test("tooltip copy comes from the view-model (title + aria-label)", () => {
  assert.match(source, /title=\{view\.tooltip\}/);
  assert.match(source, /aria-label=\{view\.tooltip\}/);
  assert.match(source, /aria-hidden="true"/, "icons must be decorative");
});

test("busy forces the syncing view", () => {
  assert.match(source, /extensionStateMiniView\(busy \? "syncing" : syncState\)/);
});
