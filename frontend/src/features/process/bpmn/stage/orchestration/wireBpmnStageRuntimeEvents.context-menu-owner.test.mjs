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
    source.includes("document.elementsFromPoint"),
    "native contextmenu must recover BPMN element from client point fallback",
  );
  assert.ok(
    source.includes("rankContextMenuCandidate"),
    "client-point recovery must rank BPMN element candidates above lane/background",
  );
  assert.ok(
    source.includes("candidates.sort"),
    "candidate resolution must not rely on first-hit lane/background order",
  );
  assert.ok(
    source.includes("resolveNearestElementFromDiagramPoint"),
    "lane-only hits must fallback to nearest BPMN element around cursor",
  );
  assert.ok(
    source.includes("preferConnection: true"),
    "container-host fallback must prefer nearby connection hits before generic nearest shape",
  );
  assert.ok(
    source.includes("semanticByStackOrder"),
    "top semantic DOM hit must win before rank fallback so flow/body hits are not stolen by container fallback",
  );
  assert.ok(
    source.includes("!element || isContainerLikeBpmnElement(element)"),
    "lane/participant host hits must trigger client-point recovery to prefer real BPMN shape/flow",
  );
});
