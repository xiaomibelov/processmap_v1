import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import { deriveNodePathModuleViewState } from "./nodePathModuleController.js";
import { deriveNodePathSyncState } from "../../../components/sidebar/nodePathSyncState.js";
import { deriveNodePathCompareSummary } from "../../../components/sidebar/nodePathCompare.js";

const notesPanelSource = fs.readFileSync(new URL("../../../components/NotesPanel.jsx", import.meta.url), "utf8");
const controlsSource = fs.readFileSync(new URL("../../../components/sidebar/ElementSettingsControls.jsx", import.meta.url), "utf8");
const controllerSource = fs.readFileSync(new URL("./nodePathModuleController.js", import.meta.url), "utf8");
const contractSource = fs.readFileSync(new URL("./NODEPATH_MODULE_CONTRACT.md", import.meta.url), "utf8");

test("deriveNodePathModuleViewState preserves accepted trust precedence", () => {
  assert.equal(deriveNodePathModuleViewState({}).syncState, "saved");
  assert.equal(deriveNodePathModuleViewState({
    localDraft: { paths: ["P0"] },
    sharedSnapshot: { paths: [] },
  }).syncState, "local");
  assert.equal(deriveNodePathModuleViewState({
    localDraft: { paths: ["P0"] },
    sharedSnapshot: { paths: [] },
    isApplying: true,
  }).syncState, "syncing");
  assert.equal(deriveNodePathModuleViewState({
    localDraft: { paths: ["P0"] },
    sharedSnapshot: { paths: [] },
    applyFailed: true,
  }).syncState, "error");
  assert.equal(deriveNodePathModuleViewState({
    localDraft: { paths: ["P0"] },
    sharedSnapshot: { paths: [] },
    needsAttention: true,
  }).syncState, "attention");
  assert.equal(deriveNodePathModuleViewState({
    localDraft: { paths: ["P0"] },
    sharedSnapshot: { paths: [] },
    isOffline: true,
  }).syncState, "offline");
});

test("deriveNodePathModuleViewState compares only meaningful node-path fields", () => {
  const state = deriveNodePathModuleViewState({
    localDraft: { paths: ["P1", "P0", "P1"], sequence_key: "Primary alt 2" },
    sharedSnapshot: { paths: ["P0", "P1"], sequence_key: "primary_alt_2", source: "manual" },
  });
  assert.equal(state.hasLocalChanges, false);
  assert.deepEqual(state.localDraft, state.sharedSnapshot);
});

test("NotesPanel keeps feature-flagged old/new node-path wiring switch explicit", () => {
  assert.match(notesPanelSource, /const nodePathLocalFirstPilotEnabled = isNodePathLocalFirstPilotEnabled\(\);/);
  assert.match(notesPanelSource, /const nodePathModuleController = useNodePathModuleController\(\{/);
  assert.match(notesPanelSource, /const resolvedNodePathController = nodePathLocalFirstPilotEnabled \? nodePathModuleController : \{/);
  assert.match(notesPanelSource, /paths: nodePathDraftPaths,/);
  assert.match(notesPanelSource, /sequenceKey: nodePathDraftSequence,/);
  assert.match(notesPanelSource, /syncState: nodePathSyncState,/);
  assert.match(notesPanelSource, /busy: nodePathBusy,/);
  assert.match(notesPanelSource, /err: nodePathErr,/);
  assert.match(notesPanelSource, /info: nodePathInfo,/);
  assert.match(notesPanelSource, /acceptShared: \(\) => \{/);
  assert.match(notesPanelSource, /nodePathSharedSnapshot=\{isElementMode \? resolvedNodePathController\.sharedSnapshot : null\}/);
  assert.match(notesPanelSource, /onAcceptSharedNodePath=\{resolvedNodePathController\.acceptShared\}/);
});

test("NodePathSettings exposes a truthful attention CTA for accepting the shared version", () => {
  assert.match(controlsSource, /cta: "Принять сохранённую"/);
  assert.match(controlsSource, /resolvedSyncPreviewState === "attention"/);
  assert.match(controlsSource, /return onAcceptSharedNodePath\?\.\(\);/);
  assert.match(controlsSource, /Что отличается/);
  assert.match(controlsSource, /Что сделают действия/);
  assert.match(controlsSource, /Заменит сохранённую версию текущей локальной разметкой этого узла\./);
  assert.match(controlsSource, /Отбросит локальные отличия и вернёт сохранённую версию для этого узла\./);
  assert.match(controlsSource, /Очистит и локальную, и сохранённую разметку этого узла\./);
});

test("deriveNodePathCompareSummary keeps attention compare truth compact and normalized", () => {
  const summary = deriveNodePathCompareSummary({
    localPaths: ["p1", "P0", "P1"],
    sharedPaths: ["P2", "p0"],
    localSequenceKey: "Primary",
    sharedSequenceKey: "mitigated_1",
  });
  assert.deepEqual(summary.localPaths, ["P0", "P1"]);
  assert.deepEqual(summary.sharedPaths, ["P0", "P2"]);
  assert.deepEqual(summary.commonPaths, ["P0"]);
  assert.deepEqual(summary.localOnlyPaths, ["P1"]);
  assert.deepEqual(summary.sharedOnlyPaths, ["P2"]);
  assert.equal(summary.sequenceDiffers, true);
  assert.equal(summary.hasDifferences, true);
});

test("deriveNodePathModuleViewState stays parity-aligned with accepted node-path trust semantics", () => {
  const cases = [
    { isApplying: false, applyFailed: false, needsAttention: false, isOffline: false, hasLocal: false },
    { isApplying: false, applyFailed: false, needsAttention: false, isOffline: false, hasLocal: true },
    { isApplying: true, applyFailed: false, needsAttention: false, isOffline: false, hasLocal: true },
    { isApplying: false, applyFailed: true, needsAttention: true, isOffline: true, hasLocal: true },
    { isApplying: false, applyFailed: false, needsAttention: true, isOffline: true, hasLocal: true },
    { isApplying: false, applyFailed: false, needsAttention: false, isOffline: true, hasLocal: true },
  ];
  cases.forEach((item) => {
    const localDraft = item.hasLocal ? { paths: ["P0"] } : { paths: [] };
    const sharedSnapshot = { paths: [] };
    const moduleState = deriveNodePathModuleViewState({
      localDraft,
      sharedSnapshot,
      isApplying: item.isApplying,
      applyFailed: item.applyFailed,
      needsAttention: item.needsAttention,
      isOffline: item.isOffline,
    });
    const legacyState = deriveNodePathSyncState({
      isSyncing: item.isApplying,
      hasError: item.applyFailed,
      needsAttention: item.needsAttention,
      isOffline: item.isOffline,
      hasLocalChanges: item.hasLocal,
    });
    assert.equal(moduleState.syncState, legacyState);
  });
});

test("node-path module controller stays node-path scoped and adapter-first", () => {
  assert.match(controllerSource, /function readSharedSnapshot\(adapter, nodeId\)/);
  assert.match(controllerSource, /function applyDraft\(adapter, payload\)/);
  assert.match(controllerSource, /function clearSharedSnapshot\(adapter, payload\)/);
  assert.match(controllerSource, /function acceptShared\(\)/);
  assert.match(controllerSource, /setLocalDraft\(acceptedSnapshot\);/);
  assert.match(controllerSource, /adapter\?\.subscribeConnectivity/);
  assert.match(controllerSource, /typeof adapter\?\.subscribe !== "function"/);
  assert.doesNotMatch(controllerSource, /RobotMeta|Camunda|AIQuestions|ElementNotes|StepTime/);
});

test("node-path module controller keeps local draft and attention baseline node-scoped", () => {
  assert.match(controllerSource, /const nodeScopedStateByNodeIdRef = useRef\(new Map\(\)\);/);
  assert.match(controllerSource, /const dirtyBaselineByNodeIdRef = useRef\(new Map\(\)\);/);
  assert.match(controllerSource, /function readNodeScopedState\(nextNodeId, fallbackSharedSnapshot = EMPTY_SNAPSHOT\)/);
  assert.match(controllerSource, /function writeNodeScopedState\(nextNodeId, value\)/);
  assert.match(controllerSource, /dirtyBaselineByNodeIdRef\.current\.set\(normalizedNodeId,/);
  assert.match(controllerSource, /dirtyBaselineByNodeIdRef\.current\.delete\(normalizedNodeId\)/);
});

test("node-path module controller refreshes saved node-local drafts to the latest shared snapshot on rebind", () => {
  assert.match(controllerSource, /const cachedLocalDraft = buildSafeSnapshot\(cached\?\.localDraft \|\| cachedSharedSnapshot\);/);
  assert.match(controllerSource, /const cachedHasLocalChanges = hasNodePathLocalChanges\(\{/);
  assert.match(controllerSource, /localDraft: cachedHasLocalChanges \? cachedLocalDraft : nextSharedSnapshot,/);
});

test("node-path module contract note keeps adapter boundary explicit and narrow", () => {
  assert.match(contractSource, /readSharedSnapshot\(nodeId\)/);
  assert.match(contractSource, /applyDraft\(\{ nodeId, draft \}\)/);
  assert.match(contractSource, /clearSharedSnapshot\(\{ nodeId \}\)/);
  assert.match(contractSource, /apply\/reset\/accept-shared lifecycle/);
  assert.match(contractSource, /`toggleTag`, `updateSequenceKey`, `apply`, `reset`, `acceptShared`/);
  assert.match(contractSource, /trust-state derivation: `saved\/local\/syncing\/error\/offline\/attention`/);
  assert.match(contractSource, /whole sidebar orchestration/);
});
