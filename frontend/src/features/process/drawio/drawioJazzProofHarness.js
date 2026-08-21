import { createDrawioJazzSpikeAdapter } from "./drawioJazzSpikeAdapter.js";
import { buildDrawioJazzSnapshot, normalizeDrawioMeta } from "./drawioMeta.js";

const DOC_IDS_STORAGE_KEY = "fpc:drawio-jazz-docids";
const AUTH_SECRET_STORAGE_KEY = "jazz-logged-in-secret";
const JAZZ_TOOLS_URL_KEY = "fpc:drawio-jazz-tools-url";
const JAZZ_TOOLS_BROWSER_URL_KEY = "fpc:drawio-jazz-tools-browser-url";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitFor(predicate, { timeoutMs = 15000, intervalMs = 100 } = {}) {
  const startedAt = Date.now();
  for (;;) {
    const result = await predicate();
    if (result) return result;
    if ((Date.now() - startedAt) > timeoutMs) {
      throw new Error("timeout_waiting_for_drawio_jazz_condition");
    }
    await sleep(intervalMs);
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

function scopedDocKey(scopeId) {
  return String(scopeId || "").trim();
}

function readScopedDocId(scopeId) {
  const map = readJsonStorageMap(DOC_IDS_STORAGE_KEY);
  return String(map[scopedDocKey(scopeId)] || "").trim();
}

function writeScopedDocId(scopeId, docId) {
  const map = readJsonStorageMap(DOC_IDS_STORAGE_KEY);
  map[scopedDocKey(scopeId)] = String(docId || "").trim();
  writeJsonStorageMap(DOC_IDS_STORAGE_KEY, map);
}

function deleteScopedDocId(scopeId) {
  const map = readJsonStorageMap(DOC_IDS_STORAGE_KEY);
  delete map[scopedDocKey(scopeId)];
  writeJsonStorageMap(DOC_IDS_STORAGE_KEY, map);
}

function clearLifecycleStorage(scopeId) {
  deleteScopedDocId(scopeId);
  try {
    window.localStorage?.removeItem(AUTH_SECRET_STORAGE_KEY);
    window.localStorage?.removeItem(JAZZ_TOOLS_URL_KEY);
    window.localStorage?.removeItem(JAZZ_TOOLS_BROWSER_URL_KEY);
  } catch {
  }
}

function makeSnapshot({
  docXml = "",
  svgCache = "",
  lastSavedAt = "",
  enabled = true,
  activeLayerId = "DL1",
  elementId = "shape_1",
} = {}) {
  return buildDrawioJazzSnapshot({
    enabled,
    locked: false,
    opacity: 1,
    last_saved_at: lastSavedAt || new Date().toISOString(),
    doc_xml: docXml,
    svg_cache: svgCache,
    page: { index: 0 },
    transform: { x: 0, y: 0 },
    drawio_layers_v1: [{ id: "DL1", name: "Default", visible: true, locked: false, opacity: 1 }],
    drawio_elements_v1: svgCache ? [{
      id: elementId,
      layer_id: activeLayerId,
      visible: true,
      locked: false,
      deleted: false,
      opacity: 1,
      offset_x: 0,
      offset_y: 0,
      z_index: 0,
    }] : [],
    active_layer_id: activeLayerId,
  });
}

function snapshotEqual(a, b) {
  return JSON.stringify(normalizeDrawioMeta(a || {})) === JSON.stringify(normalizeDrawioMeta(b || {}));
}

function uniqueSeries(items) {
  const out = [];
  items.forEach((item) => {
    if (!out.length || !snapshotEqual(out[out.length - 1], item)) out.push(item);
  });
  return out;
}

export async function runDrawioJazzProof({
  peer,
  scopeId = "drawio_proof_session_a",
  otherScopeId = "drawio_proof_session_b",
} = {}) {
  clearLifecycleStorage(scopeId);
  clearLifecycleStorage(otherScopeId);
  const adapterA = createDrawioJazzSpikeAdapter({ peer, scopeId });
  const adapterB = createDrawioJazzSpikeAdapter({ peer, scopeId });
  const adapterOther = createDrawioJazzSpikeAdapter({ peer, scopeId: otherScopeId });

  const first = makeSnapshot({
    docXml: "<mxfile host=\"ProcessMap\"><diagram id=\"p1\"><mxGraphModel><root><mxCell id=\"0\"/><mxCell id=\"1\" parent=\"0\"/><mxCell id=\"shape_1\" value=\"A\" parent=\"1\"/></root></mxGraphModel></diagram></mxfile>",
    svgCache: "<svg><rect id=\"shape_1\"/></svg>",
    lastSavedAt: "2026-03-15T10:00:00.000Z",
    elementId: "shape_1",
  });
  const second = makeSnapshot({
    docXml: "<mxfile host=\"ProcessMap\"><diagram id=\"p1\"><mxGraphModel><root><mxCell id=\"0\"/><mxCell id=\"1\" parent=\"0\"/><mxCell id=\"shape_2\" value=\"B\" parent=\"1\"/></root></mxGraphModel></diagram></mxfile>",
    svgCache: "<svg><rect id=\"shape_2\"/></svg>",
    lastSavedAt: "2026-03-15T10:05:00.000Z",
    elementId: "shape_2",
  });
  const other = makeSnapshot({
    docXml: "<mxfile host=\"ProcessMap\"><diagram id=\"p1\"><mxGraphModel><root><mxCell id=\"0\"/><mxCell id=\"1\" parent=\"0\"/><mxCell id=\"shape_9\" value=\"Other\" parent=\"1\"/></root></mxGraphModel></diagram></mxfile>",
    svgCache: "<svg><rect id=\"shape_9\"/></svg>",
    lastSavedAt: "2026-03-15T10:07:00.000Z",
    elementId: "shape_9",
  });

  const initialRead = adapterA.readSharedSnapshot();
  const firstApply = await adapterA.applySnapshot({ snapshot: first });
  if (!firstApply?.ok) return { ok: false, stage: "first_apply", detail: firstApply };

  const updatesA = [];
  const updatesB = [];
  const offA = adapterA.subscribe((next) => updatesA.push(next));
  const offB = adapterB.subscribe((next) => updatesB.push(next));

  await waitFor(() => snapshotEqual(updatesA[updatesA.length - 1], first) ? true : null);
  const duplicateApply = await adapterB.applySnapshot({ snapshot: first });
  const lateApply = await adapterB.applySnapshot({ snapshot: second });
  if (!lateApply?.ok) {
    offA();
    offB();
    return { ok: false, stage: "late_apply", detail: lateApply };
  }
  await waitFor(() => {
    const currentA = updatesA[updatesA.length - 1];
    const currentB = updatesB[updatesB.length - 1];
    return snapshotEqual(currentA, second) && snapshotEqual(currentB, second) ? true : null;
  });

  const otherApply = await adapterOther.applySnapshot({ snapshot: other });
  if (!otherApply?.ok) {
    offA();
    offB();
    return { ok: false, stage: "other_scope_apply", detail: otherApply };
  }

  offA();
  offB();

  return {
    ok: true,
    initialRead,
    firstApply: firstApply.snapshot,
    duplicateApply: duplicateApply.snapshot,
    lateApply: lateApply.snapshot,
    currentScopeDocId: readScopedDocId(scopeId),
    otherScopeDocId: readScopedDocId(otherScopeId),
    currentScopeSeries: uniqueSeries(updatesA),
    secondListenerSeries: uniqueSeries(updatesB),
    otherScopeSnapshot: adapterOther.readSharedSnapshot(),
  };
}

export async function runDrawioJazzLifecycleProof({
  peer,
  scopeId = "drawio_proof_lifecycle",
} = {}) {
  clearLifecycleStorage(scopeId);
  const seedAdapter = createDrawioJazzSpikeAdapter({ peer, scopeId });
  const seeded = makeSnapshot({
    docXml: "<mxfile host=\"ProcessMap\"><diagram id=\"p1\"><mxGraphModel><root><mxCell id=\"0\"/><mxCell id=\"1\" parent=\"0\"/><mxCell id=\"shape_life\" value=\"seed\" parent=\"1\"/></root></mxGraphModel></diagram></mxfile>",
    svgCache: "<svg><rect id=\"shape_life\"/></svg>",
    lastSavedAt: "2026-03-15T11:00:00.000Z",
    elementId: "shape_life",
  });
  const seedResult = await seedAdapter.applySnapshot({ snapshot: seeded });
  if (!seedResult?.ok) return { ok: false, stage: "seed", detail: seedResult };
  const seededDocId = readScopedDocId(scopeId);

  writeScopedDocId(scopeId, "co_missing_drawio_doc");
  const staleDocAdapter = createDrawioJazzSpikeAdapter({ peer, scopeId });
  const staleDocUpdates = [];
  const offStale = staleDocAdapter.subscribe((snapshot) => staleDocUpdates.push(snapshot));
  await waitFor(() => String(readScopedDocId(scopeId) || "") === "" ? true : null);
  const staleCleared = staleDocAdapter.readSharedSnapshot();
  const afterStaleRecover = await staleDocAdapter.applySnapshot({
    snapshot: makeSnapshot({
      docXml: "<mxfile host=\"ProcessMap\"><diagram id=\"p1\"><mxGraphModel><root><mxCell id=\"0\"/><mxCell id=\"1\" parent=\"0\"/><mxCell id=\"shape_after_stale\" value=\"recover\" parent=\"1\"/></root></mxGraphModel></diagram></mxfile>",
      svgCache: "<svg><rect id=\"shape_after_stale\"/></svg>",
      lastSavedAt: "2026-03-15T11:05:00.000Z",
      elementId: "shape_after_stale",
    }),
  });
  offStale();

  try {
    window.localStorage?.setItem(AUTH_SECRET_STORAGE_KEY, "bogus_secret_corrupted");
  } catch {
  }
  writeScopedDocId(scopeId, seededDocId);
  const authDriftAdapter = createDrawioJazzSpikeAdapter({ peer, scopeId });
  const authBlockedSnapshot = await new Promise((resolve) => {
    const off = authDriftAdapter.subscribe((next) => {
      if (String(next?._lifecycle_code || "").trim()) {
        off();
        resolve(next);
      }
    });
  });
  const authBlockedApply = await authDriftAdapter.applySnapshot({ snapshot: seeded });
  deleteScopedDocId(scopeId);
  const authRecoveryAdapter = createDrawioJazzSpikeAdapter({ peer, scopeId });
  const authRecovered = await authRecoveryAdapter.applySnapshot({
    snapshot: makeSnapshot({
      docXml: "<mxfile host=\"ProcessMap\"><diagram id=\"p1\"><mxGraphModel><root><mxCell id=\"0\"/><mxCell id=\"1\" parent=\"0\"/><mxCell id=\"shape_auth_ok\" value=\"auth\" parent=\"1\"/></root></mxGraphModel></diagram></mxfile>",
      svgCache: "<svg><rect id=\"shape_auth_ok\"/></svg>",
      lastSavedAt: "2026-03-15T11:08:00.000Z",
      elementId: "shape_auth_ok",
    }),
  });

  try {
    window.localStorage?.removeItem(AUTH_SECRET_STORAGE_KEY);
    window.localStorage?.setItem(JAZZ_TOOLS_URL_KEY, "data:text/javascript,throw new Error('DrawioJazzBoom')");
    window.localStorage?.setItem(JAZZ_TOOLS_BROWSER_URL_KEY, "data:text/javascript,throw new Error('DrawioJazzBoom')");
  } catch {
  }
  const runtimeDriftAdapter = createDrawioJazzSpikeAdapter({ peer, scopeId: `${scopeId}_runtime` });
  const runtimeBlocked = await runtimeDriftAdapter.applySnapshot({ snapshot: seeded });
  try {
    window.localStorage?.removeItem(JAZZ_TOOLS_URL_KEY);
    window.localStorage?.removeItem(JAZZ_TOOLS_BROWSER_URL_KEY);
  } catch {
  }
  const runtimeRecovered = await runtimeDriftAdapter.applySnapshot({
    snapshot: makeSnapshot({
      docXml: "<mxfile host=\"ProcessMap\"><diagram id=\"p1\"><mxGraphModel><root><mxCell id=\"0\"/><mxCell id=\"1\" parent=\"0\"/><mxCell id=\"shape_runtime_ok\" value=\"runtime\" parent=\"1\"/></root></mxGraphModel></diagram></mxfile>",
      svgCache: "<svg><rect id=\"shape_runtime_ok\"/></svg>",
      lastSavedAt: "2026-03-15T11:10:00.000Z",
      elementId: "shape_runtime_ok",
    }),
  });

  return {
    ok: true,
    staleDocLifecycle: {
      clearedSnapshot: staleCleared,
      clearedDocId: readScopedDocId(scopeId),
      updateSeries: uniqueSeries(staleDocUpdates),
      recoveredSnapshot: afterStaleRecover?.snapshot,
    },
    authDriftLifecycle: {
      blockedSnapshot: authBlockedSnapshot,
      blockedApply: authBlockedApply,
      recoveredSnapshot: authRecovered?.snapshot,
    },
    runtimeDriftLifecycle: {
      initialFailure: runtimeBlocked,
      recoveredSnapshot: runtimeRecovered?.snapshot,
    },
  };
}
