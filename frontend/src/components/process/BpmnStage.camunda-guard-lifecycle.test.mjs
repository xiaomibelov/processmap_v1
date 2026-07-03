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

test("copy-paste companion clone persists copied session meta so delayed hydrates cannot replay poorer backend truth", () => {
  assert.match(
    source,
    /_sync_source: "bpmn_copy_paste_companion_clone",[\s\S]*persistSessionMetaBoundary\(nextMeta, \{\s*source: "bpmn_copy_paste_companion_clone",\s*\}\)/,
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
  assert.match(source, /const requestedXmlOverride = String\(options\?\.xmlOverride \|\| ""\);/);
  assert.match(
    source,
    /const primaryXmlOverride = requestedXmlOverride\.trim\(\)\s*\?\s*requestedXmlOverride\s*:\s*\(shouldUseCanonicalPrimaryPersist \? preFlushXml : ""\);/,
  );
  assert.match(
    source,
    /coordinator\.flushSave\(persistReason, \{\s*force,\s*trigger,\s*saveOwner: resolvedSaveOwner,\s*xmlOverride: primaryXmlOverride,\s*\}\)/,
  );
});

test("save path exposes camunda finalize transform to coordinator before first persist", () => {
  assert.match(source, /function transformPersistedXml\(xmlText\) \{/);
  assert.match(source, /transformPersistedXml,/);
});

test("template insert reconcile adopts guarded XML properties into local extension-state before finalize", () => {
  assert.match(source, /function reconcileTemplateInsertCamundaStateFromXml\(xmlText, preserveIdsRaw = \[\]\) \{/);
  assert.match(source, /extractCamundaExtensionsMapFromBpmnXml\(xmlText\)/);
  assert.match(source, /upsertCamundaExtensionStateByElementId\(nextMap, elementId, state\)/);
  assert.match(source, /syncDraftCamundaExtensionsMap\(nextMap, "camunda_extensions_template_insert_xml_reconcile"\)/);
  assert.match(
    source,
    /const camundaExtensionsByElementId = reconcileTemplateInsertCamundaStateFromXml\(xmlText, templateInsertGuardIds\);[\s\S]*finalizeCamundaExtensionsXml\(\{[\s\S]*camundaExtensionsByElementId,[\s\S]*preserveManagedForElementIds: templateInsertGuardIds,/,
  );
});

test("template insert seed falls back to template semantic payload under generated element id", () => {
  assert.match(
    source,
    /const state = extractManagedCamundaExtensionStateFromBusinessObject\(target\?\.businessObject\)\s*\|\|\s*resolveCamundaStateFromSemanticPayload\(node\?\.semanticPayload \|\| node\?\.semantic_payload\);/,
  );
  assert.match(source, /upsertCamundaExtensionStateByElementId\(nextMap, targetId, state\)/);
});

test("template insert seed refreshes property overlay preview for generated ids before reload", () => {
  assert.match(source, /import \{ buildPropertiesOverlayPreview \} from "\.\.\/\.\.\/features\/process\/camunda\/propertyDictionaryModel";/);
  assert.match(source, /function refreshPropertiesOverlayPreviewFromCamundaMap\(nextMapRaw, elementIdsRaw = \[\]\) \{/);
  assert.match(source, /propertiesOverlayAlwaysPreviewByElementIdRef\.current = nextPreviewMap;/);
  assert.match(source, /applyPropertiesOverlayDecor\(modelerRef\.current, "editor"\);/);
  assert.match(source, /applyPropertiesOverlayDecor\(viewerRef\.current, "viewer"\);/);
});

test("template insert seed tracks duplicate generated target ids separately", () => {
  assert.match(source, /const seededTargetIds = \[\];/);
  assert.match(source, /seededTargetIds\.push\(targetId\);/);
  assert.match(source, /refreshPropertiesOverlayPreviewFromCamundaMap\(nextMap, seededTargetIds\);/);
  assert.match(source, /return \{ ok: true, seeded, seededTargetIds, nextMeta \};/);
});

test("template/session meta patch uses monotonic diagram version context and remembers conflict current version", () => {
  assert.match(source, /const monotonicBaseDiagramStateVersion = Number\(getBaseDiagramStateVersion\?\.\(\)\);/);
  assert.match(source, /const baseDiagramStateVersion = Number\.isFinite\(monotonicBaseDiagramStateVersion\)[\s\S]*: draftBaseDiagramStateVersion;/);
  assert.match(source, /syncPatchPayload\.base_diagram_state_version = Math\.round\(baseDiagramStateVersion\);/);
  assert.match(source, /errorPayload\?\.server_current_version[\s\S]*errorPayload\?\.serverCurrentVersion/);
  assert.match(source, /rememberDiagramStateVersion\?\.\(Math\.round\(serverCurrentVersion\), \{ sessionId: sid \}\);/);
});

test("camunda finalize explicit persist keeps canonical transport reason while preserving debug suffix in lifecycle logs", () => {
  assert.match(source, /if \(out !== rawOut && flushed\?\.xmlAlreadyTransformed !== true\) \{/);
  assert.match(source, /const transportPersistReason = persistReason;/);
  assert.match(source, /const finalizeLifecycleReason = `\$\{persistReason\}:camunda_finalize`;/);
  assert.match(source, /coordinator\.persistExplicitXml\(out, transportPersistReason, \{/);
  assert.match(source, /ensureBpmnPersistence\(\)\.saveRaw\(sid, out, rev, transportPersistReason\)/);
});
