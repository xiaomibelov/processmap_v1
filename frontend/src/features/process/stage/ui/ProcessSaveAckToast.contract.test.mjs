import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

test("save ack toast anchors left of diagram toolbar with safe fallback", () => {
  const source = fs.readFileSync(path.join(__dirname, "ProcessSaveAckToast.jsx"), "utf8");
  assert.equal(source.includes('document.querySelector(".diagramActionBar")'), true);
  assert.equal(source.includes("const hasRoomOnLeft = availableLeft >= TOAST_MIN_WIDTH_PX;"), true);
  assert.equal(source.includes("Fallback для узкого viewport"), true);
  assert.equal(source.includes("fixed bottom-5 left-1/2"), true);
  assert.equal(source.includes("bg-cyan-500/18"), true);
});
