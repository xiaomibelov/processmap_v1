import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const viewerCoreCss = fs.readFileSync(
  path.join(__dirname, "app", "02", "02-02-bpmn-viewer-core.css"),
  "utf8",
);

test("bpmn-io watermark is hidden on every canvas render path", () => {
  assert.match(viewerCoreCss, /\.bjs-powered-by\s*\{[^}]*display:\s*none\s*!/s);
});

test("watermark element stays in DOM contract for context-menu guards", () => {
  const guards = [
    "../features/process/bpmn/context-menu/resolveBpmnContextMenuTarget.js",
    "../features/process/bpmn/context-menu/shouldOpenBpmnContextMenu.js",
    "../features/process/bpmn/stage/orchestration/wireBpmnStageRuntimeEvents.js",
  ];
  for (const guard of guards) {
    const source = fs.readFileSync(path.join(__dirname, guard), "utf8");
    assert.match(source, /\.bjs-powered-by/, `${guard} lost the .bjs-powered-by guard`);
  }
});
