import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const menuSource = fs.readFileSync(new URL("./DiagramToolbarOverflowMenu.jsx", import.meta.url), "utf8");
const glueSource = fs.readFileSync(new URL("../controllers/useProcessStageRuntimeGlue.js", import.meta.url), "utf8");
const apiSource = fs.readFileSync(new URL("../../../../lib/api.js", import.meta.url), "utf8");
const routesSource = fs.readFileSync(new URL("../../../../lib/apiRoutes.js", import.meta.url), "utf8");

test("Session ZIP export is wired: route, api blob fetch, glue handler, menu item", () => {
  assert.match(routesSource, /exportZip:\s*\(sessionId\)\s*=>\s*`\/api\/sessions\/\$\{encode\(sessionId\)\}\/export\.zip`/);
  assert.match(apiSource, /export async function apiGetExportZip/);
  assert.match(apiSource, /await resp\.blob\(\)/);
  assert.match(glueSource, /async function exportSessionZip/);
  assert.match(glueSource, /a\.download = `\$\{base\}_\$\{stamp\}\.zip`/);
  assert.match(glueSource, /Экспорт недоступен/);
  assert.match(menuSource, /Экспорт ZIP \(YAML \+ BPMN\)/);
  assert.match(menuSource, /data-testid="bpmn-export-zip-button"/);
  assert.match(menuSource, /onClick=\{closeAfter\(\(\) => void exportSessionZip\?\.\(\)\)\}/);
});
