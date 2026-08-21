import test from "node:test";
import assert from "node:assert/strict";

import {
  applyDrawioAnchorValidation,
  buildBpmnNodeOverlayCompanionSummary,
  buildDrawioAnchorImportDiagnostics,
  collectBpmnNodeIdsFromDraft,
  describeDrawioAnchor,
  getDrawioAnchorableKind,
  summarizeDrawioAnchorStatuses,
  validateDrawioAnchor,
} from "./drawioAnchors.js";

test("drawio anchors: only text and rect/container runtime rows are anchorable in first pilot", () => {
  assert.equal(getDrawioAnchorableKind({ id: "text_1", text: "Hello" }), "text");
  assert.equal(getDrawioAnchorableKind({ id: "rect_1" }), "highlight");
  assert.equal(getDrawioAnchorableKind({ id: "container_1" }), "highlight");
  assert.equal(getDrawioAnchorableKind({ id: "ellipse_1" }), "");
});

test("drawio anchors: missing BPMN target becomes orphaned without dropping object metadata", () => {
  const validation = validateDrawioAnchor({
    target_kind: "bpmn_node",
    target_id: "Task_9",
    relation: "explains",
    status: "anchored",
  }, {
    rowRaw: { id: "text_1", text: "Hello" },
    bpmnNodeIds: ["Task_1", "Task_2"],
  });
  assert.equal(validation.status, "orphaned");
  assert.equal(validation.anchor.status, "orphaned");
  assert.equal(validation.anchor.target_id, "Task_9");
});

test("drawio anchors: malformed payload becomes invalid", () => {
  const validation = validateDrawioAnchor({
    target_kind: "bpmn_edge",
    target_id: "Flow_1",
    relation: "highlights",
  }, {
    rowRaw: { id: "text_1", text: "Hello" },
    bpmnNodeIds: ["Task_1"],
  });
  assert.equal(validation.status, "invalid");
  assert.equal(validation.anchor.status, "invalid");
});

test("drawio anchors: apply validation updates row statuses against current BPMN ids", () => {
  const next = applyDrawioAnchorValidation({
    drawio_elements_v1: [
      {
        id: "text_1",
        text: "Hello",
        anchor_v1: {
          target_kind: "bpmn_node",
          target_id: "Task_1",
          relation: "explains",
          status: "orphaned",
        },
      },
      {
        id: "rect_1",
        anchor_v1: {
          target_kind: "bpmn_node",
          target_id: "Task_missing",
          relation: "highlights",
          status: "anchored",
        },
      },
    ],
  }, ["Task_1"]);
  assert.equal(next.drawio_elements_v1[0].anchor_v1.status, "anchored");
  assert.equal(next.drawio_elements_v1[1].anchor_v1.status, "orphaned");
});

test("drawio anchors: BPMN ids are collected from current draft nodes only", () => {
  assert.deepEqual(
    collectBpmnNodeIdsFromDraft({
      nodes: [{ id: "Task_1" }, { id: "Task_1" }, { id: "Gateway_1" }],
    }),
    ["Task_1", "Gateway_1"],
  );
});

test("drawio anchors: same-session anchored text reopen stays anchored when BPMN id is stable", () => {
  const reopened = applyDrawioAnchorValidation({
    drawio_elements_v1: [
      {
        id: "text_1",
        text: "Note",
        anchor_v1: {
          target_kind: "bpmn_node",
          target_id: "Task_1",
          relation: "explains",
          status: "anchored",
        },
      },
    ],
  }, collectBpmnNodeIdsFromDraft({ nodes: [{ id: "Task_1", name: "Renamed task" }] }));
  assert.equal(reopened.drawio_elements_v1[0].anchor_v1.status, "anchored");
  assert.equal(reopened.drawio_elements_v1[0].anchor_v1.target_id, "Task_1");
});

test("drawio anchors: anchored highlight stays anchored on BPMN rename because id is unchanged", () => {
  const reopened = applyDrawioAnchorValidation({
    drawio_elements_v1: [
      {
        id: "rect_1",
        anchor_v1: {
          target_kind: "bpmn_node",
          target_id: "Gateway_7",
          relation: "highlights",
          status: "anchored",
        },
      },
    ],
  }, collectBpmnNodeIdsFromDraft({ nodes: [{ id: "Gateway_7", name: "Renamed gateway" }] }));
  assert.equal(reopened.drawio_elements_v1[0].anchor_v1.status, "anchored");
  assert.equal(reopened.drawio_elements_v1[0].anchor_v1.relation, "highlights");
});

test("drawio anchors: mixed freeform and anchored rows remain truthfully distinct", () => {
  const reopened = applyDrawioAnchorValidation({
    drawio_elements_v1: [
      { id: "text_1", text: "Anchored", anchor_v1: { target_kind: "bpmn_node", target_id: "Task_1", relation: "explains", status: "anchored" } },
      { id: "rect_2" },
    ],
  }, ["Task_1"]);
  assert.equal(reopened.drawio_elements_v1[0].anchor_v1.status, "anchored");
  assert.equal(reopened.drawio_elements_v1[1].anchor_v1, undefined);
});

test("drawio anchors: deferred BPMN validation does not falsely orphan a previously anchored row", () => {
  const reopened = applyDrawioAnchorValidation({
    drawio_elements_v1: [
      {
        id: "text_1",
        text: "Note",
        anchor_v1: {
          target_kind: "bpmn_node",
          target_id: "Task_1",
          relation: "explains",
          status: "anchored",
        },
      },
    ],
  }, [], false);
  assert.equal(reopened.drawio_elements_v1[0].anchor_v1.status, "anchored");
});

test("drawio anchors: recovery flows allow orphaned/invalid rows to become freeform or re-anchored", () => {
  const orphaned = {
    id: "text_1",
    text: "Note",
    anchor_v1: {
      target_kind: "bpmn_node",
      target_id: "Task_missing",
      relation: "explains",
      status: "orphaned",
    },
  };
  const repaired = validateDrawioAnchor({
    target_kind: "bpmn_node",
    target_id: "Task_2",
    relation: "explains",
    status: "anchored",
  }, {
    rowRaw: orphaned,
    bpmnNodeIds: ["Task_2"],
  });
  assert.equal(repaired.status, "anchored");

  const invalid = validateDrawioAnchor({
    target_kind: "bpmn_edge",
    target_id: "Flow_1",
    relation: "highlights",
  }, {
    rowRaw: orphaned,
    bpmnNodeIds: ["Task_2"],
  });
  assert.equal(invalid.status, "invalid");

  const freeform = applyDrawioAnchorValidation({
    drawio_elements_v1: [{ id: "text_1", text: "Note" }],
  }, ["Task_2"]);
  assert.equal(freeform.drawio_elements_v1[0].anchor_v1, undefined);
});

test("drawio anchors: described anchored state exposes jump and recovery text", () => {
  const described = describeDrawioAnchor({
    id: "text_1",
    text: "Note",
    anchor_v1: {
      target_kind: "bpmn_node",
      target_id: "Task_1",
      relation: "explains",
      status: "anchored",
    },
  });
  assert.equal(described.canJump, true);
  assert.match(described.issueText, /Task_1/);
  assert.match(described.recoveryText, /freeform/i);
});

test("drawio anchors: summary counts stay coherent for mixed overlay states", () => {
  const counts = summarizeDrawioAnchorStatuses([
    { id: "text_1", text: "A", anchor_v1: { status: "anchored" } },
    { id: "text_2", text: "B", anchor_v1: { status: "orphaned" } },
    { id: "rect_1", anchor_v1: { status: "invalid" } },
    { id: "rect_2" },
  ]);
  assert.equal(counts.anchored, 1);
  assert.equal(counts.orphaned, 1);
  assert.equal(counts.invalid, 1);
  assert.equal(counts.unanchored, 1);
});

test("drawio anchors: import diagnostics stay quiet when anchored ids remain stable", () => {
  const diagnostics = buildDrawioAnchorImportDiagnostics({
    beforeMeta: {
      drawio_elements_v1: [
        {
          id: "text_1",
          text: "A",
          anchor_v1: { target_kind: "bpmn_node", target_id: "Task_1", relation: "explains", status: "anchored" },
        },
      ],
    },
    beforeBpmnNodeIds: ["Task_1"],
    afterBpmnNodeIds: ["Task_1"],
  });
  assert.equal(diagnostics.importHasAnchorImpact, false);
  assert.equal(diagnostics.preservedAnchoredCount, 1);
  assert.equal(diagnostics.orphanedCountAfterImport, 0);
});

test("drawio anchors: import diagnostics report affected anchors when targets disappear", () => {
  const diagnostics = buildDrawioAnchorImportDiagnostics({
    beforeMeta: {
      drawio_elements_v1: [
        {
          id: "text_1",
          text: "A",
          anchor_v1: { target_kind: "bpmn_node", target_id: "Task_1", relation: "explains", status: "anchored" },
        },
        {
          id: "rect_1",
          anchor_v1: { target_kind: "bpmn_node", target_id: "Task_2", relation: "highlights", status: "anchored" },
        },
        { id: "rect_2" },
      ],
    },
    beforeBpmnNodeIds: ["Task_1", "Task_2"],
    afterBpmnNodeIds: ["Task_2_new"],
  });
  assert.equal(diagnostics.importHasAnchorImpact, true);
  assert.equal(diagnostics.totalAnchoredBefore, 2);
  assert.equal(diagnostics.totalAnchoredAfter, 0);
  assert.equal(diagnostics.orphanedCountAfterImport, 2);
  assert.deepEqual(diagnostics.affectedObjectIds.sort(), ["rect_1", "text_1"]);
});

test("drawio anchors: BPMN-side companion summary includes only current-node anchored and invalid companions", () => {
  const summary = buildBpmnNodeOverlayCompanionSummary({
    selectedBpmnNodeId: "Task_1",
    drawioMeta: {
      drawio_elements_v1: [
        {
          id: "text_1",
          text: "Explain task",
          anchor_v1: { target_kind: "bpmn_node", target_id: "Task_1", relation: "explains", status: "anchored" },
        },
        {
          id: "rect_1",
          anchor_v1: { target_kind: "bpmn_node", target_id: "Task_1", relation: "highlights", status: "anchored" },
        },
        {
          id: "ellipse_1",
          anchor_v1: { target_kind: "bpmn_node", target_id: "Task_1", relation: "highlights", status: "invalid" },
        },
        {
          id: "text_2",
          text: "Other node",
          anchor_v1: { target_kind: "bpmn_node", target_id: "Task_2", relation: "explains", status: "anchored" },
        },
        {
          id: "text_3",
          text: "Missing",
          anchor_v1: { target_kind: "bpmn_node", target_id: "Task_missing", relation: "explains", status: "orphaned" },
        },
        { id: "rect_2" },
      ],
    },
    bpmnNodeIds: ["Task_1", "Task_2"],
  });

  assert.equal(summary.hasOverlayCompanions, true);
  assert.equal(summary.companionCount, 3);
  assert.equal(summary.companionKindsSummary.text, 1);
  assert.equal(summary.companionKindsSummary.highlight, 1);
  assert.equal(summary.companionStatusSummary.anchored, 2);
  assert.equal(summary.companionStatusSummary.invalid, 1);
  assert.equal(summary.issueCounts.invalid, 1);
  assert.equal(summary.invalidCount, 1);
  assert.equal(summary.healthyCount, 2);
  assert.equal(summary.summaryTone, "warning");
  assert.deepEqual(summary.companionObjectIds.sort(), ["ellipse_1", "rect_1", "text_1"]);
  assert.equal(summary.previewCompanions.length, 3);
  assert.equal(summary.previewCompanions[0].objectId, "ellipse_1");
});

test("drawio anchors: BPMN-side companion summary stays quiet for nodes without exact current companions", () => {
  const summary = buildBpmnNodeOverlayCompanionSummary({
    selectedBpmnNodeId: "Task_3",
    drawioMeta: {
      drawio_elements_v1: [
        {
          id: "text_1",
          text: "Missing",
          anchor_v1: { target_kind: "bpmn_node", target_id: "Task_missing", relation: "explains", status: "orphaned" },
        },
        { id: "rect_2" },
      ],
    },
    bpmnNodeIds: ["Task_3"],
  });

  assert.equal(summary.hasOverlayCompanions, false);
  assert.equal(summary.companionCount, 0);
  assert.deepEqual(summary.companionObjectIds, []);
});

test("drawio anchors: BPMN-side companion summary stays deferred and quiet while BPMN hydrate is not ready", () => {
  const summary = buildBpmnNodeOverlayCompanionSummary({
    selectedBpmnNodeId: "Task_1",
    drawioMeta: {
      drawio_elements_v1: [
        {
          id: "text_1",
          text: "Explain task",
          anchor_v1: { target_kind: "bpmn_node", target_id: "Task_1", relation: "explains", status: "anchored" },
        },
      ],
    },
    bpmnNodeIds: [],
    validationReady: false,
  });

  assert.equal(summary.validationDeferred, true);
  assert.equal(summary.hasOverlayCompanions, false);
  assert.equal(summary.companionCount, 0);
  assert.equal(summary.summaryTone, "pending");
});

test("drawio anchors: BPMN-side companion summary keeps compact preview and remaining count for many healthy companions", () => {
  const summary = buildBpmnNodeOverlayCompanionSummary({
    selectedBpmnNodeId: "Task_1",
    drawioMeta: {
      drawio_elements_v1: [
        { id: "text_3", text: "Gamma", anchor_v1: { target_kind: "bpmn_node", target_id: "Task_1", relation: "explains", status: "anchored" } },
        { id: "rect_1", anchor_v1: { target_kind: "bpmn_node", target_id: "Task_1", relation: "highlights", status: "anchored" } },
        { id: "text_1", text: "Alpha", anchor_v1: { target_kind: "bpmn_node", target_id: "Task_1", relation: "explains", status: "anchored" } },
        { id: "text_2", text: "Beta", anchor_v1: { target_kind: "bpmn_node", target_id: "Task_1", relation: "explains", status: "anchored" } },
        { id: "container_1", anchor_v1: { target_kind: "bpmn_node", target_id: "Task_1", relation: "highlights", status: "anchored" } },
      ],
    },
    bpmnNodeIds: ["Task_1"],
  });

  assert.equal(summary.companionCount, 5);
  assert.equal(summary.summaryTone, "ok");
  assert.equal(summary.hasMoreCompanions, true);
  assert.equal(summary.remainingCompanionCount, 2);
  assert.deepEqual(summary.previewCompanions.map((item) => item.objectId), ["text_1", "text_2", "text_3"]);
});

test("drawio anchors: BPMN-side companion ordering prioritizes invalid companions before healthy ones", () => {
  const summary = buildBpmnNodeOverlayCompanionSummary({
    selectedBpmnNodeId: "Task_1",
    drawioMeta: {
      drawio_elements_v1: [
        { id: "text_2", text: "Healthy", anchor_v1: { target_kind: "bpmn_node", target_id: "Task_1", relation: "explains", status: "anchored" } },
        { id: "ellipse_1", anchor_v1: { target_kind: "bpmn_node", target_id: "Task_1", relation: "highlights", status: "invalid" } },
        { id: "rect_1", anchor_v1: { target_kind: "bpmn_node", target_id: "Task_1", relation: "highlights", status: "anchored" } },
      ],
    },
    bpmnNodeIds: ["Task_1"],
  });

  assert.equal(summary.companions[0].objectId, "ellipse_1");
  assert.equal(summary.previewCompanions[0].status, "invalid");
});

test("drawio anchors: import diagnostics defer during BPMN hydrate race", () => {
  const diagnostics = buildDrawioAnchorImportDiagnostics({
    beforeMeta: {
      drawio_elements_v1: [
        {
          id: "text_1",
          text: "A",
          anchor_v1: { target_kind: "bpmn_node", target_id: "Task_1", relation: "explains", status: "anchored" },
        },
      ],
    },
    beforeBpmnNodeIds: ["Task_1"],
    afterBpmnNodeIds: [],
    validationReady: false,
  });
  assert.equal(diagnostics.validationDeferred, true);
  assert.equal(diagnostics.importHasAnchorImpact, false);
});
