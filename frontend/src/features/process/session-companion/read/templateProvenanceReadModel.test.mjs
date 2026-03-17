import assert from "node:assert/strict";
import test from "node:test";

import buildSessionTemplateProvenanceReadModel from "./templateProvenanceReadModel.js";

test("template provenance read model surfaces missing provenance as warning", () => {
  const model = buildSessionTemplateProvenanceReadModel({
    companionTemplateRaw: {},
    currentVersionSnapshotRaw: { xmlVersion: 4 },
  });
  assert.equal(model.hasProvenance, false);
  assert.equal(model.isMissing, true);
  assert.equal(model.provenanceFailureReason, "template_provenance_missing");
  assert.equal(model.readinessState, "warning");
  assert.equal(model.diagnosticsSeverity, "medium");
});

test("template provenance read model surfaces stale apply version mismatch", () => {
  const model = buildSessionTemplateProvenanceReadModel({
    companionTemplateRaw: {
      template_id: "tpl_1",
      template_revision: "rev_1",
      applied_at: "2026-03-17T00:00:00.000Z",
      bpmn_version_at_apply: {
        xml_version: 3,
      },
    },
    currentVersionSnapshotRaw: { xmlVersion: 5 },
  });
  assert.equal(model.hasProvenance, true);
  assert.equal(model.isStale, true);
  assert.equal(model.provenanceFailureReason, "template_apply_version_mismatch");
  assert.equal(model.readinessState, "warning");
  assert.equal(model.diagnosticsSeverity, "medium");
});

test("template provenance read model marks healthy when provenance is present and current", () => {
  const model = buildSessionTemplateProvenanceReadModel({
    companionTemplateRaw: {
      template_id: "tpl_ok",
      template_revision: "rev_ok",
      applied_at: "2026-03-17T00:00:00.000Z",
      bpmn_version_at_apply: {
        xml_version: 5,
      },
    },
    currentVersionSnapshotRaw: { xmlVersion: 5 },
  });
  assert.equal(model.hasProvenance, true);
  assert.equal(model.isStale, false);
  assert.equal(model.provenanceFailureReason, "");
  assert.equal(model.readinessState, "healthy");
  assert.equal(model.diagnosticsSeverity, "none");
});
