import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_GHOST_VISIBILITY,
  GHOST_VISIBILITY_PRESETS,
  normalizeGhostVisibility,
} from "./ghostVisibilityPresets.js";

// T1: пресеты видимости ghost-подложки — значения verbatim из UI.md D2.
// faint === бит-в-бит текущий стиль tobeOverlayUnderlay.css:10-13.

test("presets: ровно 3 пресета — faint/medium/strong", () => {
  assert.deepEqual(Object.keys(GHOST_VISIBILITY_PRESETS).sort(), ["faint", "medium", "strong"]);
});

test("presets: faint === текущий стиль подложки (css:10-13)", () => {
  assert.deepEqual(GHOST_VISIBILITY_PRESETS.faint, {
    opacity: 0.30,
    filter: "grayscale(0.7) saturate(0.4)",
    cssClass: "bpmnLayer--underlayAsis--faint",
  });
});

test("presets: medium и strong — значения verbatim из UI.md D2", () => {
  assert.deepEqual(GHOST_VISIBILITY_PRESETS.medium, {
    opacity: 0.55,
    filter: "grayscale(0.35) saturate(0.75)",
    cssClass: "bpmnLayer--underlayAsis--medium",
  });
  assert.deepEqual(GHOST_VISIBILITY_PRESETS.strong, {
    opacity: 0.85,
    filter: "none",
    cssClass: "bpmnLayer--underlayAsis--strong",
  });
});

test("presets: дефолт — medium", () => {
  assert.equal(DEFAULT_GHOST_VISIBILITY, "medium");
  assert.equal(GHOST_VISIBILITY_PRESETS[DEFAULT_GHOST_VISIBILITY], GHOST_VISIBILITY_PRESETS.medium);
});

test("presets: normalize — валидные значения проходят как есть", () => {
  assert.equal(normalizeGhostVisibility("faint"), "faint");
  assert.equal(normalizeGhostVisibility("medium"), "medium");
  assert.equal(normalizeGhostVisibility("strong"), "strong");
});

test("presets: normalize — unknown/null/undefined → medium", () => {
  assert.equal(normalizeGhostVisibility("bogus"), "medium");
  assert.equal(normalizeGhostVisibility(""), "medium");
  assert.equal(normalizeGhostVisibility(null), "medium");
  assert.equal(normalizeGhostVisibility(undefined), "medium");
});

test("presets: cssClass-стабильность (имена не меняются)", () => {
  assert.equal(GHOST_VISIBILITY_PRESETS.faint.cssClass, "bpmnLayer--underlayAsis--faint");
  assert.equal(GHOST_VISIBILITY_PRESETS.medium.cssClass, "bpmnLayer--underlayAsis--medium");
  assert.equal(GHOST_VISIBILITY_PRESETS.strong.cssClass, "bpmnLayer--underlayAsis--strong");
});
