import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync(new URL("./ProcessStage.jsx", import.meta.url), "utf8");

test("ProcessStage wires closeAllDiagramActions from diagram actions controller into BPMN context menu hook", () => {
  assert.match(
    source,
    /const\s+\{\s*closeAllDiagramActions,\s*stageActions\s*\}\s*=\s*useDiagramActionsController\(/,
  );
  assert.match(
    source,
    /useBpmnDiagramContextMenu\(\{[\s\S]*closeAllDiagramActions,[\s\S]*onActionResult:\s*bpmnPropertiesOverlayController\.handleContextMenuActionResult[\s\S]*\}\)/,
  );
});
