import assert from "node:assert/strict";
import test from "node:test";

import { resolveScrubberVisibilityState } from "./scrubberVisibilityState.js";

test("resolveScrubberVisibilityState returns inactive when scrubber host is inactive", () => {
  assert.equal(
    resolveScrubberVisibilityState({ active: false, manualHidden: false, canScroll: true }),
    "inactive",
  );
});

test("resolveScrubberVisibilityState keeps explicit user-hidden intent regardless of usefulness", () => {
  assert.equal(
    resolveScrubberVisibilityState({ active: true, manualHidden: true, canScroll: true }),
    "user-hidden",
  );
  assert.equal(
    resolveScrubberVisibilityState({ active: true, manualHidden: true, canScroll: false }),
    "user-hidden",
  );
});

test("resolveScrubberVisibilityState auto-collapses only when not useful and not manually hidden", () => {
  assert.equal(
    resolveScrubberVisibilityState({ active: true, manualHidden: false, canScroll: false }),
    "auto-collapsed",
  );
});

test("resolveScrubberVisibilityState returns interactive when useful and not manually hidden", () => {
  assert.equal(
    resolveScrubberVisibilityState({ active: true, manualHidden: false, canScroll: true }),
    "interactive",
  );
});

