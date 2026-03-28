import { describe, it } from "node:test";
import assert from "node:assert/strict";

const INLINE_EDITOR_TOP_OFFSET = 36;
const INLINE_EDITOR_MIN_WIDTH = 120;
const INLINE_EDITOR_FALLBACK_HEIGHT = 72;

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function toFiniteNumber(value, fallback = 0) {
  const next = Number(value);
  return Number.isFinite(next) ? next : fallback;
}

function computeInlineEditorLayout({
  inlineLeft,
  inlineTop,
  inlineWidth,
  containerWidth,
  containerHeight,
  editorHeight,
}) {
  const width = Math.max(INLINE_EDITOR_MIN_WIDTH, Math.round(toFiniteNumber(inlineWidth, 0)));
  const baseLeft = Math.round(toFiniteNumber(inlineLeft, 0));
  const baseTop = Math.round(toFiniteNumber(inlineTop, 0) - INLINE_EDITOR_TOP_OFFSET);
  const validContainer = Number.isFinite(containerWidth)
    && Number.isFinite(containerHeight)
    && containerWidth > 0
    && containerHeight > 0;
  if (!validContainer) {
    return { left: baseLeft, top: baseTop, width };
  }
  const safeHeight = Math.max(1, Math.round(toFiniteNumber(editorHeight, INLINE_EDITOR_FALLBACK_HEIGHT)));
  const maxLeft = Math.max(0, Math.round(containerWidth) - width);
  const maxTop = Math.max(0, Math.round(containerHeight) - safeHeight);
  return {
    left: clamp(baseLeft, 0, maxLeft),
    top: clamp(baseTop, 0, maxTop),
    width,
  };
}

function measureEditorHeight(prevHeight, rectHeight) {
  if (!Number.isFinite(rectHeight) || rectHeight < 1) return prevHeight;
  const next = Math.round(rectHeight);
  return prevHeight === next ? prevHeight : next;
}

function storageToHtml(text) {
  const lines = String(text ?? "").split("\n");
  return lines.map((line) => {
    const escaped = line
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
    return escaped.replace(/\*\*([^*]*)\*\*/g, "<b>$1</b>");
  }).join("<br>");
}

function htmlToStorage(html) {
  return String(html ?? "")
    .replace(/<b>([\s\S]*?)<\/b>/gi, "**$1**")
    .replace(/<strong>([\s\S]*?)<\/strong>/gi, "**$1**")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<div>([\s\S]*?)<\/div>/gi, "\n$1")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&nbsp;/g, " ");
}

describe("DrawioRichTextEditor viewport clamp", () => {
  const containerWidth = 704;
  const containerHeight = 791;
  const editorHeight = 72;

  it("clamps negative top into visible range", () => {
    const layout = computeInlineEditorLayout({
      inlineLeft: 120,
      inlineTop: -223,
      inlineWidth: 160,
      containerWidth,
      containerHeight,
      editorHeight,
    });
    assert.equal(layout.left, 120);
    assert.equal(layout.top, 0);
    assert.equal(layout.width, 160);
  });

  it("clamps negative left into visible range", () => {
    const layout = computeInlineEditorLayout({
      inlineLeft: -67,
      inlineTop: 210,
      inlineWidth: 160,
      containerWidth,
      containerHeight,
      editorHeight,
    });
    assert.equal(layout.left, 0);
    assert.equal(layout.top, 174);
    assert.equal(layout.width, 160);
  });

  it("keeps normal in-range geometry unchanged", () => {
    const layout = computeInlineEditorLayout({
      inlineLeft: 200,
      inlineTop: 300,
      inlineWidth: 160,
      containerWidth,
      containerHeight,
      editorHeight,
    });
    assert.equal(layout.left, 200);
    assert.equal(layout.top, 264);
    assert.equal(layout.width, 160);
  });

  it("keeps top-left near-edge note editor visible", () => {
    const layout = computeInlineEditorLayout({
      inlineLeft: 5,
      inlineTop: 20,
      inlineWidth: 160,
      containerWidth,
      containerHeight,
      editorHeight,
    });
    assert.equal(layout.left, 5);
    assert.equal(layout.top, 0);
  });

  it("clamps right overflow to container bounds", () => {
    const layout = computeInlineEditorLayout({
      inlineLeft: 680,
      inlineTop: 260,
      inlineWidth: 200,
      containerWidth,
      containerHeight,
      editorHeight,
    });
    assert.equal(layout.left, 504);
    assert.equal(layout.top, 224);
    assert.equal(layout.width, 200);
  });
});

describe("DrawioRichTextEditor measured-height clamp behavior", () => {
  it("initial multiline mount can update measured height before final clamp", () => {
    // start from fallback (pre-measure), then mount measurement yields real height.
    let measuredHeight = INLINE_EDITOR_FALLBACK_HEIGHT;
    measuredHeight = measureEditorHeight(measuredHeight, 96);
    const layout = computeInlineEditorLayout({
      inlineLeft: 10,
      inlineTop: 110,
      inlineWidth: 160,
      containerWidth: 220,
      containerHeight: 100,
      editorHeight: measuredHeight,
    });
    // baseTop = 74, maxTop = 4 with measured height 96
    assert.equal(layout.top, 4);
  });

  it("growing content height triggers re-measure and tighter bottom clamp", () => {
    let measuredHeight = INLINE_EDITOR_FALLBACK_HEIGHT; // first render
    let layout = computeInlineEditorLayout({
      inlineLeft: 10,
      inlineTop: 110,
      inlineWidth: 160,
      containerWidth: 220,
      containerHeight: 100,
      editorHeight: measuredHeight,
    });
    // baseTop = 74, maxTop = 28 with fallback 72
    assert.equal(layout.top, 28);

    // user adds lines => content grows => observer/input measurement updates height
    measuredHeight = measureEditorHeight(measuredHeight, 130);
    layout = computeInlineEditorLayout({
      inlineLeft: 10,
      inlineTop: 110,
      inlineWidth: 160,
      containerWidth: 220,
      containerHeight: 100,
      editorHeight: measuredHeight,
    });
    // maxTop = 0 with height 130
    assert.equal(layout.top, 0);
  });

  it("ignores invalid measurements and keeps previous safe height", () => {
    const prev = 96;
    const next = measureEditorHeight(prev, 0);
    assert.equal(next, prev);
  });
});

describe("DrawioRichTextEditor content conversion regression guard", () => {
  it("preserves plain multiline text roundtrip", () => {
    const src = "line1\nline2";
    assert.equal(htmlToStorage(storageToHtml(src)), src);
  });

  it("preserves bold markers roundtrip", () => {
    const src = "before **bold** after";
    assert.equal(htmlToStorage(storageToHtml(src)), src);
  });
});

