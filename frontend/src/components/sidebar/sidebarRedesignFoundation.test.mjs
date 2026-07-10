import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(__dirname, "../..");

function readSrc(rel) {
  return readFileSync(resolve(SRC, rel), "utf8");
}

// C1 — sidebar width constants (default 380 / min 300 / max 520).
test("C1: useSidebarWidth constants are 380/300/520", () => {
  const src = readSrc("components/sidebar/useSidebarWidth.js");
  assert.match(src, /const\s+MIN_WIDTH\s*=\s*300\s*;/, "MIN_WIDTH = 300");
  assert.match(src, /const\s+MAX_WIDTH\s*=\s*520\s*;/, "MAX_WIDTH = 520");
  assert.match(src, /const\s+DEFAULT_WIDTH\s*=\s*380\s*;/, "DEFAULT_WIDTH = 380");
});

// C1 — resize handle is always visible (accent @ opacity .3), 6px, 8px on hover,
// with a rightward boundary shadow and persistent ew-resize cursor.
test("C1: resize handle is always-visible accent with boundary shadow", () => {
  const css = readSrc("styles/tailwind.css");
  const block = css.match(/\.sidebarResizeHandle\s*\{[^}]*\}/)?.[0] || "";
  assert.match(block, /width:\s*6px/, "handle width 6px");
  assert.match(block, /background:\s*hsl\(var\(--accent\)\)/, "handle accent background (visible)");
  assert.match(block, /opacity:\s*0?\.3/, "handle resting opacity .3 (always visible)");
  assert.match(block, /box-shadow:\s*2px 0 4px/, "handle rightward boundary shadow");
  assert.match(block, /cursor:\s*ew-resize/, "handle ew-resize cursor");
  const hover = css.match(/\.sidebarResizeHandle:hover\s*\{[^}]*\}/)?.[0] || "";
  assert.match(hover, /width:\s*8px/, "handle hover width 8px");
  assert.match(hover, /opacity:\s*1\b/, "handle hover opacity 1");
});

// C2 — checkboxes are 20px with accent-color from the token; inline-toggle label
// uses text-sm/font-medium/1.4 with py-2 px-3 spacing and wraps long text.
test("C2: checkbox 20px + accent token; inline-toggle readable + wraps", () => {
  const css = readSrc("styles/tailwind.css");
  // Pick the base .sidebarCheckbox block (the one declaring width/height),
  // not the dark-theme override which only restates border/accent.
  const blocks = css.match(/\.sidebarCheckbox\s*\{[^}]*\}/g) || [];
  const cb = blocks.find((b) => /width:/.test(b)) || "";
  assert.match(cb, /width:\s*20px/, "checkbox width 20px");
  assert.match(cb, /height:\s*20px/, "checkbox height 20px");
  assert.match(cb, /accent-color:\s*hsl\(var\(--accent\)\)/, "checkbox accent token");
  const toggle = css.match(/\.sidebarPropertiesInlineToggle\s*\{[^}]*\}/)?.[0] || "";
  assert.match(toggle, /text-sm/, "toggle text-sm");
  assert.match(toggle, /font-medium/, "toggle font-medium");
  assert.match(toggle, /line-height:\s*1\.4/, "toggle line-height 1.4");
  assert.match(toggle, /padding:\s*8px 12px/, "toggle padding py-2 px-3");
  const span = css.match(/\.sidebarPropertiesInlineToggle\s*>\s*span\s*\{[^}]*\}/)?.[0] || "";
  assert.match(span, /overflow-wrap:\s*anywhere|word-break:\s*break-word/, "long label wraps");
});
