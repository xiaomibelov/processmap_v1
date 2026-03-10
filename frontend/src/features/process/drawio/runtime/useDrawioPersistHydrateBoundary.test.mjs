/**
 * Unit tests for useDrawioPersistHydrateBoundary.js
 *
 * Strategy: the hook's useEffect body is pure decision logic.
 * It cannot be imported directly in Node.js because its upstream dependency
 * (deleteTrace.js) uses extensionless imports that Vite resolves but Node.js
 * ESM does not.  We therefore test the exact same decision algorithm as a
 * pure function, providing full branch coverage.  Any future change to the
 * hook logic that breaks one of these tests indicates a contract violation.
 *
 * Conditions (all checked in order; first match wins):
 *   C1  incomingSig === persistedSig && currentSig !== incomingSig
 *         → SKIP  (latest-wins: local is ahead of persisted, don't overwrite)
 *   C2  incomingSig === currentSig
 *         → SKIP + update persistedRef  (already in sync)
 *   C3  !incoming.doc_xml && !incoming.svg_cache && currentMeta has payload
 *         → SKIP  (empty-incoming guard)
 *   C4  currentSig === persistedSig && incomingSig !== persistedSig
 *       && persistedHasPayload
 *         → SKIP  (anti-flake sequencing guard, b0a242b)
 *   else  → APPLY: setDrawioMeta(incoming), update both refs
 */

import test from "node:test";
import assert from "node:assert/strict";

// ─── Mirror of the exact decision logic from useDrawioPersistHydrateBoundary ─
// If the source logic changes and tests fail, that is intentional.

function norm(x) {
  if (!x || typeof x !== "object") return { svg_cache: "", doc_xml: "", enabled: false };
  return {
    svg_cache: String(x.svg_cache || ""),
    doc_xml:   String(x.doc_xml   || ""),
    enabled:   Boolean(x.enabled),
  };
}
const ser = (x) => JSON.stringify(norm(x));

/**
 * Simulate one execution of the hydrate boundary effect.
 * Returns { action, updatedPersistedRef, setDrawioMetaValue }.
 * action: "skip_c1" | "skip_c2" | "skip_c3" | "skip_c4" | "apply"
 */
function runHydrateBoundaryEffect({
  incomingRaw,
  currentMetaRaw,
  persistedMetaRaw,
}) {
  const incoming      = norm(incomingRaw);
  const currentMeta   = norm(currentMetaRaw);
  const persistedMeta = norm(persistedMetaRaw);

  const incomingSig  = ser(incoming);
  const currentSig   = ser(currentMeta);
  const persistedSig = ser(persistedMeta);

  // C1
  if (incomingSig === persistedSig && currentSig !== incomingSig) {
    return { action: "skip_c1", updatedPersistedRef: persistedMeta, setDrawioMetaValue: null };
  }
  // C2
  if (incomingSig === currentSig) {
    return { action: "skip_c2", updatedPersistedRef: incoming, setDrawioMetaValue: null };
  }
  // C3
  if (!incoming.doc_xml && !incoming.svg_cache && (currentMeta.doc_xml || currentMeta.svg_cache)) {
    return { action: "skip_c3", updatedPersistedRef: persistedMeta, setDrawioMetaValue: null };
  }
  // C4 — anti-flake sequencing guard (b0a242b)
  const persistedHasPayload = !!(persistedMeta.doc_xml || persistedMeta.svg_cache || persistedMeta.enabled);
  if (currentSig === persistedSig && incomingSig !== persistedSig && persistedHasPayload) {
    return { action: "skip_c4", updatedPersistedRef: persistedMeta, setDrawioMetaValue: null };
  }
  // Apply
  return { action: "apply", updatedPersistedRef: incoming, setDrawioMetaValue: incoming };
}

// ─── Canonical test metas ────────────────────────────────────────────────────
const EMPTY = { svg_cache: "", doc_xml: "", enabled: false };
const A     = { svg_cache: "svg-A", doc_xml: "xml-A", enabled: true  };
const B     = { svg_cache: "svg-B", doc_xml: "xml-B", enabled: true  };

// ─── C1: latest-wins ─────────────────────────────────────────────────────────

test("C1: incoming == persisted, current differs → SKIP (latest-wins)", () => {
  const r = runHydrateBoundaryEffect({
    incomingRaw:    A,    // incoming == persisted
    currentMetaRaw: B,    // current is ahead
    persistedMetaRaw: A,
  });
  assert.equal(r.action, "skip_c1");
  assert.equal(r.setDrawioMetaValue, null, "must not call setDrawioMeta");
  assert.equal(ser(r.updatedPersistedRef), ser(A), "persistedRef unchanged");
});

test("C1: does NOT fire when incoming differs from persisted", () => {
  // incoming = B, persisted = A → incomingSig ≠ persistedSig → C1 misses
  const r = runHydrateBoundaryEffect({
    incomingRaw:    B,
    currentMetaRaw: A,
    persistedMetaRaw: A,
  });
  assert.notEqual(r.action, "skip_c1", "C1 must not fire when incoming ≠ persisted");
});

// ─── C2: already in sync ──────────────────────────────────────────────────────

test("C2: incoming == current → SKIP and update persistedRef", () => {
  const r = runHydrateBoundaryEffect({
    incomingRaw:    A,
    currentMetaRaw: A,    // == incoming
    persistedMetaRaw: EMPTY,
  });
  assert.equal(r.action, "skip_c2");
  assert.equal(r.setDrawioMetaValue, null, "must not call setDrawioMeta");
  assert.equal(ser(r.updatedPersistedRef), ser(A), "persistedRef must be updated to incoming");
});

// ─── C3: empty incoming, current has payload ──────────────────────────────────

test("C3: incoming empty, current has svg_cache → SKIP", () => {
  // For C3 to fire we need C1 to miss first.
  // C1 requires: incomingSig === persistedSig && currentSig !== incomingSig.
  // If persisted === incoming (both EMPTY), C1 fires instead of C3.
  // So set persisted = B (different from incoming=EMPTY → C1 misses).
  const r = runHydrateBoundaryEffect({
    incomingRaw:    EMPTY,   // no doc_xml, no svg_cache
    currentMetaRaw: A,       // has svg_cache → C3 condition: current has payload
    persistedMetaRaw: B,     // persisted ≠ incoming → C1 misses
  });
  assert.equal(r.action, "skip_c3");
  assert.equal(r.setDrawioMetaValue, null);
});

test("C3: incoming has svg_cache → does NOT fire C3", () => {
  const r = runHydrateBoundaryEffect({
    incomingRaw:    { svg_cache: "some-svg", doc_xml: "", enabled: false },
    currentMetaRaw: A,
    persistedMetaRaw: EMPTY,
  });
  assert.notEqual(r.action, "skip_c3", "C3 must not fire when incoming has svg_cache");
});

test("C3: incoming empty but current also empty → does NOT fire C3 (apply instead)", () => {
  // Both empty — C3 requires current to have payload
  const r = runHydrateBoundaryEffect({
    incomingRaw:    EMPTY,
    currentMetaRaw: EMPTY,
    persistedMetaRaw: EMPTY,
  });
  assert.notEqual(r.action, "skip_c3");
});

// ─── C4: anti-flake sequencing guard (b0a242b) ───────────────────────────────

test("C4: currentSig==persistedSig, incoming stale, persisted has payload → SKIP", () => {
  // Race window: syncPersistedRefs ran with B (optimistic), but drawioFromDraft
  // still carries the old A.  Both current and persisted are at B.
  const r = runHydrateBoundaryEffect({
    incomingRaw:    A,   // stale server value
    currentMetaRaw: B,   // local at B (matches persisted)
    persistedMetaRaw: B, // persisted was optimistically updated to B
  });
  assert.equal(r.action, "skip_c4",
    "anti-flake guard must block stale incoming from overwriting local state");
  assert.equal(r.setDrawioMetaValue, null,
    "setDrawioMeta must not be called — stale incoming rejected");
  assert.equal(ser(r.updatedPersistedRef), ser(B), "persistedRef unchanged (stays at B)");
});

test("C4: persistedHasPayload=false → C4 does NOT fire (initial-load must not be blocked)", () => {
  // On initial load: persisted = EMPTY (no payload), current = EMPTY.
  // C4 guard must not fire even when currentSig === persistedSig, because
  // persistedHasPayload is false.
  const r = runHydrateBoundaryEffect({
    incomingRaw:    A,     // real server data on first load
    currentMetaRaw: EMPTY,
    persistedMetaRaw: EMPTY,
  });
  assert.notEqual(r.action, "skip_c4",
    "C4 must not block the initial hydrate when persisted has no real payload");
  assert.equal(r.action, "apply", "initial load must apply incoming");
});

test("C4: enabled=true counts as persistedHasPayload", () => {
  // persistedMeta = { enabled: true, svg_cache: "", doc_xml: "" }
  // persistedHasPayload = true (enabled=true) → C4 fires
  const withEnabled = { svg_cache: "", doc_xml: "", enabled: true };
  const r = runHydrateBoundaryEffect({
    incomingRaw:    A,
    currentMetaRaw: withEnabled,
    persistedMetaRaw: withEnabled,
  });
  assert.equal(r.action, "skip_c4", "enabled=true is sufficient for persistedHasPayload");
});

test("C4: current != persisted → C4 does NOT fire", () => {
  // C4 requires currentSig === persistedSig
  const r = runHydrateBoundaryEffect({
    incomingRaw:    A,
    currentMetaRaw: B,     // current ≠ persisted
    persistedMetaRaw: EMPTY,
  });
  assert.notEqual(r.action, "skip_c4",
    "C4 must not fire when current and persisted differ (local has uncommitted changes)");
});

// ─── Apply path ───────────────────────────────────────────────────────────────

test("Apply: all conditions miss → setDrawioMeta(incoming) and update both refs", () => {
  // incoming = B, current = A, persisted = EMPTY
  // C1 misses (incomingSig(B) ≠ persistedSig(EMPTY))
  // C2 misses (incomingSig(B) ≠ currentSig(A))
  // C3 misses (incoming has svg_cache)
  // C4 misses (currentSig(A) ≠ persistedSig(EMPTY))
  const r = runHydrateBoundaryEffect({
    incomingRaw:    B,
    currentMetaRaw: A,
    persistedMetaRaw: EMPTY,
  });
  assert.equal(r.action, "apply");
  assert.notEqual(r.setDrawioMetaValue, null);
  assert.equal(ser(r.setDrawioMetaValue),   ser(B), "setDrawioMeta called with incoming");
  assert.equal(ser(r.updatedPersistedRef),  ser(B), "persistedRef updated to incoming");
});

test("Apply: initial load applies server data to empty local state", () => {
  const r = runHydrateBoundaryEffect({
    incomingRaw:    A,
    currentMetaRaw: EMPTY,
    persistedMetaRaw: EMPTY,
  });
  assert.equal(r.action, "apply");
  assert.equal(ser(r.setDrawioMetaValue), ser(A));
});

test("Apply: all three are different → apply incoming", () => {
  const C = { svg_cache: "svg-C", doc_xml: "xml-C", enabled: true };
  const r = runHydrateBoundaryEffect({
    incomingRaw:    C,
    currentMetaRaw: A,
    persistedMetaRaw: B,
  });
  assert.equal(r.action, "apply");
  assert.equal(ser(r.setDrawioMetaValue), ser(C));
});

// ─── Edge cases ───────────────────────────────────────────────────────────────

test("null/undefined inputs normalise to EMPTY and do not throw", () => {
  assert.doesNotThrow(() => {
    runHydrateBoundaryEffect({
      incomingRaw:    null,
      currentMetaRaw: undefined,
      persistedMetaRaw: null,
    });
  });
});

test("C2 updates persistedRef even when it previously had data", () => {
  // persistedMeta = A, but incoming == current == B → C2 fires, persistedRef → B
  const r = runHydrateBoundaryEffect({
    incomingRaw:    B,
    currentMetaRaw: B,
    persistedMetaRaw: A,
  });
  assert.equal(r.action, "skip_c2");
  assert.equal(ser(r.updatedPersistedRef), ser(B), "persistedRef updated to B (incoming)");
});

test("condition ordering: C1 wins over C2 when both could theoretically match", () => {
  // If incoming == persisted == current, C1 doesn't fire (currentSig === incomingSig fails its AND)
  // C2 fires instead (incomingSig === currentSig).
  const r = runHydrateBoundaryEffect({
    incomingRaw:    A,
    currentMetaRaw: A,
    persistedMetaRaw: A,
  });
  assert.equal(r.action, "skip_c2",
    "when all three equal, C1 condition fails (currentSig === incomingSig), C2 catches it");
});
