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

// C3 — quick/additional rows share one rhythm (no double border/padding),
// min-height 40px, py-2, zebra fixed (header excluded) + accent-soft hover.
test("C3: shared row rhythm, no double border, fixed zebra + accent hover", () => {
  const css = readSrc("styles/tailwind.css");
  const item = css.match(/\.sidebarBpmnPropertyItem\s*\{[^}]*\}/)?.[0] || "";
  assert.match(item, /border-bottom:\s*0/, "item no own border (no double)");
  assert.match(item, /padding:\s*0/, "item no own padding");
  const schemaBlocks = css.match(/\.sidebarSchemaPropertyRow\s*\{[^}]*\}/g) || [];
  const schema = schemaBlocks.find((b) => /min-height/.test(b)) || "";
  assert.match(schema, /min-height:\s*40px/, "row min-height 40px");
  assert.match(schema, /padding:\s*8px 0/, "row padding py-2");
  assert.ok(
    css.includes(".sidebarPropertiesRow--quick:nth-child(even)"),
    "zebra includes quick rows (header excluded via :nth-child(even))",
  );
  assert.match(css, /\.sidebarPropertiesRows--zebra[\s\S]*?hsl\(var\(--accent-soft\)\s*\/\s*0\.2\)/,
    "row hover uses accent-soft/20");
});

// C6 — accordion primitive polish: title text-sm/semibold, chevron w-4 h-4,
// count badge px-2 py-0.5 text-xs, group dividers use the border token.
test("C6: accordion title/chevron/badge/divider tokens", () => {
  const css = readSrc("styles/tailwind.css");
  const title = css.match(/\.sidebarAccordionTitle\s*\{[^}]*\}/)?.[0] || "";
  assert.match(title, /font-size:\s*14px/, "title text-sm (14px)");
  assert.match(title, /font-weight:\s*600/, "title semibold");
  const chev = css.match(/\.sidebarAccordionChevron\s*\{[^}]*\}/)?.[0] || "";
  assert.match(chev, /width:\s*16px/, "chevron w-4");
  assert.match(chev, /height:\s*16px/, "chevron h-4");
  const badge = css.match(/\.sidebarAccordionBadge\s*\{[^}]*\}/)?.[0] || "";
  assert.match(badge, /px-2/, "badge px-2");
  assert.match(badge, /py-0\.5/, "badge py-0.5");
  assert.match(badge, /text-xs/, "badge text-xs");
  const acc = css.match(/\.sidebarAccordion\s*\{[^}]*\}/)?.[0] || "";
  assert.match(acc, /hsl\(var\(--border\)\)/, "divider uses border token");
});

// C7 — footer sticks to bottom with a glassy bg + blur; Save is primary blue
// (primaryBtn = bg-accent) and disabled state is opacity 0.5 when clean.
test("C7: sticky glassy footer + disabled opacity 0.5", () => {
  const css = readSrc("styles/tailwind.css");
  // .dark .leftSidebarBottom also contains ".leftSidebarBottom"; pick the block
  // that declares the sticky behavior (the base rule).
  const slots = css.match(/\.leftSidebarBottom\s*\{[^}]*\}/g) || [];
  const slot = slots.find((b) => /sticky/.test(b)) || "";
  assert.match(slot, /sticky/, "footer position sticky");
  assert.match(slot, /bottom-0/, "footer bottom-0");
  assert.match(slot, /backdrop-filter:\s*blur/, "footer backdrop blur");
  assert.match(slot, /rgba\(255,\s*255,\s*255,\s*0\.9\)/, "footer bg white/90");
  const disabled = css.match(/\.sidebarGlobalFooterBtn:disabled[^{]*\{[^}]*\}/)?.[0] || "";
  assert.match(disabled, /opacity:\s*0\.5/, "disabled opacity 0.5");
});

// C8 — sidebar scrolls (overflow-y:auto inline) with a thin 4px accent
// scrollbar; min width is 300 (C1). Firefox uses scrollbar-width/color,
// webkit uses the ::-webkit-scrollbar rules for an exact 4px track.
test("C8: thin 4px accent sidebar scrollbar", () => {
  const css = readSrc("styles/tailwind.css");
  const body = css.match(/\.leftSidebarBody\s*\{[^}]*\}/)?.[0] || "";
  assert.match(body, /scrollbar-color:\s*hsl\(var\(--accent\)\)\s*transparent/, "accent scrollbar-color");
  const webkit = css.match(/\.leftSidebarBody::-webkit-scrollbar\s*\{[^}]*\}/)?.[0] || "";
  assert.match(webkit, /width:\s*4px/, "webkit scrollbar 4px");
  assert.ok(css.includes(".leftSidebarBody::-webkit-scrollbar-thumb"), "webkit thumb styled");
});

// C9 — dark parity: empty quick rows join the dark border group (their light
// border was missed when C3 unified empty/filled rows); footer inner border
// uses the border token so it adapts in dark. Token-based rules (handle,
// checkbox accent, accordion divider, scrollbar) adapt automatically.
test("C9: dark parity for new rules", () => {
  const css = readSrc("styles/tailwind.css");
  assert.ok(
    /\.dark\s+\.sidebarPropertiesRow--quick\s*,/.test(css),
    "empty quick row border covered in dark",
  );
  const inner = css.match(/\.sidebarGlobalFooterInner\s*\{[^}]*\}/)?.[0] || "";
  assert.match(inner, /border-top:\s*1px solid hsl\(var\(--border\)\)/, "footer inner border token");
});
