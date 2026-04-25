import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

test("save ack toast anchors to header notification slot and keeps safe fallbacks", () => {
  const source = fs.readFileSync(path.join(__dirname, "ProcessSaveAckToast.jsx"), "utf8");
  assert.equal(source.includes('document.querySelector(\'[data-testid="diagram-toolbar-notification-anchor"]\')'), true);
  assert.equal(source.includes('document.querySelector(".diagramToolbarSlot--right")'), true);
  assert.equal(source.includes('document.querySelector(".diagramActionBar")'), true);
  assert.equal(source.includes('kind: "header-anchor"'), true);
  assert.equal(source.includes('kind: "header-slot"'), true);
  assert.equal(source.includes('kind: "diagram-toolbar"'), true);
  assert.equal(source.includes("HEADER_TOAST_PREFERRED_WIDTH_PX"), true);
  assert.equal(source.includes("HEADER_TOAST_VERTICAL_OFFSET_PX"), true);
  assert.equal(source.includes("const headerTopFloor = VIEWPORT_GAP_PX + HEADER_TOAST_VERTICAL_OFFSET_PX;"), true);
  assert.equal(source.includes("+ HEADER_TOAST_VERTICAL_OFFSET_PX"), true);
  assert.equal(source.includes("const hasRoomOnLeft = availableLeft >= TOAST_MIN_WIDTH_PX;"), true);
  assert.equal(source.includes("Fallback для узкого viewport"), true);
  assert.equal(source.includes("fixed bottom-5 left-1/2"), true);
  assert.equal(source.includes("bg-emerald-100/95"), true);
  assert.equal(source.includes("bg-amber-100/95"), true);
  assert.equal(source.includes("bg-rose-100/95"), true);
  assert.equal(source.includes("bg-sky-100/95"), true);
  assert.equal(source.includes("text-emerald-900"), true);
  assert.equal(source.includes("text-amber-900"), true);
  assert.equal(source.includes("text-rose-900"), true);
  assert.equal(source.includes("text-sky-900"), true);
});
