import { describe, it } from "node:test";
import assert from "node:assert/strict";

/**
 * Pure-logic mirror of readInlineEditGeometry from useDrawioCanvasInteractionExtras.js.
 * Tests the guard that prevents offscreen editor positioning from zero-rect nodes.
 */
function readInlineEditGeometry(svgRect, containerRect) {
  if (!svgRect || !containerRect) return null;
  if (svgRect.width < 1 && svgRect.height < 1) return null;
  return {
    left: Math.round(svgRect.left - containerRect.left),
    top: Math.round(svgRect.top - containerRect.top),
    width: Math.max(80, Math.round(svgRect.width)),
    height: Math.max(28, Math.round(svgRect.height)),
  };
}

describe("readInlineEditGeometry zero-rect guard", () => {
  const container = { left: 200, top: 100, width: 800, height: 600 };

  it("should return geometry for a valid rect", () => {
    const svgRect = { left: 350, top: 250, width: 160, height: 120 };
    const result = readInlineEditGeometry(svgRect, container);
    assert.deepEqual(result, {
      left: 150,
      top: 150,
      width: 160,
      height: 120,
    });
  });

  it("should return null for zero rect (display:none node)", () => {
    const svgRect = { left: 0, top: 0, width: 0, height: 0 };
    const result = readInlineEditGeometry(svgRect, container);
    assert.equal(result, null);
  });

  it("should return null for very small rect (sub-pixel hidden)", () => {
    const svgRect = { left: 0, top: 0, width: 0.5, height: 0.3 };
    const result = readInlineEditGeometry(svgRect, container);
    assert.equal(result, null);
  });

  it("should return geometry when only width is small but height is valid", () => {
    const svgRect = { left: 300, top: 200, width: 0.5, height: 40 };
    const result = readInlineEditGeometry(svgRect, container);
    assert.notEqual(result, null);
    assert.equal(result.height, 40);
  });

  it("should return geometry when only height is small but width is valid", () => {
    const svgRect = { left: 300, top: 200, width: 160, height: 0.5 };
    const result = readInlineEditGeometry(svgRect, container);
    assert.notEqual(result, null);
    assert.equal(result.width, 160);
  });

  it("should clamp width to minimum 80", () => {
    const svgRect = { left: 300, top: 200, width: 40, height: 30 };
    const result = readInlineEditGeometry(svgRect, container);
    assert.equal(result.width, 80);
  });

  it("should clamp height to minimum 28", () => {
    const svgRect = { left: 300, top: 200, width: 160, height: 10 };
    const result = readInlineEditGeometry(svgRect, container);
    assert.equal(result.height, 28);
  });

  it("should return null for null svgRect", () => {
    assert.equal(readInlineEditGeometry(null, container), null);
  });

  it("should return null for null containerRect", () => {
    const svgRect = { left: 300, top: 200, width: 160, height: 120 };
    assert.equal(readInlineEditGeometry(svgRect, null), null);
  });

  it("should not produce negative left from zero-rect (the original bug)", () => {
    // This is the exact scenario: display:none node → getBoundingClientRect = {0,0,0,0}
    // Container is offset from viewport origin → left would be -containerRect.left
    const svgRect = { left: 0, top: 0, width: 0, height: 0 };
    const result = readInlineEditGeometry(svgRect, container);
    // Must return null, NOT { left: -200, top: -100, ... }
    assert.equal(result, null);
  });
});
