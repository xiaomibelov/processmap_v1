// Source-text assertions for LiveCardPreview (property-panel-redesign, Phase 2).
// Covers AC6 (live preview of the overlay card) and the Russian UI copy
// (UI.md §7): title «Превью оверлея», empty state «У элемента нет свойств».
import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync(new URL("./LiveCardPreview.jsx", import.meta.url), "utf8");

test("renders the documented Russian title and empty state", () => {
  assert.match(source, /Превью оверлея/);
  assert.match(source, /У элемента нет свойств/);
  assert.match(source, /data-testid="live-card-preview"/);
});

test("renders preview rows as a list with label/value and a hidden-count tail", () => {
  assert.match(source, /role="list"/);
  assert.match(source, /role="listitem"/);
  assert.match(source, /item\.label/);
  assert.match(source, /item\.value/);
  assert.match(source, /hiddenCount/);
  assert.match(source, /\+\{hiddenCount\}/);
});

test("empty state is shown when the preview is missing, disabled or has no rows", () => {
  assert.match(source, /liveCardPreviewEmpty/);
  // The card must not render without items (no empty card chrome).
  assert.match(source, /items\.length === 0/);
});
