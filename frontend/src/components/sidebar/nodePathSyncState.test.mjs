import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import {
  buildNodePathComparableSnapshot,
  deriveNodePathSyncState,
  hasNodePathLocalChanges,
  resolveNodePathStatusState,
} from "./nodePathSyncState.js";

const notesPanelSource = fs.readFileSync(new URL("../NotesPanel.jsx", import.meta.url), "utf8");
const controlsSource = fs.readFileSync(new URL("./ElementSettingsControls.jsx", import.meta.url), "utf8");

test("deriveNodePathSyncState: saved when no diff, no syncing, no error", () => {
  assert.equal(deriveNodePathSyncState({}), "saved");
});

test("deriveNodePathSyncState: local when draft differs and no higher-priority runtime flags exist", () => {
  assert.equal(deriveNodePathSyncState({ hasLocalChanges: true }), "local");
});

test("deriveNodePathSyncState: syncing wins over local", () => {
  assert.equal(deriveNodePathSyncState({ isSyncing: true, hasLocalChanges: true }), "syncing");
});

test("deriveNodePathSyncState: error wins over local when not syncing", () => {
  assert.equal(deriveNodePathSyncState({ hasError: true, hasLocalChanges: true }), "error");
});

test("deriveNodePathSyncState: attention wins over offline and local when not syncing and no fresh error exists", () => {
  assert.equal(deriveNodePathSyncState({ needsAttention: true, isOffline: true, hasLocalChanges: true }), "attention");
});

test("deriveNodePathSyncState: offline wins over local when not syncing and no fresh error exists", () => {
  assert.equal(deriveNodePathSyncState({ isOffline: true, hasLocalChanges: true }), "offline");
});

test("deriveNodePathSyncState: error wins over offline", () => {
  assert.equal(deriveNodePathSyncState({ hasError: true, isOffline: true, hasLocalChanges: true }), "error");
});

test("deriveNodePathSyncState: returns saved after success when no diff remains and error is cleared", () => {
  assert.equal(deriveNodePathSyncState({ isSyncing: false, hasError: false, hasLocalChanges: false }), "saved");
});

test("buildNodePathComparableSnapshot: same meaningful path data in different order compares as saved", () => {
  const saved = buildNodePathComparableSnapshot({ paths: ["P0", "P1"], sequence_key: "primary" });
  const draft = buildNodePathComparableSnapshot({ paths: ["P1", "P0", "P1"], sequence_key: "primary" });
  assert.deepEqual(draft, saved);
  assert.equal(hasNodePathLocalChanges({ draft, saved }), false);
});

test("buildNodePathComparableSnapshot: normalized sequence_key equality compares as saved", () => {
  const saved = buildNodePathComparableSnapshot({ paths: ["P0"], sequence_key: "primary_alt_2" });
  const draft = buildNodePathComparableSnapshot({ paths: ["P0"], sequence_key: " Primary alt 2 " });
  assert.equal(hasNodePathLocalChanges({ draft, saved }), false);
});

test("buildNodePathComparableSnapshot: meaningful field change compares as local", () => {
  const saved = buildNodePathComparableSnapshot({ paths: ["P0"], sequence_key: "primary" });
  const draft = buildNodePathComparableSnapshot({ paths: ["P1"], sequence_key: "primary" });
  assert.equal(hasNodePathLocalChanges({ draft, saved }), true);
});

test("resolveNodePathStatusState: preview/dev override does not affect normal runtime logic unless explicitly enabled", () => {
  assert.equal(resolveNodePathStatusState({
    runtimeState: "local",
    previewState: "",
    previewEnabled: false,
    isDevRuntime: false,
  }), "local");
  assert.equal(resolveNodePathStatusState({
    runtimeState: "attention",
    previewState: "",
    previewEnabled: false,
    isDevRuntime: false,
  }), "attention");
  assert.equal(resolveNodePathStatusState({
    runtimeState: "offline",
    previewState: "",
    previewEnabled: false,
    isDevRuntime: false,
  }), "offline");
  assert.equal(resolveNodePathStatusState({
    runtimeState: "saved",
    previewState: "error",
    previewEnabled: true,
    isDevRuntime: true,
  }), "error");
  assert.equal(resolveNodePathStatusState({
    runtimeState: "saved",
    previewState: "error",
    previewEnabled: false,
    isDevRuntime: false,
  }), "error");
});

test("NotesPanel node path apply flow keeps local draft after failure and clears stale error on edit/apply/success", () => {
  assert.match(notesPanelSource, /const nodePathSyncState = deriveNodePathSyncState\(\{/);
  assert.match(notesPanelSource, /setNodePathApplyFailed\(true\);\s*setNodePathErr\(str\(result\.error \|\| "Не удалось сохранить разметку узла\."\)\);/);
  assert.match(notesPanelSource, /setNodePathApplyFailed\(true\);\s*setNodePathErr\(str\(error\?\.message \|\| error \|\| "Не удалось сохранить разметку узла\."\)\);/);
  assert.match(notesPanelSource, /function toggleNodePathTag\(tagRaw\)[\s\S]*setNodePathApplyFailed\(false\);/);
  assert.match(notesPanelSource, /updateSequenceKey: \(value\) => \{\s*setNodePathApplyFailed\(false\);/);
  assert.match(notesPanelSource, /setNodePathApplyInFlight\(true\);\s*setNodePathApplyFailed\(false\);/);
  assert.match(notesPanelSource, /setNodePathApplyFailed\(false\);\s*setNodePathNeedsAttention\(false\);\s*setNodePathInfo\("Разметка узла сохранена\."\);/);
});

test("NotesPanel node path apply flow preserves precedence syncing > error > attention > offline > local > saved", () => {
  assert.match(notesPanelSource, /const nodePathSyncState = deriveNodePathSyncState\(\{\s*isSyncing: nodePathApplyInFlight,\s*hasError: nodePathApplyFailed,\s*needsAttention: nodePathNeedsAttention,\s*isOffline: nodePathOffline,\s*hasLocalChanges: nodePathHasLocalChanges,\s*\}\);/);
});

test("NotesPanel node path flow listens to browser online/offline events for narrow connectivity hint", () => {
  assert.match(notesPanelSource, /const \[nodePathOffline, setNodePathOffline\] = useState\(\(\) => \(\s*typeof navigator !== "undefined" \? navigator\.onLine === false : false\s*\)\);/);
  assert.match(notesPanelSource, /window\.addEventListener\("online", handleOnline\);/);
  assert.match(notesPanelSource, /window\.addEventListener\("offline", handleOffline\);/);
  assert.match(notesPanelSource, /setNodePathOffline\(false\);/);
  assert.match(notesPanelSource, /setNodePathOffline\(true\);/);
});

test("NotesPanel node path flow marks attention only for same-node baseline drift while dirty and clears it on normal reset points", () => {
  assert.match(notesPanelSource, /const \[nodePathNeedsAttention, setNodePathNeedsAttention\] = useState\(false\);/);
  assert.match(notesPanelSource, /const nodePathDirtyBaselineRef = useRef\(\{ nodeId: "", snapshot: null \}\);/);
  assert.match(notesPanelSource, /if \(!isSelectedPathNode \|\| !selectedElementId \|\| !nodePathHasLocalChanges\) \{/);
  assert.match(notesPanelSource, /if \(!dirtyRef\.snapshot \|\| dirtyRef\.nodeId !== selectedElementId\) \{/);
  assert.match(notesPanelSource, /nodePathDirtyBaselineRef\.current = \{\s*nodeId: selectedElementId,\s*snapshot: selectedNodePathSavedSnapshot,\s*\};/);
  assert.match(notesPanelSource, /const baselineDrifted = hasNodePathLocalChanges\(\{\s*draft: selectedNodePathSavedSnapshot,\s*saved: dirtyRef\.snapshot,\s*\}\);/);
  assert.match(notesPanelSource, /setNodePathNeedsAttention\(false\);/);
});

test("NodePathSettings keeps preview tooling behind explicit debug gate and calm production copy", () => {
  assert.match(controlsSource, /window\.localStorage\?\.getItem\("fpc:nodepath-status-preview"\) === "1"/);
  assert.match(controlsSource, /const resolvedPreviewOverride = requestedSyncPreviewState\s*\|\|\s*\(\(hasDebugPreviewAccess && syncPreviewEnabled\) \? previewSyncState : ""\);/);
  assert.match(controlsSource, /previewState: resolvedPreviewOverride,/);
  assert.match(controlsSource, /helper: "Есть локальные изменения\."/);
  assert.match(controlsSource, /helper: "Нет сети\. Изменения пока останутся локально\."/);
  assert.match(controlsSource, /helper: "Сохранённая версия изменилась\. Нужно сверить изменения\."/);
  assert.match(controlsSource, /helper: "Не удалось синхронизировать изменения\. Локальная версия сохранена\."/);
});
