// Source-text contract tests for the P0 primitives (property panel UX
// redesign): roles, aria attributes, roving tabindex, testid patterns,
// keyboard model reuse. UI.md §6 / API.md §1.

import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const segmentedSource = fs.readFileSync(new URL("./SegmentedControl.jsx", import.meta.url), "utf8");
const toggleSource = fs.readFileSync(new URL("./ToggleSwitch.jsx", import.meta.url), "utf8");

test("SegmentedControl: radiogroup contract", () => {
  assert.match(segmentedSource, /role="radiogroup"/);
  assert.match(segmentedSource, /role="radio"/);
  assert.match(segmentedSource, /aria-checked=\{isActive \? "true" : "false"\}/);
  assert.match(segmentedSource, /aria-label=\{ariaLabel\}/);
});

test("SegmentedControl: roving tabindex + disabled handling", () => {
  assert.match(segmentedSource, /tabIndex=\{isActive && !isDisabled \? 0 : -1\}/);
  assert.match(segmentedSource, /aria-disabled=\{isDisabled \? "true" : undefined\}/);
});

test("SegmentedControl: keyboard navigation goes through the pure model", () => {
  assert.match(segmentedSource, /import \{ assertValidOptions, nextValueOnKey \} from "\.\/segmentedControlModel\.js"/);
  assert.match(segmentedSource, /nextValueOnKey\(current, event\.key, options\)/);
  assert.match(segmentedSource, /event\.preventDefault\(\)/);
});

test("SegmentedControl: testid patterns", () => {
  assert.match(segmentedSource, /data-testid=\{testIdPrefix\}/);
  assert.match(segmentedSource, /data-testid=\{`\$\{testIdPrefix\}-segment-\$\{optValue\}`\}/);
});

test("ToggleSwitch: switch contract", () => {
  assert.match(toggleSource, /role="switch"/);
  assert.match(toggleSource, /aria-checked=\{isOn \? "true" : "false"\}/);
  assert.match(toggleSource, /type="button"/);
  assert.match(toggleSource, /data-testid=\{testId\}/);
});

test("ToggleSwitch: track and knob are decorative; label is text", () => {
  assert.match(toggleSource, /className="toggleSwitchTrack" aria-hidden="true"/);
  assert.match(toggleSource, /className="toggleSwitchKnob"/);
  assert.match(toggleSource, /className="toggleSwitchLabel"/);
});
