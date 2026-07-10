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
