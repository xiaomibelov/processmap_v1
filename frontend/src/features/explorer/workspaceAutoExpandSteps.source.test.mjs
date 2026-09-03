import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { readExplorerSources } from "../../test-utils/explorerSourceText.mjs";

// retarget(s0): WorkspaceExplorer.jsx read moved to the multifile explorer source set
// (decomposition-safe); explorerApi.js does not move and is still read directly.
const { text: explorerSource } = readExplorerSources();
const apiSource = readFileSync(new URL("./explorerApi.js", import.meta.url), "utf8");

test("explorer API supports eager tree query param", () => {
  assert.match(apiSource, /tree\s*[:=]/);
  assert.match(apiSource, /tree:\s*tree\s*\?\s*"true"\s*:\s*""/);
});

test("ProjectPane uses lazy tree (no eager auto-expand)", () => {
  assert.match(explorerSource, /const eagerTree = false;/);
});

test("ProjectPane requests rootOnly children meta for lazy tree", () => {
  assert.match(explorerSource, /await apiGetProjectPage\(workspaceId, projectId, \{\s*rootOnly:\s*true,\s*includeChildrenMeta:\s*true\s*\}\)/s);
});

test("SessionTreeRows renders lazy children from childrenCache", () => {
  assert.match(explorerSource, /eagerTree\s*=/);
  assert.match(explorerSource, /const children = eagerTree\s*\?\s*\(session\?\.children \|\| \[\]\)\s*:\s*\(childrenCache\[sid\] \|\| \[\]\)/s);
});

test("SessionRow displays activity count badge", () => {
  assert.match(explorerSource, /session\?\.activity_count/);
  assert.match(explorerSource, /title="Элементов процесса"/);
});

test("SessionRow displays subprocess children count badge", () => {
  assert.match(explorerSource, /session\?\.children_count/);
  assert.match(explorerSource, /title=\{`\$\{session\.children_count\} подпроцессов`\}/);
});

test("SessionRow displays element_id_in_parent label for child rows", () => {
  assert.match(explorerSource, /session\?\.element_id_in_parent/);
  assert.match(explorerSource, /text-\[10px\] text-gray-500/);
});

test("SessionRow shows empty template icon for child sessions with small BPMN XML", () => {
  assert.match(explorerSource, /session\?\.bpmn_xml/);
  assert.match(explorerSource, /title="Пустой шаблон"/);
});

test("SessionRow shows load subprocesses button for root sessions", () => {
  assert.match(explorerSource, /session\?\.subprocesses_count/);
  assert.match(explorerSource, /apiCreateSubprocessSessions/);
  assert.match(explorerSource, /Загрузить остальные/);
});

test("SessionRow handles load subprocess failures inline with toast and retry instead of alert", () => {
  // retarget(s0): was sliced via indexOf("function SessionRow(") .. indexOf("function ActionMenu(");
  // the failure-handling pins are unique to the session row and hold globally over the
  // explorer source set, and the no-alert guard is a global product rule.
  assert.match(explorerSource, /subprocessLoadError/);
  assert.match(explorerSource, /setMoveNotice\("Не удалось догрузить подпроцессы\."\)/);
  assert.match(explorerSource, /InlineErrorRow/);
  assert.match(explorerSource, /onRetry=\{loadAllSubprocesses\}/);
  assert.doesNotMatch(explorerSource, /window\.alert|alert\(/);
});
