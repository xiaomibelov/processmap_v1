import test from "node:test";
import assert from "node:assert/strict";

import {
  buildBpmnVersionCarrier,
  buildSessionCompanionAfterSave,
  buildSessionCompanionAfterTemplateApply,
  buildSessionCompanionAfterTraversal,
  normalizeSessionCompanion,
  resolvePreferredSessionCompanion,
} from "./sessionCompanionContracts.js";

function buildDraft(overrides = {}) {
  return {
    bpmn_xml: "<xml>base</xml>",
    bpmn_xml_version: 7,
    bpmn_graph_fingerprint: "fp_7",
    ...overrides,
  };
}

test("save contract captures durable BPMN version and truthful saved state", () => {
  const next = buildSessionCompanionAfterSave({}, {
    draft: buildDraft(),
    xml: "<xml>base</xml>",
    source: "manual_save",
    savedAt: "2026-03-16T10:00:00.000Z",
    requestedBaseRev: 7,
    storedRev: 7,
  });
  assert.equal(next.bpmn_version_v1.xml_version, 7);
  assert.equal(next.save_state_v1.status, "saved");
  assert.equal(next.save_state_v1.last_saved_source, "manual_save");
  assert.equal(next.save_state_v1.saved_bpmn_version.graph_fingerprint, "fp_7");
});

test("template apply captures provenance with revision and binds it to saved BPMN version", () => {
  const next = buildSessionCompanionAfterTemplateApply({}, {
    draft: buildDraft({ bpmn_xml_version: 11, bpmn_graph_fingerprint: "fp_11" }),
    xml: "<xml>templated</xml>",
    template: {
      id: "tpl_1",
      scope: "personal",
      template_type: "bpmn_fragment_v1",
      name: "Mixer",
      updated_at: 1710000000,
      payload: {
        source_session_id: "s_source",
        primary_element_id: "Task_1",
        primary_name: "Mix",
      },
    },
    savedAt: "2026-03-16T10:05:00.000Z",
    storedRev: 11,
  });
  assert.equal(next.template_provenance_v1.template_id, "tpl_1");
  assert.equal(next.template_provenance_v1.template_revision, "1710000000");
  assert.equal(next.template_provenance_v1.bpmn_version_at_apply.xml_version, 11);
  assert.equal(next.save_state_v1.status, "saved");
});

test("newer template apply truthfully replaces applied-template revision provenance", () => {
  const first = buildSessionCompanionAfterTemplateApply({}, {
    draft: buildDraft({ bpmn_xml_version: 11, bpmn_graph_fingerprint: "fp_11" }),
    xml: "<xml>templated-v1</xml>",
    template: {
      id: "tpl_1",
      scope: "personal",
      template_type: "bpmn_fragment_v1",
      name: "Mixer",
      updated_at: 1710000000,
    },
    savedAt: "2026-03-16T10:05:00.000Z",
    storedRev: 11,
  });
  const second = buildSessionCompanionAfterTemplateApply(first, {
    draft: buildDraft({ bpmn_xml_version: 12, bpmn_graph_fingerprint: "fp_12" }),
    xml: "<xml>templated-v2</xml>",
    template: {
      id: "tpl_1",
      scope: "personal",
      template_type: "bpmn_fragment_v1",
      name: "Mixer",
      updated_at: 1710003600,
    },
    savedAt: "2026-03-16T10:06:00.000Z",
    storedRev: 12,
  });
  assert.equal(second.template_provenance_v1.template_id, "tpl_1");
  assert.equal(second.template_provenance_v1.template_revision, "1710003600");
  assert.equal(second.template_provenance_v1.bpmn_version_at_apply.xml_version, 12);
});

test("traversal result materializes gateway decisions and stays fresh only for matching BPMN version", () => {
  const withTraversal = buildSessionCompanionAfterTraversal({}, {
    draft: buildDraft({ bpmn_xml_version: 20, bpmn_graph_fingerprint: "fp_20" }),
    xml: "<xml>v20</xml>",
    autoPassResult: {
      status: "done",
      generated_at: "2026-03-16T10:10:00.000Z",
      graph_hash: "graph_20",
      summary: {
        total_variants_done: 2,
        total_variants_failed: 1,
      },
      variants: [
        {
          gateway_choices: [
            { gateway_id: "Gateway_1", flow_id: "Flow_yes", label: "yes" },
          ],
        },
        {
          gateway_choices: [
            { gateway_id: "Gateway_1", flow_id: "Flow_yes", label: "yes" },
            { gateway_id: "Gateway_2", flow_id: "Flow_exit", label: "exit" },
          ],
        },
      ],
      debug_failed_variants: [{ error: { code: "MAX_VISITS_REACHED" } }],
      warnings: [{ code: "max_visits_reached" }],
    },
  });
  assert.equal(withTraversal.traversal_result_v1.gateway_decisions.length, 2);
  assert.equal(withTraversal.traversal_result_v1.gateway_decisions[0].gateway_id, "Gateway_1");
  assert.equal(withTraversal.traversal_result_v1.gateway_decisions[0].choice_count, 2);
  assert.equal(withTraversal.traversal_result_v1.stale, false);

  const afterSave = buildSessionCompanionAfterSave(withTraversal, {
    draft: buildDraft({ bpmn_xml_version: 21, bpmn_graph_fingerprint: "fp_21" }),
    xml: "<xml>v21</xml>",
    source: "manual_save",
    savedAt: "2026-03-16T10:11:00.000Z",
    requestedBaseRev: 21,
    storedRev: 21,
  });
  assert.equal(afterSave.traversal_result_v1.stale, true);
});

test("preferred session companion can read from Jazz snapshot while keeping legacy fallback", () => {
  const preferred = resolvePreferredSessionCompanion(
    {
      bpmn_version_v1: { xml_version: 9, graph_fingerprint: "fp_9", xml_hash: "h9" },
    },
    {
      bpmn_version_v1: { xml_version: 7, graph_fingerprint: "fp_7", xml_hash: "h7" },
    },
  );
  assert.equal(preferred.bpmn_version_v1.xml_version, 9);
  assert.deepEqual(normalizeSessionCompanion({}), {
    schema_version: "session_companion_v1",
    bpmn_version_v1: {
      xml_version: 0,
      graph_fingerprint: "",
      xml_hash: "",
      captured_at: "",
      source: "",
    },
    save_state_v1: {
      status: "unknown",
      last_saved_at: "",
      last_saved_source: "",
      requested_base_rev: 0,
      stored_rev: 0,
      saved_bpmn_version: {
        xml_version: 0,
        graph_fingerprint: "",
        xml_hash: "",
        captured_at: "",
        source: "",
      },
    },
    template_provenance_v1: {
      template_id: "",
      template_scope: "",
      template_type: "",
      template_name: "",
      template_revision: "",
      template_updated_at: "",
      applied_at: "",
      source_session_id: "",
      primary_element_id: "",
      primary_name: "",
      bpmn_version_at_apply: {
        xml_version: 0,
        graph_fingerprint: "",
        xml_hash: "",
        captured_at: "",
        source: "",
      },
    },
    traversal_result_v1: {
      schema_version: "traversal_result_v1",
      source: "auto_pass_v1",
      status: "idle",
      generated_at: "",
      graph_hash: "",
      variant_count: 0,
      failed_variant_count: 0,
      warnings_count: 0,
      gateway_decisions: [],
      broken_model: {
        code: "",
        message: "",
      },
      bpmn_version: {
        xml_version: 0,
        graph_fingerprint: "",
        xml_hash: "",
        captured_at: "",
        source: "",
      },
      stale: false,
    },
    revision_ledger_v1: {
      schema_version: "revision_ledger_v1",
      latest_revision_number: 0,
      latest_revision_id: "",
      current_revision_id: "",
      revisions: [],
    },
  });
  const version = buildBpmnVersionCarrier({ draft: buildDraft(), xml: "<xml>base</xml>", source: "test" });
  assert.equal(version.xml_version, 7);
  assert.equal(version.graph_fingerprint, "fp_7");
});

test("repeated save keeps the same durable saved version contract", () => {
  const first = buildSessionCompanionAfterSave({}, {
    draft: buildDraft(),
    xml: "<xml>base</xml>",
    source: "manual_save",
    savedAt: "2026-03-16T10:00:00.000Z",
    requestedBaseRev: 7,
    storedRev: 7,
  });
  const second = buildSessionCompanionAfterSave(first, {
    draft: buildDraft(),
    xml: "<xml>base</xml>",
    source: "manual_save",
    savedAt: "2026-03-16T10:01:00.000Z",
    requestedBaseRev: 7,
    storedRev: 7,
  });
  assert.equal(second.bpmn_version_v1.xml_version, 7);
  assert.equal(second.save_state_v1.saved_bpmn_version.xml_version, 7);
  assert.equal(second.save_state_v1.status, "saved");
});

test("live save contract does not implicitly create immutable revisions", () => {
  const saved = buildSessionCompanionAfterSave({}, {
    draft: buildDraft({ bpmn_xml_version: 30, bpmn_graph_fingerprint: "fp_30" }),
    xml: "<xml>draft_only</xml>",
    source: "manual_save",
    savedAt: "2026-03-17T14:00:00.000Z",
    requestedBaseRev: 30,
    storedRev: 30,
  });
  assert.equal(saved.revision_ledger_v1.revisions.length, 0);
  assert.equal(saved.revision_ledger_v1.latest_revision_number, 0);
});
