import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const shellSource = readFileSync(new URL("./Bpmn123GameShell.jsx", import.meta.url), "utf8");
const rootAppSource = readFileSync(new URL("../../RootApp.jsx", import.meta.url), "utf8");

test("BPMN 123 shell stays isolated from ProcessMap stage components", () => {
  assert.equal(shellSource.includes("ProcessStage"), false);
  assert.equal(shellSource.includes("BpmnStage"), false);
  assert.equal(shellSource.includes("WorkspaceExplorer"), false);
  assert.equal(shellSource.includes("AdminApp"), false);
});

test("RootApp lazy-loads BPMN 123 before ordinary ProcessMap workspace rendering", () => {
  assert.match(rootAppSource, /lazy\(\(\) => import\("\.\/features\/bpmn123\/Bpmn123GameShell\.jsx"\)\)/);
  assert.match(rootAppSource, /wantsBpmn123 \? \(/);
  assert.ok(rootAppSource.indexOf("wantsBpmn123 ? (") < rootAppSource.indexOf("showWorkspace ? ("));
});
