import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { resolveSessionEntryTab } from "./processTabSelection.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const frontendSrc = path.resolve(__dirname, "../../..");

function readFrontend(relativePath) {
  return fs.readFileSync(path.join(frontendSrc, relativePath), "utf8");
}

test("explicit session open intent wins over remembered analysis tab", () => {
  assert.equal(
    resolveSessionEntryTab({
      rememberedTabRaw: "interview",
      intentTabRaw: "diagram",
      currentTabRaw: "interview",
      draft: { bpmn_xml: "<xml />" },
    }),
    "diagram",
  );
});

test("remembered tab is still used when no explicit session entry intent exists", () => {
  assert.equal(
    resolveSessionEntryTab({
      rememberedTabRaw: "interview",
      intentTabRaw: "",
      currentTabRaw: "diagram",
      draft: { bpmn_xml: "<xml />" },
    }),
    "interview",
  );
});

test("editor tab aliases to diagram for old internal callers", () => {
  assert.equal(
    resolveSessionEntryTab({
      rememberedTabRaw: "interview",
      intentTabRaw: "editor",
      currentTabRaw: "interview",
      draft: {},
    }),
    "diagram",
  );
});

test("Explorer and workspace session list opens request Diagram entry", () => {
  const explorerSource = readFrontend("features/explorer/WorkspaceExplorer.jsx");
  assert.match(explorerSource, /openTab:\s*"diagram"[\s\S]*source:\s*"workspace_explorer_session_list"/);

  const processStageSource = readFrontend("components/ProcessStage.jsx");
  assert.match(processStageSource, /onOpenSession=\{\(sessionLike,\s*options\) => onOpenWorkspaceSession\?\.\(sessionLike,\s*options\)\}/);

  const dashboardSource = readFrontend("components/workspace/WorkspaceDashboard.jsx");
  assert.match(dashboardSource, /openTab:\s*"diagram"[\s\S]*source:\s*"workspace_dashboard_session_action"/);
  assert.match(dashboardSource, /openTab:\s*"diagram"[\s\S]*source:\s*"workspace_dashboard_session_row"/);
});

test("generic guarded session open honors explicit process tab intent", () => {
  const appSource = readFrontend("App.jsx");
  assert.match(appSource, /function normalizeOpenProcessTab\(tab\)/);
  assert.match(appSource, /const openTab = normalizeOpenProcessTab\(options\?\.openTab\);[\s\S]*openSession\(targetSid, options\)/);
  assert.match(appSource, /setProcessTabIntent\(\{ sid: intentSid, tab: openTab, nonce: Date\.now\(\) \}\);/);
});
