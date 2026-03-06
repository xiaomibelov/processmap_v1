import test from "node:test";
import assert from "node:assert/strict";

import buildSessionMetaReadModel from "./read/buildSessionMetaReadModel.js";
import applySessionMetaHydration from "./hydrate/applySessionMetaHydration.js";
import { createSessionMetaConflictGuard } from "./guards/sessionMetaConflictGuard.js";
import { buildSessionMetaWriteEnvelope } from "./write/sessionMetaMergePolicy.js";

function asObject(value) {
  return value && typeof value === "object" ? value : {};
}

function normalizeBpmnMeta(raw) {
  const value = asObject(raw);
  return {
    version: Number(value.version) > 0 ? Number(value.version) : 1,
    flow_meta: asObject(value.flow_meta),
    node_path_meta: asObject(value.node_path_meta),
    robot_meta_by_element_id: asObject(value.robot_meta_by_element_id),
    hybrid_layer_by_element_id: asObject(value.hybrid_layer_by_element_id),
    hybrid_v2: asObject(value.hybrid_v2),
    drawio: asObject(value.drawio),
    execution_plans: Array.isArray(value.execution_plans) ? value.execution_plans : [],
  };
}

function normalizeHybridLayerMap(raw) {
  return asObject(raw);
}

function mergeHybridV2Doc(primaryRaw, fallbackRaw = {}) {
  const primary = asObject(primaryRaw);
  const fallback = asObject(fallbackRaw);
  return Object.keys(primary).length ? primary : fallback;
}

function mergeDrawioMeta(primaryRaw, fallbackRaw = {}) {
  const primary = asObject(primaryRaw);
  const fallback = asObject(fallbackRaw);
  const primaryHasPayload = !!String(primary.svg_cache || primary.doc_xml || "").trim();
  if (primaryHasPayload) return primary;
  return Object.keys(primary).length ? primary : fallback;
}

test("session-meta read model prefers server overlay and keeps local fallback only when server is empty", () => {
  const sessionMeta = normalizeBpmnMeta({
    drawio: { enabled: true, svg_cache: "<svg>server</svg>" },
    hybrid_layer_by_element_id: { server_row: { label: "Server row" } },
    flow_meta: { flow_1: { tier: "P0" } },
  });
  const localMeta = normalizeBpmnMeta({
    drawio: { enabled: true, svg_cache: "<svg>local</svg>" },
    hybrid_layer_by_element_id: { local_row: { label: "Local row" } },
    flow_meta: { flow_1: { tier: "P2" } },
  });

  const model = buildSessionMetaReadModel({
    sessionMetaRaw: sessionMeta,
    localMetaRaw: localMeta,
    normalizeBpmnMeta,
    normalizeHybridLayerMap,
    mergeHybridV2Doc,
    mergeDrawioMeta,
    preferServerOverlay: true,
  });

  assert.equal(String(model.derivedReadMeta.drawio.svg_cache || ""), "<svg>server</svg>");
  assert.deepEqual(model.derivedReadMeta.hybrid_layer_by_element_id, {
    server_row: { label: "Server row" },
  });
  assert.deepEqual(model.derivedReadMeta.flow_meta, { flow_1: { tier: "P0" } });

  const fallbackModel = buildSessionMetaReadModel({
    sessionMetaRaw: normalizeBpmnMeta({
      drawio: {},
      hybrid_layer_by_element_id: {},
    }),
    localMetaRaw: localMeta,
    normalizeBpmnMeta,
    normalizeHybridLayerMap,
    mergeHybridV2Doc,
    mergeDrawioMeta,
    preferServerOverlay: true,
  });

  assert.equal(String(fallbackModel.derivedReadMeta.drawio.svg_cache || ""), "<svg>local</svg>");
  assert.deepEqual(fallbackModel.derivedReadMeta.hybrid_layer_by_element_id, {
    local_row: { label: "Local row" },
  });
});

test("conflict guard blocks stale write sequences", () => {
  const guard = createSessionMetaConflictGuard();

  const first = guard.shouldApplyHydration({ _meta_write_seq: 3 });
  assert.equal(first.apply, true);
  assert.equal(first.reason, "ok");

  const stale = guard.shouldApplyHydration({ _meta_write_seq: 2 });
  assert.equal(stale.apply, false);
  assert.equal(stale.reason, "stale_write_seq");

  const next = guard.shouldApplyHydration({ _meta_write_seq: 4 });
  assert.equal(next.apply, true);
  assert.equal(next.reason, "ok");
});

test("hydrate boundary does not apply stale payload and keeps previous draft", () => {
  const guard = createSessionMetaConflictGuard();
  guard.markAppliedWriteSeq(5);
  const prevDraft = { session_id: "s1", marker: "fresh" };
  const payload = buildSessionMetaWriteEnvelope({
    sessionId: "s1",
    bpmnMeta: { drawio: { enabled: true } },
    source: "test",
    writeSeq: 4,
  });

  const result = applySessionMetaHydration({
    sid: "s1",
    activeSessionId: "s1",
    source: "test_hydrate",
    payloadRaw: payload,
    conflictGuard: guard,
    mergeDraft: (prev) => ({ ...prev, marker: "stale_applied" }),
    prevDraft,
  });

  assert.equal(result.applied, false);
  assert.equal(result.reason, "stale_write_seq");
  assert.deepEqual(result.nextDraft, prevDraft);
});

test("reopen conflict probe: server draw.io truth wins over stale local snapshot", () => {
  const serverMeta = normalizeBpmnMeta({
    drawio: {
      enabled: true,
      opacity: 0.6,
      svg_cache: "<svg>shape_server</svg>",
      drawio_elements_v1: [{ id: "shape_server", deleted: false }],
    },
  });
  const staleLocalMeta = normalizeBpmnMeta({
    drawio: {
      enabled: true,
      opacity: 1,
      svg_cache: "<svg>shape_local_old</svg>",
      drawio_elements_v1: [{ id: "shape_local_old", deleted: false }],
    },
  });

  const model = buildSessionMetaReadModel({
    sessionMetaRaw: serverMeta,
    localMetaRaw: staleLocalMeta,
    normalizeBpmnMeta,
    normalizeHybridLayerMap,
    mergeHybridV2Doc,
    mergeDrawioMeta,
    preferServerOverlay: true,
  });

  assert.equal(String(model.derivedReadMeta.drawio.svg_cache || ""), "<svg>shape_server</svg>");
  assert.equal(Number(model.derivedReadMeta.drawio.opacity || 0), 0.6);
  assert.deepEqual(model.derivedReadMeta.drawio.drawio_elements_v1, [{ id: "shape_server", deleted: false }]);
});
