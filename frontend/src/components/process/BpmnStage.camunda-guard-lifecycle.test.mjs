import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync(new URL("./BpmnStage.jsx", import.meta.url), "utf8");

test("template-insert camunda clear guard is not cleared when sync is skipped", () => {
  assert.match(source, /const camundaSync = templateInsertSeedInFlight[\s\S]*skipped: true/);
  assert.match(source, /const camundaSyncCompleted = Boolean\(camundaSync\?\.ok\) && !Boolean\(camundaSync\?\.skipped\);/);
  assert.match(
    source,
    /if \(\s*templateInsertClearGuardIds\.length\s*&& camundaSyncCompleted\s*&& Number\(camundaSync\?\.preservedManagedSkips \|\| 0\) === 0\s*\)\s*\{\s*clearTemplateInsertCamundaClearGuard\(\);/,
  );
});

test("syncCamundaExtensionsToModeler skips sync while template insert seed is in-flight", () => {
  assert.match(
    source,
    /function syncCamundaExtensionsToModeler\(inst, options = \{\}\) \{\s*const templateInsertSeedInFlight = Number\(templateInsertCamundaSeedInFlightRef\.current \|\| 0\) > 0;\s*if \(templateInsertSeedInFlight\) \{\s*return \{ ok: true, changed: 0, reason: "template_insert_seed_inflight", skipped: true, preservedManagedSkips: 0 \};/,
  );
});

test("syncCamundaExtensionsToModeler always merges template-insert guard ids into preserve list", () => {
  assert.match(source, /const templateInsertGuardIds = readTemplateInsertCamundaClearGuardIds\(\);/);
  assert.match(source, /\[\.\.\.explicitPreserveIds, \.\.\.templateInsertGuardIds(?:, \.\.\.importPreserveGuardIds)?\]/);
  assert.match(source, /preserveManagedForElementIds,/);
});

test("import hydrate keeps managed camunda entries alive until adopted meta is available to sync", () => {
  assert.match(source, /const importCamundaPreserveGuardRef = useRef\(\{ ids: \[\], expiresAt: 0 \}\);/);
  assert.match(source, /const importPreserveGuardIds = readImportCamundaPreserveGuardIds\(\);/);
  assert.match(source, /\[\.\.\.explicitPreserveIds, \.\.\.templateInsertGuardIds, \.\.\.importPreserveGuardIds\]/);
  assert.match(source, /primeImportCamundaPreserveGuard\(extractedElementIds\);/);
  assert.match(source, /draftRef\.current = \{\s*\.\.\.currentDraft,\s*bpmn_meta: nextMeta,\s*\};/);
});

test("import preserve guard self-clears after a real sync no longer needs preservation", () => {
  assert.match(source, /const importGuardWasUsed = importPreserveGuardIds\.length > 0;/);
  assert.match(source, /const syncCompleted = Boolean\(syncResult\?\.ok\) && !Boolean\(syncResult\?\.skipped\);/);
  assert.match(
    source,
    /if \(\s*importGuardWasUsed\s*&& syncCompleted\s*&& Number\(syncResult\?\.preservedManagedSkips \|\| 0\) === 0\s*\)\s*\{\s*clearImportCamundaPreserveGuard\(\);/,
  );
});

test("template-insert guard ids continue to flow into real camunda sync path", () => {
  assert.match(
    source,
    /syncCamundaExtensionsToModeler\(activeModeler, \{\s*preserveManagedForElementIds: templateInsertClearGuardIds,\s*\}\)/,
  );
});

test("template insert claims single-writer ownership before returning insert result", () => {
  assert.match(
    source,
    /const coordinator = ensureBpmnCoordinator\(\);\s*coordinator\.beginSingleWriter\?\.?\("template_apply", \{\s*ttlMs: 15000,\s*reason: "template_insert_start",/,
  );
});

test("template-apply save forwards saveOwner into coordinator flush lane", () => {
  assert.match(source, /const resolvedSaveOwner = isTemplateApplySave \? "template_apply" : requestedSaveOwner;/);
  assert.match(source, /const persistReason = String\(options\?\.persistReason \|\| source\)\.trim\(\) \|\| source;/);
  assert.match(source, /coordinator\.flushSave\(persistReason, \{ force, trigger, saveOwner: resolvedSaveOwner \}\)/);
});

test("save path exposes camunda finalize transform to coordinator before first persist", () => {
  assert.match(source, /function transformPersistedXml\(xmlText\) \{/);
  assert.match(source, /transformPersistedXml,/);
});

test("camunda finalize explicit persist keeps canonical transport reason while preserving debug suffix in lifecycle logs", () => {
  assert.match(source, /if \(out !== rawOut && flushed\?\.xmlAlreadyTransformed !== true\) \{/);
  assert.match(source, /const transportPersistReason = persistReason;/);
  assert.match(source, /const finalizeLifecycleReason = `\$\{persistReason\}:camunda_finalize`;/);
  assert.match(source, /coordinator\.persistExplicitXml\(out, transportPersistReason, \{/);
  assert.match(source, /ensureBpmnPersistence\(\)\.saveRaw\(sid, out, rev, transportPersistReason\)/);
});
