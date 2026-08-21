import assert from "node:assert/strict";
import test from "node:test";

import {
  clientXToTrackFraction,
  projectRangeToThumb,
  resolveMinThumbFraction,
  resolveViewportRangeX,
  thumbLeftFractionToViewboxX,
  trackFractionToViewboxX,
} from "./viewportScrubberMath.js";

test("resolveViewportRangeX uses viewbox.inner as full content extent", () => {
  const range = resolveViewportRangeX({
    viewbox: {
      x: 100,
      width: 300,
      inner: {
        x: 0,
        width: 1200,
      },
    },
  });

  assert.equal(range.contentMinX, 0);
  assert.equal(range.contentWidth, 1200);
  assert.equal(range.viewboxWidth, 300);
  assert.equal(range.travelWidth, 900);
  assert.equal(range.maxViewboxX, 900);
  assert.equal(range.viewboxX, 100);
  assert.equal(range.canScroll, true);
});

test("projectRangeToThumb applies min thumb width guard", () => {
  const range = resolveViewportRangeX({
    viewbox: {
      x: 0,
      width: 120,
      inner: {
        x: 0,
        width: 1400,
      },
    },
  });

  const projected = projectRangeToThumb(range, {
    minThumbFraction: resolveMinThumbFraction(300, 40),
  });

  assert.equal(projected.canScroll, true);
  assert.equal(Number(projected.thumbWidthFraction.toFixed(6)), Number((40 / 300).toFixed(6)));
  assert.equal(projected.thumbLeftFraction, 0);
});

test("thumbLeftFractionToViewboxX maps thumb travel to canvas x", () => {
  const range = resolveViewportRangeX({
    viewbox: {
      x: 250,
      width: 300,
      inner: {
        x: 100,
        width: 900,
      },
    },
  });

  const projected = projectRangeToThumb(range, { minThumbFraction: 0 });
  const rightEdgeX = thumbLeftFractionToViewboxX(
    range,
    1 - projected.thumbWidthFraction,
    projected.thumbWidthFraction,
  );

  assert.equal(rightEdgeX, range.maxViewboxX);
});

test("trackFractionToViewboxX performs click-to-jump by thumb center", () => {
  const range = resolveViewportRangeX({
    viewbox: {
      x: 0,
      width: 200,
      inner: {
        x: 0,
        width: 1000,
      },
    },
  });

  const projected = projectRangeToThumb(range, { minThumbFraction: 0 });
  const jumpedX = trackFractionToViewboxX(range, 0.5, projected.thumbWidthFraction);

  assert.equal(jumpedX, 400);
});

test("clientXToTrackFraction clamps pointer position into [0..1]", () => {
  const rect = { left: 100, width: 200 };
  assert.equal(clientXToTrackFraction(50, rect), 0);
  assert.equal(clientXToTrackFraction(100, rect), 0);
  assert.equal(clientXToTrackFraction(200, rect), 0.5);
  assert.equal(clientXToTrackFraction(340, rect), 1);
});
