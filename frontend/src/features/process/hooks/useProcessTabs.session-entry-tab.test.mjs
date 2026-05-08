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
  assert.match(explorerSource, /openTab:\s*options\?\.openTab\s*\|\|\s*"diagram"[\s\S]*source:\s*options\?\.source\s*\|\|\s*"workspace_explorer_session_list"/);
  assert.match(explorerSource, /openTab:\s*"diagram"[\s\S]*source:\s*"workspace_explorer_search_session"/);
  assert.match(explorerSource, /source:\s*"workspace_explorer_session_title"/);
  assert.match(explorerSource, /source:\s*"workspace_explorer_session_cta"/);
  assert.match(explorerSource, /onOpen=\{\(sess,\s*options\) => handleOpenSessionRequest\(/);

  const processStageSource = readFrontend("components/ProcessStage.jsx");
  assert.match(processStageSource, /onOpenSession=\{\(sessionLike,\s*options\) => onOpenWorkspaceSession\?\.\(sessionLike,\s*options\)\}/);
  assert.match(processStageSource, /openTab:\s*options\?\.openTab\s*\|\|\s*"diagram"/);

  const dashboardSource = readFrontend("components/workspace/WorkspaceDashboard.jsx");
  assert.match(dashboardSource, /openTab:\s*"diagram"[\s\S]*source:\s*"workspace_dashboard_session_action"/);
  assert.match(dashboardSource, /function openWorkspaceDashboardSession\(row,\s*source = "workspace_dashboard_session_row"\)/);
  assert.match(dashboardSource, /onOpenSession\?\.\(row,\s*\{ openTab:\s*"diagram", source \}\)/);
  assert.match(dashboardSource, /openWorkspaceDashboardSession\(row,\s*"workspace_dashboard_session_row"\)/);
  assert.match(dashboardSource, /openWorkspaceDashboardSession\(row,\s*"workspace_dashboard_session_title"\)/);
  assert.match(dashboardSource, /openWorkspaceDashboardSession\(row,\s*"workspace_dashboard_session_cta"\)/);
  assert.doesNotMatch(dashboardSource, /onOpenSession\?\.\(toText\(row\?\.id\),\s*\{ openTab:\s*"diagram"/);
});

test("generic guarded session open honors explicit process tab intent", () => {
  const appSource = readFrontend("App.jsx");
  assert.match(appSource, /function normalizeOpenProcessTab\(tab\)/);
  assert.match(appSource, /const row = ensureObject\(sessionIdRaw\);/);
  assert.match(appSource, /row\?\.session_id \|\| row\?\.sessionId \|\| row\?\.id \|\| sessionIdRaw/);
  assert.match(appSource, /const openTab = normalizeOpenProcessTab\(options\?\.openTab\);[\s\S]*openSession\(targetSid, options\)/);
  assert.match(appSource, /setProcessTabIntent\(\{ sid: intentSid, tab: openTab, nonce: Date\.now\(\) \}\);/);
  assert.match(appSource, /return result\?\.ok === false \? result : \{ ok: true,[\s\S]*sessionId: intentSid \|\| sid \};/);
});

test("workspace session activation forwards options into base openSession", () => {
  const orchestrationSource = readFrontend("app/useSessionActivationOrchestration.js");
  assert.match(orchestrationSource, /return openSession\(sid,\s*\{\s*\.\.\.options,\s*source\s*\}\);/);
});
