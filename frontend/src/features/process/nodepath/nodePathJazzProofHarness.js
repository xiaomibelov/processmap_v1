import { createNodePathJazzSpikeAdapter } from "./nodePathJazzSpikeAdapter.js";

const DOC_IDS_STORAGE_KEY = "fpc:nodepath-jazz-docids";
const AUTH_SECRET_STORAGE_KEY = "jazz-logged-in-secret";
const JAZZ_TOOLS_URL_KEY = "fpc:nodepath-jazz-tools-url";
const JAZZ_TOOLS_BROWSER_URL_KEY = "fpc:nodepath-jazz-tools-browser-url";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isSnapshotEqual(a, b) {
  return JSON.stringify(a || null) === JSON.stringify(b || null);
}

function uniqueSnapshotSeries(items) {
  const result = [];
  items.forEach((item) => {
    if (!result.length || !isSnapshotEqual(result[result.length - 1], item)) {
      result.push(item);
    }
  });
  return result;
}

async function waitFor(predicate, { timeoutMs = 15000, intervalMs = 100 } = {}) {
  const startedAt = Date.now();
  for (;;) {
    const result = await predicate();
    if (result) return result;
    if ((Date.now() - startedAt) > timeoutMs) {
      throw new Error("timeout_waiting_for_jazz_condition");
    }
    await sleep(intervalMs);
  }
}

function clearJazzProofState(nodeId) {
  try {
    const raw = window.localStorage?.getItem(DOC_IDS_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    if (parsed && typeof parsed === "object") {
      delete parsed[nodeId];
      window.localStorage?.setItem(DOC_IDS_STORAGE_KEY, JSON.stringify(parsed));
    }
  } catch {
  }
}

function readJsonStorageMap(key) {
  try {
    const raw = window.localStorage?.getItem(key);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeJsonStorageMap(key, value) {
  try {
    window.localStorage?.setItem(key, JSON.stringify(value && typeof value === "object" ? value : {}));
  } catch {
  }
}

function scopedDocKey(scopeId, nodeId) {
  const sid = String(scopeId || "").trim();
  const nid = String(nodeId || "").trim();
  return sid ? `${sid}::${nid}` : nid;
}

function readScopedDocId(scopeId, nodeId) {
  const map = readJsonStorageMap(DOC_IDS_STORAGE_KEY);
  return String(map[scopedDocKey(scopeId, nodeId)] || "").trim();
}

function writeScopedDocId(scopeId, nodeId, docId) {
  const map = readJsonStorageMap(DOC_IDS_STORAGE_KEY);
  map[scopedDocKey(scopeId, nodeId)] = String(docId || "").trim();
  writeJsonStorageMap(DOC_IDS_STORAGE_KEY, map);
}

function deleteScopedDocId(scopeId, nodeId) {
  const map = readJsonStorageMap(DOC_IDS_STORAGE_KEY);
  delete map[scopedDocKey(scopeId, nodeId)];
  writeJsonStorageMap(DOC_IDS_STORAGE_KEY, map);
}

function clearLifecycleStorage(scopeId, nodeId) {
  deleteScopedDocId(scopeId, nodeId);
  try {
    window.localStorage?.removeItem(AUTH_SECRET_STORAGE_KEY);
    window.localStorage?.removeItem(JAZZ_TOOLS_URL_KEY);
    window.localStorage?.removeItem(JAZZ_TOOLS_BROWSER_URL_KEY);
  } catch {
  }
}

export async function runNodePathJazzProof({
  peer,
  nodeId = "proof_node_path_task_1",
} = {}) {
  clearJazzProofState(nodeId);
  const missingNodeId = `${nodeId}__missing`;
  clearJazzProofState(missingNodeId);
  const adapterA = createNodePathJazzSpikeAdapter({ peer });
  const adapterB = createNodePathJazzSpikeAdapter({ peer });
  const adapterC = createNodePathJazzSpikeAdapter({ peer });

  const initialRead = adapterA.readSharedSnapshot(nodeId);
  const missingRead = adapterA.readSharedSnapshot(missingNodeId);

  const firstDraft = { paths: ["P1", "P0", "P1"], sequence_key: "Primary alt 2" };
  const applyResult = await adapterA.applyDraft({ nodeId, draft: firstDraft });
  if (!applyResult?.ok) {
    return {
      ok: false,
      stage: "applyDraft",
      detail: applyResult,
    };
  }

  const readAfterApply = await waitFor(() => {
    const current = adapterA.readSharedSnapshot(nodeId);
    return isSnapshotEqual(current, applyResult.snapshot) ? current : null;
  });

  const repeatedApplyResult = await adapterA.applyDraft({ nodeId, draft: firstDraft });
  if (!repeatedApplyResult?.ok) {
    return {
      ok: false,
      stage: "repeatedApplyDraft",
      detail: repeatedApplyResult,
    };
  }

  const updatesA = [];
  const updatesB = [];
  const offA = adapterA.subscribe(nodeId, (snapshot) => {
    updatesA.push(snapshot);
  });
  const offB = adapterB.subscribe(nodeId, (snapshot) => {
    updatesB.push(snapshot);
  });

  await waitFor(() => updatesA.length >= 1 && updatesB.length >= 1 ? true : null);

  const secondDraft = { paths: ["P2"], sequence_key: "fail_1" };
  const secondApplyResult = await adapterA.applyDraft({ nodeId, draft: secondDraft });
  if (!secondApplyResult?.ok) {
    offA();
    offB();
    return {
      ok: false,
      stage: "secondApplyDraft",
      detail: secondApplyResult,
    };
  }

  const thirdDraft = { paths: ["P0"], sequence_key: "mitigated_2" };
  const thirdApplyResult = await adapterB.applyDraft({ nodeId, draft: thirdDraft });
  if (!thirdApplyResult?.ok) {
    offA();
    offB();
    return {
      ok: false,
      stage: "thirdApplyDraft",
      detail: thirdApplyResult,
    };
  }

  const finalDeliveredSnapshot = await waitFor(() => {
    const currentA = updatesA[updatesA.length - 1] || null;
    const currentB = updatesB[updatesB.length - 1] || null;
    if (!isSnapshotEqual(currentA, thirdApplyResult.snapshot)) return null;
    if (!isSnapshotEqual(currentB, thirdApplyResult.snapshot)) return null;
    return currentB;
  });

  const rehydratedUpdates = [];
  const rehydratedSnapshot = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("timeout_waiting_for_rehydrated_snapshot")), 15000);
    const off = adapterC.subscribe(nodeId, (snapshot) => {
      rehydratedUpdates.push(snapshot);
      if (isSnapshotEqual(snapshot, thirdApplyResult.snapshot)) {
        clearTimeout(timeout);
        off();
        resolve(snapshot);
      }
    });
  });

  const resetResult = await adapterA.clearSharedSnapshot({ nodeId });
  if (!resetResult?.ok) {
    offA();
    offB();
    return {
      ok: false,
      stage: "clearSharedSnapshot",
      detail: resetResult,
    };
  }

  const readAfterReset = await waitFor(() => {
    const current = adapterA.readSharedSnapshot(nodeId);
    return isSnapshotEqual(current, resetResult.snapshot) ? current : null;
  });

  const repeatedResetResult = await adapterA.clearSharedSnapshot({ nodeId });
  if (!repeatedResetResult?.ok) {
    offA();
    offB();
    return {
      ok: false,
      stage: "repeatedClearSharedSnapshot",
      detail: repeatedResetResult,
    };
  }

  const missingResetResult = await adapterA.clearSharedSnapshot({ nodeId: missingNodeId });
  if (!missingResetResult?.ok) {
    offA();
    offB();
    return {
      ok: false,
      stage: "missingNodeClearSharedSnapshot",
      detail: missingResetResult,
    };
  }

  offA();
  offB();

  const uniqueUpdatesA = uniqueSnapshotSeries(updatesA);
  const uniqueUpdatesB = uniqueSnapshotSeries(updatesB);

  return {
    ok: true,
    capabilities: {
      readSharedSnapshot: initialRead,
      missingNodeReadSharedSnapshot: missingRead,
      applyDraft: applyResult.snapshot,
      repeatedApplyDraft: repeatedApplyResult.snapshot,
      subscribeAfterRepeatedExternalUpdates: finalDeliveredSnapshot,
      rehydratedSubscribe: rehydratedSnapshot,
      clearSharedSnapshot: readAfterReset,
      repeatedClearSharedSnapshot: repeatedResetResult.snapshot,
      missingNodeClearSharedSnapshot: missingResetResult.snapshot,
    },
    updatesCount: {
      adapterA: updatesA.length,
      adapterB: updatesB.length,
      rehydrated: rehydratedUpdates.length,
    },
    uniqueUpdateSeries: {
      adapterA: uniqueUpdatesA,
      adapterB: uniqueUpdatesB,
      rehydrated: uniqueSnapshotSeries(rehydratedUpdates),
    },
    readAfterApply,
    readAfterThirdApplyBeforeReset: thirdApplyResult.snapshot,
  };
}

export async function runNodePathJazzMultiNodeProof({
  peer,
  nodeAId = "proof_multi_node_path_task_a",
  nodeBId = "proof_multi_node_path_task_b",
  missingNodeId = "proof_multi_node_path_task_missing",
} = {}) {
  [nodeAId, nodeBId, missingNodeId].forEach((nodeId) => clearJazzProofState(nodeId));
  const adapterA = createNodePathJazzSpikeAdapter({ peer });
  const adapterB = createNodePathJazzSpikeAdapter({ peer });
  const adapterC = createNodePathJazzSpikeAdapter({ peer });

  const initialReads = {
    nodeA: adapterA.readSharedSnapshot(nodeAId),
    nodeB: adapterA.readSharedSnapshot(nodeBId),
    missing: adapterA.readSharedSnapshot(missingNodeId),
  };

  const nodeASeed = await adapterA.applyDraft({
    nodeId: nodeAId,
    draft: { paths: ["P0"], sequence_key: "Primary alt 2" },
  });
  if (!nodeASeed?.ok) {
    return { ok: false, stage: "nodeASeed", detail: nodeASeed };
  }
  const nodeBSeed = await adapterA.applyDraft({
    nodeId: nodeBId,
    draft: { paths: ["P2"], sequence_key: "" },
  });
  if (!nodeBSeed?.ok) {
    return { ok: false, stage: "nodeBSeed", detail: nodeBSeed };
  }

  const updates = {
    adapterA: { [nodeAId]: [], [nodeBId]: [] },
    adapterB: { [nodeAId]: [], [nodeBId]: [] },
    adapterC: { [nodeAId]: [], [nodeBId]: [] },
  };
  const offA_NodeA = adapterA.subscribe(nodeAId, (snapshot) => updates.adapterA[nodeAId].push(snapshot));
  const offA_NodeB = adapterA.subscribe(nodeBId, (snapshot) => updates.adapterA[nodeBId].push(snapshot));
  const offB_NodeA = adapterB.subscribe(nodeAId, (snapshot) => updates.adapterB[nodeAId].push(snapshot));
  const offB_NodeB = adapterB.subscribe(nodeBId, (snapshot) => updates.adapterB[nodeBId].push(snapshot));

  await waitFor(() => (
    updates.adapterA[nodeAId].length >= 1
    && updates.adapterA[nodeBId].length >= 1
    && updates.adapterB[nodeAId].length >= 1
    && updates.adapterB[nodeBId].length >= 1
  ) ? true : null);

  const nodeBExternalFirst = await adapterB.applyDraft({
    nodeId: nodeBId,
    draft: { paths: ["P0", "P2"], sequence_key: "" },
  });
  if (!nodeBExternalFirst?.ok) {
    offA_NodeA();
    offA_NodeB();
    offB_NodeA();
    offB_NodeB();
    return { ok: false, stage: "nodeBExternalFirst", detail: nodeBExternalFirst };
  }

  const nodeAExternalSecond = await adapterA.applyDraft({
    nodeId: nodeAId,
    draft: { paths: ["P1"], sequence_key: "mitigated 7" },
  });
  if (!nodeAExternalSecond?.ok) {
    offA_NodeA();
    offA_NodeB();
    offB_NodeA();
    offB_NodeB();
    return { ok: false, stage: "nodeAExternalSecond", detail: nodeAExternalSecond };
  }

  const nodeBDuplicate = await adapterA.applyDraft({
    nodeId: nodeBId,
    draft: { paths: ["P0", "P2"], sequence_key: "" },
  });
  if (!nodeBDuplicate?.ok) {
    offA_NodeA();
    offA_NodeB();
    offB_NodeA();
    offB_NodeB();
    return { ok: false, stage: "nodeBDuplicate", detail: nodeBDuplicate };
  }

  await waitFor(() => {
    const lastA_NodeA = updates.adapterA[nodeAId][updates.adapterA[nodeAId].length - 1] || null;
    const lastA_NodeB = updates.adapterA[nodeBId][updates.adapterA[nodeBId].length - 1] || null;
    const lastB_NodeA = updates.adapterB[nodeAId][updates.adapterB[nodeAId].length - 1] || null;
    const lastB_NodeB = updates.adapterB[nodeBId][updates.adapterB[nodeBId].length - 1] || null;
    return isSnapshotEqual(lastA_NodeA, nodeAExternalSecond.snapshot)
      && isSnapshotEqual(lastB_NodeA, nodeAExternalSecond.snapshot)
      && isSnapshotEqual(lastA_NodeB, nodeBDuplicate.snapshot)
      && isSnapshotEqual(lastB_NodeB, nodeBDuplicate.snapshot)
      ? true
      : null;
  });

  const rehydrated = await new Promise((resolve, reject) => {
    const result = { nodeA: null, nodeB: null };
    const timeout = setTimeout(() => reject(new Error("timeout_waiting_for_multinode_rehydrated_snapshot")), 15000);
    const maybeResolve = () => {
      if (!result.nodeA || !result.nodeB) return;
      clearTimeout(timeout);
      offC_NodeA();
      offC_NodeB();
      resolve(result);
    };
    const offC_NodeA = adapterC.subscribe(nodeAId, (snapshot) => {
      updates.adapterC[nodeAId].push(snapshot);
      if (isSnapshotEqual(snapshot, nodeAExternalSecond.snapshot)) {
        result.nodeA = snapshot;
        maybeResolve();
      }
    });
    const offC_NodeB = adapterC.subscribe(nodeBId, (snapshot) => {
      updates.adapterC[nodeBId].push(snapshot);
      if (isSnapshotEqual(snapshot, nodeBDuplicate.snapshot)) {
        result.nodeB = snapshot;
        maybeResolve();
      }
    });
  });

  const missingReset = await adapterA.clearSharedSnapshot({ nodeId: missingNodeId });
  const nodeAReset = await adapterB.clearSharedSnapshot({ nodeId: nodeAId });
  if (!missingReset?.ok) {
    offA_NodeA();
    offA_NodeB();
    offB_NodeA();
    offB_NodeB();
    return { ok: false, stage: "missingReset", detail: missingReset };
  }
  if (!nodeAReset?.ok) {
    offA_NodeA();
    offA_NodeB();
    offB_NodeA();
    offB_NodeB();
    return { ok: false, stage: "nodeAReset", detail: nodeAReset };
  }

  await waitFor(() => {
    const lastA_NodeA = updates.adapterA[nodeAId][updates.adapterA[nodeAId].length - 1] || null;
    const lastB_NodeA = updates.adapterB[nodeAId][updates.adapterB[nodeAId].length - 1] || null;
    return isSnapshotEqual(lastA_NodeA, nodeAReset.snapshot) && isSnapshotEqual(lastB_NodeA, nodeAReset.snapshot)
      ? true
      : null;
  });

  offA_NodeA();
  offA_NodeB();
  offB_NodeA();
  offB_NodeB();

  return {
    ok: true,
    initialReads,
    finalSharedSnapshots: {
      nodeA: adapterA.readSharedSnapshot(nodeAId),
      nodeB: adapterA.readSharedSnapshot(nodeBId),
      missing: adapterA.readSharedSnapshot(missingNodeId),
    },
    steps: {
      nodeASeed: nodeASeed.snapshot,
      nodeBSeed: nodeBSeed.snapshot,
      nodeBExternalFirst: nodeBExternalFirst.snapshot,
      nodeAExternalSecond: nodeAExternalSecond.snapshot,
      nodeBDuplicate: nodeBDuplicate.snapshot,
      nodeAReset: nodeAReset.snapshot,
      missingReset: missingReset.snapshot,
      rehydrated,
    },
    uniqueUpdateSeries: {
      adapterA: {
        nodeA: uniqueSnapshotSeries(updates.adapterA[nodeAId]),
        nodeB: uniqueSnapshotSeries(updates.adapterA[nodeBId]),
      },
      adapterB: {
        nodeA: uniqueSnapshotSeries(updates.adapterB[nodeAId]),
        nodeB: uniqueSnapshotSeries(updates.adapterB[nodeBId]),
      },
      adapterC: {
        nodeA: uniqueSnapshotSeries(updates.adapterC[nodeAId]),
        nodeB: uniqueSnapshotSeries(updates.adapterC[nodeBId]),
      },
    },
  };
}

export async function runNodePathJazzLifecycleProof({
  peer,
  scopeId = "proof_lifecycle_session",
  nodeId = "proof_lifecycle_node",
} = {}) {
  clearLifecycleStorage(scopeId, nodeId);
  const baseAdapter = createNodePathJazzSpikeAdapter({ peer, scopeId });
  const seeded = await baseAdapter.applyDraft({
    nodeId,
    draft: { paths: ["P0"], sequence_key: "seed_lifecycle" },
  });
  if (!seeded?.ok) {
    return { ok: false, stage: "seeded_apply", detail: seeded };
  }

  const initialDocId = readScopedDocId(scopeId, nodeId);
  const initialSecret = String(window.localStorage?.getItem(AUTH_SECRET_STORAGE_KEY) || "").trim();
  const validReuseAdapter = createNodePathJazzSpikeAdapter({ peer, scopeId });
  const validReuseUpdates = [];
  const offValidReuse = validReuseAdapter.subscribe(nodeId, (snapshot) => validReuseUpdates.push(snapshot));
  const validReuseSnapshot = await waitFor(() => {
    const current = validReuseUpdates[validReuseUpdates.length - 1] || null;
    return isSnapshotEqual(current, seeded.snapshot) ? current : null;
  });
  offValidReuse();

  writeScopedDocId(scopeId, nodeId, "co_missing_lifecycle_doc");
  const staleDocAdapter = createNodePathJazzSpikeAdapter({ peer, scopeId });
  const staleDocUpdates = [];
  const offStale = staleDocAdapter.subscribe(nodeId, (snapshot) => staleDocUpdates.push(snapshot));
  const staleDocSnapshot = await waitFor(() => {
    const current = staleDocAdapter.readSharedSnapshot(nodeId);
    return isSnapshotEqual(current, { paths: [], sequence_key: "" }) ? current : null;
  });
  offStale();
  await waitFor(() => readScopedDocId(scopeId, nodeId) ? null : true);
  const staleDocIdAfterRecovery = readScopedDocId(scopeId, nodeId);
  const staleDocApply = await staleDocAdapter.applyDraft({
    nodeId,
    draft: { paths: ["P1"], sequence_key: "after_stale_doc" },
  });
  if (!staleDocApply?.ok) {
    return { ok: false, stage: "stale_doc_apply_recovery", detail: staleDocApply };
  }
  const staleDocRecoveredId = readScopedDocId(scopeId, nodeId);

  window.localStorage?.setItem(AUTH_SECRET_STORAGE_KEY, "bogus_secret_corrupted");
  const authDriftAdapter = createNodePathJazzSpikeAdapter({ peer, scopeId });
  const authDriftUpdates = [];
  const offAuth = authDriftAdapter.subscribe(nodeId, (snapshot) => authDriftUpdates.push(snapshot));
  const authBlockedSnapshot = await waitFor(() => {
    const current = authDriftUpdates[authDriftUpdates.length - 1] || null;
    return current?._lifecycle_code === "auth_drift" ? current : null;
  });
  offAuth();
  const authSecretAfterRecovery = String(window.localStorage?.getItem(AUTH_SECRET_STORAGE_KEY) || "").trim();
  const authBlockedApply = await authDriftAdapter.applyDraft({
    nodeId,
    draft: { paths: ["P2"], sequence_key: "after_auth_recovery" },
  });
  if (authBlockedApply?.ok) {
    return { ok: false, stage: "auth_drift_should_block_apply", detail: authBlockedApply };
  }

  deleteScopedDocId(scopeId, nodeId);
  const authRecoveredAdapter = createNodePathJazzSpikeAdapter({ peer, scopeId });
  const authRecoveredApply = await authRecoveredAdapter.applyDraft({
    nodeId,
    draft: { paths: ["P2"], sequence_key: "after_auth_reset" },
  });
  if (!authRecoveredApply?.ok) {
    return { ok: false, stage: "auth_recovered_after_docid_cleanup", detail: authRecoveredApply };
  }

  window.localStorage?.removeItem(AUTH_SECRET_STORAGE_KEY);
  const partialCleanupAdapter = createNodePathJazzSpikeAdapter({ peer, scopeId });
  const partialCleanupUpdates = [];
  const offPartial = partialCleanupAdapter.subscribe(nodeId, (snapshot) => partialCleanupUpdates.push(snapshot));
  const partialCleanupSnapshot = await waitFor(() => {
    const current = partialCleanupUpdates[partialCleanupUpdates.length - 1] || null;
    return current?._lifecycle_code === "auth_drift" ? current : null;
  });
  offPartial();
  const partialCleanupApply = await partialCleanupAdapter.applyDraft({
    nodeId,
    draft: { paths: ["P0", "P2"], sequence_key: "blocked_after_partial_cleanup" },
  });
  if (partialCleanupApply?.ok) {
    return { ok: false, stage: "partial_cleanup_should_block_apply", detail: partialCleanupApply };
  }

  deleteScopedDocId(scopeId, nodeId);
  const postCleanupRecoveryAdapter = createNodePathJazzSpikeAdapter({ peer, scopeId });
  const postCleanupRecoveredApply = await postCleanupRecoveryAdapter.applyDraft({
    nodeId,
    draft: { paths: ["P0", "P2"], sequence_key: "runtime_ready" },
  });
  if (!postCleanupRecoveredApply?.ok) {
    return { ok: false, stage: "post_partial_cleanup_recovery", detail: postCleanupRecoveredApply };
  }

  window.localStorage?.setItem(JAZZ_TOOLS_BROWSER_URL_KEY, "/missing_jazz_tools_browser_runtime.js");
  window.localStorage?.setItem(JAZZ_TOOLS_URL_KEY, "/missing_jazz_tools_runtime.js");
  const runtimeDriftAdapter = createNodePathJazzSpikeAdapter({ peer, scopeId });
  const runtimeDriftFailure = await runtimeDriftAdapter.applyDraft({
    nodeId,
    draft: { paths: ["P0", "P2"], sequence_key: "runtime_fail" },
  });
  window.localStorage?.removeItem(JAZZ_TOOLS_BROWSER_URL_KEY);
  window.localStorage?.removeItem(JAZZ_TOOLS_URL_KEY);
  const runtimeRecoveredApply = await runtimeDriftAdapter.applyDraft({
    nodeId,
    draft: { paths: ["P0", "P2"], sequence_key: "runtime_recovered" },
  });
  if (!runtimeRecoveredApply?.ok) {
    return { ok: false, stage: "runtime_recovered_apply", detail: runtimeRecoveredApply };
  }

  deleteScopedDocId(scopeId, nodeId);
  const missingDocMapAdapter = createNodePathJazzSpikeAdapter({ peer, scopeId });
  const missingDocRead = missingDocMapAdapter.readSharedSnapshot(nodeId);
  const recreatedFromMissingMap = await missingDocMapAdapter.applyDraft({
    nodeId,
    draft: { paths: ["P1", "P2"], sequence_key: "recreated_after_docid_cleanup" },
  });
  if (!recreatedFromMissingMap?.ok) {
    return { ok: false, stage: "recreated_after_docid_cleanup", detail: recreatedFromMissingMap };
  }

  return {
    ok: true,
    scopeId,
    nodeId,
    validReuse: {
      initialDocId,
      initialSecretPresent: !!initialSecret,
      snapshot: validReuseSnapshot,
    },
    staleDocLifecycle: {
      updates: staleDocUpdates,
      clearedSnapshot: staleDocSnapshot,
      docIdAfterDeadLoad: staleDocIdAfterRecovery,
      recoveredSnapshot: staleDocApply.snapshot,
      recoveredDocId: staleDocRecoveredId,
    },
    authDriftLifecycle: {
      blockedSnapshot: authBlockedSnapshot,
      authSecretRecovered: !!authSecretAfterRecovery && authSecretAfterRecovery !== "bogus_secret_corrupted",
      blockedApply: authBlockedApply,
      recoveredAfterDocIdCleanup: authRecoveredApply.snapshot,
    },
    partialCleanupLifecycle: {
      authClearedSnapshot: partialCleanupSnapshot,
      blockedApply: partialCleanupApply,
      authSecretPresentAfterRebootstrap: !!window.localStorage?.getItem(AUTH_SECRET_STORAGE_KEY),
      recoveredAfterDocIdCleanup: postCleanupRecoveredApply.snapshot,
    },
    runtimeDriftLifecycle: {
      initialFailure: runtimeDriftFailure,
      recoveredSnapshot: runtimeRecoveredApply.snapshot,
    },
    missingDocMapLifecycle: {
      readAfterDocIdCleanup: missingDocRead,
      recreatedSnapshot: recreatedFromMissingMap.snapshot,
      recreatedDocId: readScopedDocId(scopeId, nodeId),
    },
  };
}
