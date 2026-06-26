import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const explorerSource = readFileSync(new URL("./WorkspaceExplorer.jsx", import.meta.url), "utf8");
const apiSource = readFileSync(new URL("./explorerApi.js", import.meta.url), "utf8");

test("explorer API supports eager tree query param", () => {
  assert.match(apiSource, /tree\s*[:=]/);
  assert.match(apiSource, /tree:\s*tree\s*\?\s*"true"\s*:\s*""/);
});

test("ProjectPane reads workspace_auto_expand_steps feature flag", () => {
  assert.match(explorerSource, /useFeatureFlag\("workspace_auto_expand_steps"\)/);
  assert.match(explorerSource, /autoExpand/);
});

test("ProjectPane computes eagerTree from tree and autoExpand flags", () => {
  assert.match(explorerSource, /const eagerTree = treeEnabled && autoExpand;/);
});

test("ProjectPane requests eager tree when auto-expand is enabled", () => {
  assert.match(explorerSource, /await apiGetProjectPage\(workspaceId, projectId, \{\s*tree:\s*true\s*\}\)/s);
});

test("SessionTreeRows renders eager children from session.children", () => {
  assert.match(explorerSource, /eagerTree\s*=/);
  assert.match(explorerSource, /const children = eagerTree\s*\?\s*\(session\?\.children \|\| \[\]\)\s*:\s*\(childrenCache\[sid\] \|\| \[\]\)/s);
});

test("SessionRow displays activity count badge", () => {
  assert.match(explorerSource, /session\?\.activity_count/);
  assert.match(explorerSource, /title="Элементов процесса"/);
});
