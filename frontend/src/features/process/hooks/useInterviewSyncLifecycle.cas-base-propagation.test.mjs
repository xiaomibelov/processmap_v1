import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function readSource() {
  return fs.readFileSync(path.join(__dirname, "useInterviewSyncLifecycle.js"), "utf8");
}

test("interview autosave and hydrate secondary patches propagate base_diagram_state_version", () => {
  const source = readSource();
  assert.equal(source.includes("getBaseDiagramStateVersion,"), true);
  assert.equal(source.includes("patchPayload.base_diagram_state_version = Math.round(baseDiagramStateVersion);"), true);
  assert.equal(source.includes("hydratePatchPayload.base_diagram_state_version = Math.round(baseDiagramStateVersion);"), true);
  assert.equal(source.includes("const patchRes = await apiPatchSession(sid, patchPayload);"), true);
  assert.equal(source.includes("const r = await apiPatchSession(sid, hydratePatchPayload);"), true);
});

test("interview autosave and hydrate wait for template-apply owner before reading CAS base", () => {
  const source = readSource();
  assert.equal(source.includes("async function waitForSingleWriterToClear(coordinator, ownerRaw"), true);
  assert.equal(source.includes("coordinator?.getSaveDebugState"), true);
  assert.match(
    source,
    /const waitedForTemplateApply = await waitForSingleWriterToClear\(coordinator, "template_apply"[\s\S]*?const patchPayload = \{ \.\.\.patch \};[\s\S]*?const baseDiagramStateVersion = Number\(getBaseDiagramStateVersion\?\.\(\)\);/,
  );
  assert.match(
    source,
    /const waitedForTemplateApply = await waitForSingleWriterToClear\(coordinator, "template_apply"[\s\S]*?const hydratePatchPayload = \{ \.\.\.savePlan\.patch \};[\s\S]*?const baseDiagramStateVersion = Number\(getBaseDiagramStateVersion\?\.\(\)\);/,
  );
});

test("interview 409 remembers server current version but still propagates the conflict", () => {
  const source = readSource();
  assert.equal(source.includes("rememberDiagramStateVersion,"), true);
  assert.equal(source.includes("const serverCurrentVersion = readServerCurrentDiagramStateVersion(patchRes);"), true);
  assert.equal(source.includes("const serverCurrentVersion = readServerCurrentDiagramStateVersion(r);"), true);
  assert.match(
    source,
    /if \(!patchRes\.ok\) \{[\s\S]*?rememberDiagramStateVersion\?\.\(serverCurrentVersion, \{ sessionId: sid \}\);[\s\S]*?onError\?\.\(shortErr\(patchRes\.error \|\| "Не удалось сохранить Interview"\)\);[\s\S]*?return false;/,
  );
  assert.match(
    source,
    /if \(!r\.ok && !cancelled\) \{[\s\S]*?rememberDiagramStateVersion\?\.\(serverCurrentVersion, \{ sessionId: sid \}\);[\s\S]*?onError\?\.\(shortErr\(r\.error \|\| "Не удалось заполнить Interview из BPMN"\)\);/,
  );
});

test("interview optimistic sync does not carry stale bpmn_meta from draft", () => {
  const source = readSource();
  assert.equal(source.includes("function buildInterviewOptimisticSessionPatch"), true);
  assert.equal(source.includes("...patch,"), true);
  assert.equal(source.includes("_sync_source: \"interview_hydrate_from_bpmn_optimistic\""), true);
  assert.equal(source.includes("_sync_source: \"interview_autosave_optimistic\""), true);
  assert.equal(source.includes("...(draft || {})"), false);
});
