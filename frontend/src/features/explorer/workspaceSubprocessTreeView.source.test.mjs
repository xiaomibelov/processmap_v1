import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const explorerSource = readFileSync(new URL("./WorkspaceExplorer.jsx", import.meta.url), "utf8");
const apiSource = readFileSync(new URL("./explorerApi.js", import.meta.url), "utf8");

test("explorer API supports tree view query params", () => {
  assert.match(apiSource, /apiGetProjectPage\(\s*workspaceId,\s*projectId,\s*\{\s*rootOnly\s*[:=]/);
  assert.match(apiSource, /includeChildrenMeta\s*[:=]/);
});

test("explorer API exposes session children endpoint", () => {
  assert.match(apiSource, /export async function apiGetSessionChildren\(sessionId\)/);
  assert.match(apiSource, /\/api\/sessions\/\$\{encodeURIComponent\(sessionId\)\}\/children/);
});

test("ProjectPane reads workspace_session_tree_view feature flag", () => {
  assert.match(explorerSource, /useFeatureFlag\("workspace_session_tree_view"\)/);
  assert.match(explorerSource, /treeEnabled/);
});

test("ProjectPane conditionally renders tree or flat session list", () => {
  assert.match(explorerSource, /treeEnabled\s*\?\s*\(\s*<SessionTreeRows/s);
  assert.match(explorerSource, /sortedSessions\.map\(\(s\)\s*=>\s*\(\s*<SessionRow/s);
});

test("SessionRow supports tree mode props", () => {
  assert.match(explorerSource, /treeMode\s*=/);
  assert.match(explorerSource, /isExpanded\s*=/);
  assert.match(explorerSource, /isLoadingChildren\s*=/);
  assert.match(explorerSource, /onToggleExpand\s*=/);
  assert.match(explorerSource, /depth\s*=/);
});

test("SessionTreeRows recursively renders child sessions", () => {
  assert.match(explorerSource, /function SessionTreeRows\(/);
  assert.match(explorerSource, /<SessionTreeRows\s*\n?\s*sessions=\{children\}/s);
});
