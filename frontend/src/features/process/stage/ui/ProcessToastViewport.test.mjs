import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";

import { resolveDiagramToolbarAnchorRect } from "./useDiagramToolbarAnchorRect.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function readSource(rel) {
  return fs.readFileSync(path.join(__dirname, rel), "utf8");
}

test("process toast viewport is a single pointer-events-none stack under the toolbar", () => {
  const source = readSource("ProcessToastViewport.jsx");
  assert.equal(source.includes('data-testid="process-toast-viewport"'), true);
  assert.equal(source.includes("pointer-events-none"), true);
  assert.equal(source.includes("flex-col"), true);
  assert.equal(source.includes("anchorRect.bottom + VIEWPORT_TOP_OFFSET_PX"), true);
  assert.equal(source.includes("useDiagramToolbarAnchorRect"), true);
});

test("toast viewport stays below modal layer and above the floating diagram toolbar", () => {
  const source = readSource("ProcessToastViewport.jsx");
  // Z-карта: diagramActionBar 92 < toasts 95 < modals 100 < legacy 120 < account menu 140.
  assert.equal(source.includes("z-[95]"), true);
  assert.equal(source.includes("z-[130]"), false);
});

test("save ack toast supports stack layout without self-positioning", () => {
  const source = readSource("ProcessSaveAckToast.jsx");
  assert.equal(source.includes('layout = ""'), true);
  assert.equal(source.includes('layout === "stack"'), true);
  // Stack-режим отключает anchor-эффект и fixed-позиционирование.
  assert.equal(source.includes("if (isMounted !== true || isStackLayout)"), true);
  assert.equal(source.includes("if (isStackLayout) return null;"), true);
});

test("save ack toast tones carry dark-theme token fallbacks", () => {
  const source = readSource("ProcessSaveAckToast.jsx");
  assert.equal(source.includes("dark:bg-emerald-950"), true);
  assert.equal(source.includes("dark:bg-amber-950"), true);
  assert.equal(source.includes("dark:bg-rose-950"), true);
  assert.equal(source.includes("dark:bg-sky-950"), true);
});

test("hybrid persist toast supports stack layout and pointer-events hygiene", () => {
  const source = readSource("../../hybrid/ui/HybridPersistToast.jsx");
  assert.equal(source.includes('layout = ""'), true);
  assert.equal(source.includes("pointer-events-none"), true);
  assert.equal(source.includes("pointer-events-auto"), true);
  assert.equal(source.includes('data-testid="hybrid-persist-toast-retry"'), true);
  assert.equal(source.includes('data-testid="hybrid-persist-toast-dismiss"'), true);
});

test("anchor resolver prefers floating diagram toolbar and falls back to header surfaces", () => {
  const dom = new JSDOM("<!doctype html><html><body></body></html>", { pretendToBeVisual: true });
  const prevDocument = globalThis.document;
  globalThis.document = dom.window.document;
  try {
    assert.equal(resolveDiagramToolbarAnchorRect(), null);

    const slot = dom.window.document.createElement("div");
    slot.className = "diagramToolbarSlot--right";
    slot.getBoundingClientRect = () => ({
      left: 600, top: 50, right: 900, bottom: 90, width: 300, height: 40,
    });
    dom.window.document.body.appendChild(slot);
    const viaSlot = resolveDiagramToolbarAnchorRect();
    assert.equal(viaSlot?.kind, "header-slot");

    const anchor = dom.window.document.createElement("span");
    anchor.setAttribute("data-testid", "diagram-toolbar-notification-anchor");
    anchor.getBoundingClientRect = () => ({
      left: 640, top: 54, right: 660, bottom: 86, width: 20, height: 32,
    });
    slot.appendChild(anchor);
    const viaAnchor = resolveDiagramToolbarAnchorRect();
    assert.equal(viaAnchor?.kind, "header-anchor");
    assert.equal(viaAnchor?.bottom, 86);

    // Плавающий тулбар канваса — приоритетный якорь: тосты уходят под его bottom.
    const toolbar = dom.window.document.createElement("div");
    toolbar.className = "diagramActionBar";
    toolbar.getBoundingClientRect = () => ({
      left: 100, top: 110, right: 900, bottom: 156, width: 800, height: 46,
    });
    dom.window.document.body.appendChild(toolbar);
    const viaToolbar = resolveDiagramToolbarAnchorRect();
    assert.equal(viaToolbar?.kind, "diagram-toolbar");
    assert.equal(viaToolbar?.bottom, 156);
  } finally {
    globalThis.document = prevDocument;
    dom.window.close();
  }
});
