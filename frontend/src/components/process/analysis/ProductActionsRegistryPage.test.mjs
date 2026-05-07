import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pageSource = fs.readFileSync(path.join(__dirname, "ProductActionsRegistryPage.jsx"), "utf8");
const panelSource = fs.readFileSync(path.join(__dirname, "ProductActionsRegistryPanel.jsx"), "utf8");
const processStageSource = fs.readFileSync(path.join(__dirname, "../../ProcessStage.jsx"), "utf8");
const explorerSource = fs.readFileSync(path.join(__dirname, "../../../features/explorer/WorkspaceExplorer.jsx"), "utf8");
const cssSource = fs.readFileSync(path.join(__dirname, "../../../styles/tailwind.css"), "utf8");

test("registry page is a dedicated product surface, not a modal overlay", () => {
  assert.equal(pageSource.includes('data-testid="product-actions-registry-page"'), true);
  assert.equal(pageSource.includes("page"), true);
  assert.equal(pageSource.includes("showWorkspaceScope"), true);
  assert.doesNotMatch(pageSource, /role="dialog"|aria-modal|productActionsRegistryOverlay/);
});

test("workspace scope uses backend aggregation and does not scan all sessions on frontend", () => {
  assert.match(panelSource, /apiQueryProductActionRegistry/);
  assert.match(panelSource, /Workspace-реестр использует backend-агрегацию/);
  assert.match(panelSource, /не загружает все sessions workspace на frontend/);
  assert.match(panelSource, /data-testid="product-actions-registry-sessions"/);
  assert.match(panelSource, /result\.sessions/);
  assert.match(panelSource, /apiListProjectSessions\(projectId,\s*""\,\s*\{ view: "summary" \}\)/);
  assert.match(panelSource, /apiGetSession\(sid\)/);
  assert.match(panelSource, /PRODUCT_ACTIONS_REGISTRY_SESSION_CAP/);
  assert.doesNotMatch(panelSource, /apiListSessions|apiGetBpmnXml|apiPutBpmnXml|patchInterviewAnalysis|saveProductActionForStep/);
});

test("process and explorer expose product-level registry navigation", () => {
  assert.match(processStageSource, /ProductActionsRegistryPage/);
  assert.match(processStageSource, /buildProductActionsRegistryUrl/);
  assert.match(processStageSource, /onOpenProductActionsRegistry=\{openProductActionsRegistry\}/);
  assert.match(processStageSource, /openProductActionsRegistryProject/);
  assert.match(processStageSource, /openProductActionsRegistrySession/);
  assert.match(processStageSource, /source: options\?\.source \|\| "product_actions_registry"/);
  assert.match(explorerSource, /workspace-product-actions-registry-nav/);
  assert.match(explorerSource, /project-product-actions-registry/);
});

test("page variant removes modal inner scroll behavior", () => {
  assert.match(cssSource, /\.productActionsRegistryPage/);
  assert.match(cssSource, /\.productActionsRegistryPanel--page/);
  assert.match(cssSource, /\.productActionsRegistryPanel--page \.productActionsRegistryPreview,\n\.productActionsRegistryPanel--page \.productActionsRegistrySessionList,\n\.productActionsRegistryPanel--page \.productActionsRegistrySessionSummaryTable \{[\s\S]*overflow: visible;/);
});
