import assert from "node:assert/strict";
import test from "node:test";

import { normalizeOverlayPropertyKey, overlayPropertyColorByKey } from "./overlayColorModel.js";

test("overlay property color model includes readable text colors for light property chips", () => {
  const model = overlayPropertyColorByKey(" container ");

  assert.equal(model.key, "container");
  assert.match(model.background, /^hsl\(\d+ 74% 88%\)$/);
  assert.match(model.text, /^hsl\(\d+ 48% 18%\)$/);
  assert.match(model.mutedText, /^hsl\(\d+ 32% 28%\)$/);
  assert.match(model.separator, /^hsl\(\d+ 28% 40%\)$/);
  assert.notEqual(model.text, model.background);
  assert.equal(normalizeOverlayPropertyKey("  A   B  "), "a b");
});

test("well-known property names get stable structured hues", () => {
  assert.equal(overlayPropertyColorByKey("ingredient").accent, "hsl(217 62% 46%)");
  assert.equal(overlayPropertyColorByKey("container").accent, "hsl(160 62% 46%)");
  assert.equal(overlayPropertyColorByKey("ee_time").accent, "hsl(0 62% 46%)");
  assert.equal(overlayPropertyColorByKey("equipment").accent, "hsl(36 62% 46%)");
  assert.equal(overlayPropertyColorByKey("responsible").accent, "hsl(262 62% 46%)");
  assert.equal(overlayPropertyColorByKey("operation_code").accent, "hsl(190 62% 46%)");
  // Normalization applies before the lookup.
  assert.equal(overlayPropertyColorByKey(" Ingredient ").accent, "hsl(217 62% 46%)");
});

test("unknown property names get a deterministic hash hue with the same structured palette", () => {
  const model = overlayPropertyColorByKey("some_custom_field");

  assert.equal(model.key, "some_custom_field");
  // hash("some_custom_field") = 104 → visible color, not near-white slate.
  assert.equal(model.accent, "hsl(104 62% 46%)");
  assert.equal(model.background, "hsl(104 74% 88%)");
  assert.equal(model.text, "hsl(104 48% 18%)");
  // Deterministic: same input → same palette.
  assert.deepEqual(overlayPropertyColorByKey("some_custom_field"), model);
  assert.notEqual(model.text, model.background);
});

test("empty key falls back to a neutral slate palette", () => {
  const model = overlayPropertyColorByKey("");

  assert.equal(model.accent, "hsl(215 16% 47%)");
  assert.equal(model.background, "hsl(215 20% 90%)");
});
