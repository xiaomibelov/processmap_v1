import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync(new URL("./App.jsx", import.meta.url), "utf8");

test("App reads shell-owned properties overlay preview only after session shell orchestration initializes it", () => {
  const shellHookIndex = source.indexOf("} = useSessionShellOrchestration({");
  const resetEffectIndex = source.indexOf("setSelectedPropertiesOverlayAlwaysPreview(null);");
  const previewMemoIndex = source.indexOf("const draftPreview = ensureObject(selectedPropertiesOverlayAlwaysPreview);");
  const sidebarMemoIndex = source.indexOf("const hasActiveSession = !!String(shellSessionId || \"\").trim();");
  const selectedElementProbeIndex = source.indexOf("window.__FPC_E2E_SELECTED_ELEMENT_ID__ = String(selectedBpmnElement?.id || \"\").trim();");
  const activationHookIndex = source.indexOf("} = sessionActivation;");
  const openSessionProbeIndex = source.indexOf("window.__FPC_E2E_OPEN_SESSION__ = e2eOpenSession;");

  assert.notEqual(shellHookIndex, -1);
  assert.notEqual(resetEffectIndex, -1);
  assert.notEqual(previewMemoIndex, -1);
  assert.notEqual(sidebarMemoIndex, -1);
  assert.notEqual(selectedElementProbeIndex, -1);
  assert.notEqual(activationHookIndex, -1);
  assert.notEqual(openSessionProbeIndex, -1);
  assert.ok(shellHookIndex < resetEffectIndex);
  assert.ok(shellHookIndex < previewMemoIndex);
  assert.ok(shellHookIndex < sidebarMemoIndex);
  assert.ok(shellHookIndex < selectedElementProbeIndex);
  assert.ok(activationHookIndex < openSessionProbeIndex);
});
