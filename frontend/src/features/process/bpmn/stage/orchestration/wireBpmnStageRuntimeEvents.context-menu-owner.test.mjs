import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function readSource() {
  return fs.readFileSync(path.join(__dirname, "wireBpmnStageRuntimeEvents.js"), "utf8");
}

test("native contextmenu interception is owned by stage host, not canvas only", () => {
  const source = readSource();
  assert.ok(
    source.includes('canvasContainer?.closest?.(".bpmnStageHost") || canvasContainer'),
    "context menu owner must include bpmnStageHost wrapper",
  );
});

test("native contextmenu excludes overlay toolbar surfaces", () => {
  const source = readSource();
  assert.ok(
    source.includes(".bpmnCanvasTools"),
    "toolbar surface must be excluded from BPMN context ownership",
  );
  assert.ok(
    source.includes(".diagramActionToolbarGroup"),
    "diagram action toolbar group must be excluded",
  );
  assert.ok(
    source.includes("isPointInsideCanvasRect"),
    "context menu interception must remain bounded to canvas rect",
  );
  assert.ok(
    source.includes("resolveBpmnContextMenuRuntimeResolution"),
    "native contextmenu must delegate semantic hit resolution into shared runtime-target seam",
  );
  assert.ok(
    source.includes("contextMenuResolution: resolution"),
    "shared runtime-target resolution must be forwarded downstream without local semantic recomputation",
  );
  assert.ok(
    source.includes('scope: resolution?.target?.kind === "canvas" ? "canvas" : "element"'),
    "runtime-target seam must be the owner of body-vs-label semantic scope classification",
  );
});
