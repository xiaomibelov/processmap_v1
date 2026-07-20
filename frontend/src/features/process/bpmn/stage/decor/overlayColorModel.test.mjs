import assert from "node:assert/strict";
import test from "node:test";

import { normalizeOverlayPropertyKey, overlayPropertyColorByKey } from "./overlayColorModel.js";

test("overlay property color model includes readable text colors for light property chips", () => {
  const model = overlayPropertyColorByKey(" container ");

  assert.equal(model.key, "container");
  assert.match(model.background, /^hsl\(\d+ 74% 95%\)$/);
  assert.match(model.text, /^hsl\(\d+ 48% 18%\)$/);
  assert.match(model.mutedText, /^hsl\(\d+ 32% 30%\)$/);
  assert.match(model.separator, /^hsl\(\d+ 28% 44%\)$/);
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

test("unknown property names fall back to a neutral slate palette", () => {
  const model = overlayPropertyColorByKey("some_custom_field");

  assert.equal(model.key, "some_custom_field");
  assert.equal(model.accent, "hsl(215 16% 47%)");
  assert.equal(model.background, "hsl(210 20% 96%)");
  assert.equal(model.text, "hsl(215 25% 27%)");
  assert.notEqual(model.text, model.background);
});
