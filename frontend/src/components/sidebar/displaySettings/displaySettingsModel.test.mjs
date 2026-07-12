import test from "node:test";
import assert from "node:assert/strict";

import {
  DISPLAY_MODES,
  applyDisplayMode,
  deriveDisplayMode,
  sanitizeDisplayMode,
} from "./displaySettingsModel.js";

test("deriveDisplayMode: all input combos map to exactly one mode", () => {
  assert.equal(deriveDisplayMode({ showOnSelect: false, showAlways: false }), "hidden");
  assert.equal(deriveDisplayMode({ showOnSelect: true, showAlways: false }), "hover");
  assert.equal(deriveDisplayMode({ showOnSelect: false, showAlways: true }), "always");
  // always wins over hover (As-Is behavior).
  assert.equal(deriveDisplayMode({ showOnSelect: true, showAlways: true }), "always");
  assert.equal(deriveDisplayMode({}), "hidden");
  assert.equal(deriveDisplayMode(), "hidden");
});

test("applyDisplayMode: hover = on-select ON + always OFF", () => {
  assert.deepEqual(applyDisplayMode("hover"), { showOnSelect: true, showAlways: false });
  assert.deepEqual(applyDisplayMode("hover", { showOnSelect: false }), { showOnSelect: true, showAlways: false });
});

test("applyDisplayMode: hidden = both OFF", () => {
  assert.deepEqual(applyDisplayMode("hidden", { showOnSelect: true }), { showOnSelect: false, showAlways: false });
});

test("applyDisplayMode: always preserves the on-select choice", () => {
  assert.deepEqual(applyDisplayMode("always", { showOnSelect: true }), { showOnSelect: true, showAlways: true });
  assert.deepEqual(applyDisplayMode("always", { showOnSelect: false }), { showOnSelect: false, showAlways: true });
});

test("round-trip: derive(apply(mode)) === mode", () => {
  DISPLAY_MODES.forEach((mode) => {
    assert.equal(deriveDisplayMode(applyDisplayMode(mode, { showOnSelect: true })), mode);
    assert.equal(deriveDisplayMode(applyDisplayMode(mode, { showOnSelect: false })), mode);
  });
});

test("sanitizeDisplayMode: unknown input falls back to hover", () => {
  assert.equal(sanitizeDisplayMode("nope"), "hover");
  assert.equal(sanitizeDisplayMode(""), "hover");
  assert.equal(sanitizeDisplayMode(null), "hover");
  assert.equal(sanitizeDisplayMode(" ALWAYS "), "always");
});
