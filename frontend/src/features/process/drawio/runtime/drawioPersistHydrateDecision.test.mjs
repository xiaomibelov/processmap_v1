import test from "node:test";
import assert from "node:assert/strict";

import decideDrawioPersistHydrateAction from "./drawioPersistHydrateDecision.js";

function asObject(value) {
  return value && typeof value === "object" ? value : {};
}

function serializeDrawioMeta(metaRaw) {
  const meta = asObject(metaRaw);
  return JSON.stringify({
    enabled: !!meta.enabled,
    doc_xml: String(meta.doc_xml || ""),
    svg_cache: String(meta.svg_cache || ""),
    drawio_elements_v1: Array.isArray(meta.drawio_elements_v1)
      ? meta.drawio_elements_v1.map((rowRaw) => {
        const row = asObject(rowRaw);
        return {
          id: String(row.id || ""),
          deleted: row.deleted === true,
        };
      })
      : [],
  });
}

function decide({ incoming, current, persisted }) {
  return decideDrawioPersistHydrateAction({
    incoming,
    current,
    persisted,
    serializeDrawioMeta,
  });
}

test("resurrection guard: blocks apply when incoming contains deleted ID as non-deleted", () => {
  const decision = decide({
    incoming: {
      doc_xml: "<xml incoming/>",
      svg_cache: "<svg incoming/>",
      drawio_elements_v1: [{ id: "shapeA", deleted: false }],
    },
    current: {
      doc_xml: "<xml current/>",
      svg_cache: "<svg current/>",
      drawio_elements_v1: [{ id: "shapeA", deleted: true }],
    },
    persisted: { doc_xml: "<xml persisted/>", svg_cache: "<svg persisted/>" },
  });
  assert.equal(decision.action, "skip");
  assert.equal(decision.reason, "incoming_missing_local_deletions");
});

test("resurrection guard: allows apply when local deleted ID is absent from incoming snapshot", () => {
  const decision = decide({
    incoming: {
      doc_xml: "<xml incoming/>",
      svg_cache: "<svg incoming/>",
      drawio_elements_v1: [{ id: "shapeB", deleted: false }],
    },
    current: {
      doc_xml: "<xml current/>",
      svg_cache: "<svg current/>",
      drawio_elements_v1: [{ id: "shapeA", deleted: true }],
    },
    persisted: { doc_xml: "<xml persisted/>", svg_cache: "<svg persisted/>", drawio_elements_v1: [] },
  });
  assert.equal(decision.action, "apply");
  assert.equal(decision.reason, "apply_incoming_snapshot");
});

test("resurrection guard: independent from svg_cache byte equality", () => {
  const decision = decide({
    incoming: {
      doc_xml: "<xml incoming/>",
      svg_cache: "<svg changed bytes/>",
      drawio_elements_v1: [{ id: "shapeA", deleted: false }],
    },
    current: {
      doc_xml: "<xml current/>",
      svg_cache: "<svg completely different bytes/>",
      drawio_elements_v1: [{ id: "shapeA", deleted: true }],
    },
    persisted: { doc_xml: "<xml persisted/>", svg_cache: "<svg persisted/>" },
  });
  assert.equal(decision.action, "skip");
  assert.equal(decision.reason, "incoming_missing_local_deletions");
});

test("guard #1 unchanged: incoming equals persisted while current differs", () => {
  const snapshot = { doc_xml: "<xml A/>", svg_cache: "<svg A/>", drawio_elements_v1: [] };
  const decision = decide({
    incoming: snapshot,
    current: { doc_xml: "<xml B/>", svg_cache: "<svg B/>", drawio_elements_v1: [] },
    persisted: snapshot,
  });
  assert.equal(decision.action, "skip");
  assert.equal(decision.reason, "incoming_equals_persisted_current_differs");
});

test("guard #2 unchanged: incoming equals current", () => {
  const snapshot = { doc_xml: "<xml A/>", svg_cache: "<svg A/>", drawio_elements_v1: [] };
  const decision = decide({
    incoming: snapshot,
    current: snapshot,
    persisted: { doc_xml: "<xml old/>", svg_cache: "<svg old/>", drawio_elements_v1: [] },
  });
  assert.equal(decision.action, "skip_and_sync_persisted_ref");
  assert.equal(decision.reason, "incoming_equals_current");
});

test("guard #3 unchanged: incoming empty while current has payload", () => {
  const decision = decide({
    incoming: { doc_xml: "", svg_cache: "", drawio_elements_v1: [] },
    current: { doc_xml: "<xml current/>", svg_cache: "<svg current/>", drawio_elements_v1: [] },
    persisted: { doc_xml: "<xml persisted/>", svg_cache: "<svg persisted/>", drawio_elements_v1: [] },
  });
  assert.equal(decision.action, "skip");
  assert.equal(decision.reason, "incoming_empty_while_current_has_payload");
});

test("guard #5 unchanged: stale incoming behind optimistic persist", () => {
  const persistedAndCurrent = {
    enabled: true,
    doc_xml: "<xml current/>",
    svg_cache: "<svg current/>",
    drawio_elements_v1: [],
  };
  const decision = decide({
    incoming: { doc_xml: "<xml stale/>", svg_cache: "<svg stale/>", drawio_elements_v1: [] },
    current: persistedAndCurrent,
    persisted: persistedAndCurrent,
  });
  assert.equal(decision.action, "skip");
  assert.equal(decision.reason, "incoming_stale_behind_optimistic_persist");
});

test("no local deletions: normal apply behavior preserved", () => {
  const decision = decide({
    incoming: { doc_xml: "<xml incoming/>", svg_cache: "<svg incoming/>", drawio_elements_v1: [{ id: "shapeA", deleted: false }] },
    current: { doc_xml: "<xml current/>", svg_cache: "<svg current/>", drawio_elements_v1: [{ id: "shapeA", deleted: false }] },
    persisted: { doc_xml: "<xml persisted/>", svg_cache: "<svg persisted/>", drawio_elements_v1: [] },
  });
  assert.equal(decision.action, "apply");
  assert.equal(decision.reason, "apply_incoming_snapshot");
});

test("incoming keeps deleted IDs: resurrection guard does not block", () => {
  const decision = decide({
    incoming: {
      doc_xml: "<xml incoming/>",
      svg_cache: "<svg incoming/>",
      drawio_elements_v1: [{ id: "shapeA", deleted: true }],
    },
    current: {
      doc_xml: "<xml current/>",
      svg_cache: "<svg current/>",
      drawio_elements_v1: [{ id: "shapeA", deleted: true }],
    },
    persisted: { doc_xml: "<xml persisted/>", svg_cache: "<svg persisted/>", drawio_elements_v1: [] },
  });
  assert.equal(decision.action, "apply");
  assert.equal(decision.reason, "apply_incoming_snapshot");
});
