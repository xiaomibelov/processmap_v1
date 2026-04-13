import assert from "node:assert/strict";
import test from "node:test";

import {
  buildViewportScrubberViewState,
  resolveViewportScrubberKeyboardTargetX,
} from "./useViewportScrubberModel.js";

test("buildViewportScrubberViewState computes thumb geometry from snapshot + track width", () => {
  const state = buildViewportScrubberViewState(
    {
      viewbox: {
        x: 200,
        width: 300,
        inner: {
          x: 100,
          width: 1300,
        },
      },
    },
    {
      trackWidth: 500,
      minThumbWidthPx: 30,
    },
  );

  assert.equal(state.canScroll, true);
  assert.equal(Number(state.thumbWidthPercent.toFixed(3)), Number(((300 / 1300) * 100).toFixed(3)));
  assert.equal(Number(state.thumbLeftPercent.toFixed(3)), Number((((200 - 100) / (1300 - 300)) * (1 - (300 / 1300)) * 100).toFixed(3)));
});

test("buildViewportScrubberViewState keeps full-width thumb when content fits viewport", () => {
  const state = buildViewportScrubberViewState(
    {
      viewbox: {
        x: 0,
        width: 640,
        inner: {
          x: 0,
          width: 640,
        },
      },
    },
    {
      trackWidth: 480,
      minThumbWidthPx: 40,
    },
  );

  assert.equal(state.canScroll, false);
  assert.equal(state.thumbLeftPercent, 0);
  assert.equal(state.thumbWidthPercent, 100);
  assert.equal(state.range.travelWidth, 0);
});

test("buildViewportScrubberViewState applies min thumb px guard when visible fraction is tiny", () => {
  const state = buildViewportScrubberViewState(
    {
      viewbox: {
        x: 0,
        width: 80,
        inner: {
          x: 0,
          width: 2200,
        },
      },
    },
    {
      trackWidth: 320,
      minThumbWidthPx: 36,
    },
  );

  assert.equal(state.canScroll, true);
  assert.equal(Number(state.thumbWidthPercent.toFixed(4)), Number(((36 / 320) * 100).toFixed(4)));
});

test("resolveViewportScrubberKeyboardTargetX moves by bounded step for arrow keys", () => {
  const range = {
    canScroll: true,
    contentMinX: 100,
    maxViewboxX: 900,
    viewboxWidth: 320,
  };

  assert.equal(
    resolveViewportScrubberKeyboardTargetX(range, 300, "ArrowLeft"),
    261.6,
  );
  assert.equal(
    resolveViewportScrubberKeyboardTargetX(range, 300, "ArrowRight"),
    338.4,
  );
});

test("resolveViewportScrubberKeyboardTargetX handles Home/End and clamps boundaries", () => {
  const range = {
    canScroll: true,
    contentMinX: 50,
    maxViewboxX: 450,
    viewboxWidth: 200,
  };

  assert.equal(resolveViewportScrubberKeyboardTargetX(range, 280, "Home"), 50);
  assert.equal(resolveViewportScrubberKeyboardTargetX(range, 280, "End"), 450);
  assert.equal(resolveViewportScrubberKeyboardTargetX(range, 55, "ArrowLeft"), 50);
  assert.equal(resolveViewportScrubberKeyboardTargetX(range, 449, "ArrowRight"), 450);
});

test("resolveViewportScrubberKeyboardTargetX ignores unsupported keys and non-scrollable state", () => {
  const range = {
    canScroll: false,
    contentMinX: 0,
    maxViewboxX: 100,
    viewboxWidth: 80,
  };

  assert.equal(resolveViewportScrubberKeyboardTargetX(range, 20, "ArrowRight"), null);
  assert.equal(
    resolveViewportScrubberKeyboardTargetX({ ...range, canScroll: true }, 20, "PageDown"),
    null,
  );
});
