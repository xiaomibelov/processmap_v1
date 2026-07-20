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
