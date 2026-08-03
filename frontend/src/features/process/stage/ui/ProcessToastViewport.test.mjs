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

test("save ack toast supports stack layout without self-positioning", () => {
  const source = readSource("ProcessSaveAckToast.jsx");
  assert.equal(source.includes('layout = ""'), true);
  assert.equal(source.includes('layout === "stack"'), true);
  // Stack-режим отключает anchor-эффект и fixed-позиционирование.
  assert.equal(source.includes("if (isMounted !== true || isStackLayout)"), true);
  assert.equal(source.includes("if (isStackLayout) return null;"), true);
});

test("hybrid persist toast supports stack layout and pointer-events hygiene", () => {
  const source = readSource("../../hybrid/ui/HybridPersistToast.jsx");
  assert.equal(source.includes('layout = ""'), true);
  assert.equal(source.includes("pointer-events-none"), true);
  assert.equal(source.includes("pointer-events-auto"), true);
  assert.equal(source.includes('data-testid="hybrid-persist-toast-retry"'), true);
  assert.equal(source.includes('data-testid="hybrid-persist-toast-dismiss"'), true);
});

test("anchor resolver prefers header notification anchor and falls back safely", () => {
  const dom = new JSDOM("<!doctype html><html><body></body></html>", { pretendToBeVisual: true });
  const prevDocument = globalThis.document;
  globalThis.document = dom.window.document;
  try {
    assert.equal(resolveDiagramToolbarAnchorRect(), null);

    const toolbar = dom.window.document.createElement("div");
    toolbar.className = "diagramActionBar";
    toolbar.getBoundingClientRect = () => ({
      left: 100, top: 50, right: 900, bottom: 90, width: 800, height: 40,
    });
    dom.window.document.body.appendChild(toolbar);
    const viaToolbar = resolveDiagramToolbarAnchorRect();
    assert.equal(viaToolbar?.kind, "diagram-toolbar");

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
  } finally {
    globalThis.document = prevDocument;
    dom.window.close();
  }
});
