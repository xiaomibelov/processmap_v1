import test from "node:test";
import assert from "node:assert/strict";

import {
  buildSelectionTemplatePayload,
  canCreateOrgTemplate,
  canManageOrgTemplate,
  normalizeTemplateElementIds,
  normalizeTemplateScope,
  readTemplateElementIds,
} from "./selectionTemplates.js";

test("normalizeTemplateScope: defaults to personal", () => {
  assert.equal(normalizeTemplateScope(""), "personal");
  assert.equal(normalizeTemplateScope("PERSONAL"), "personal");
  assert.equal(normalizeTemplateScope("org"), "org");
});

test("normalizeTemplateElementIds: trims + dedupes", () => {
  assert.deepEqual(
    normalizeTemplateElementIds([" Task_1 ", "", "Task_1", "Task_2"]),
    ["Task_1", "Task_2"],
  );
});

test("buildSelectionTemplatePayload: serializes ids + fingerprint", () => {
  const payload = buildSelectionTemplatePayload({
    selectedElementIds: ["Task_1", "Task_2", "Task_1"],
    bpmnFingerprint: " fp_1 ",
  });
  assert.deepEqual(payload, {
    bpmn_element_ids: ["Task_1", "Task_2"],
    bpmn_fingerprint: "fp_1",
  });
});

test("readTemplateElementIds: reads payload ids safely", () => {
  assert.deepEqual(readTemplateElementIds({ payload: { bpmn_element_ids: ["Task_1", "Task_2"] } }), ["Task_1", "Task_2"]);
  assert.deepEqual(readTemplateElementIds({}), []);
});

test("rbac: org template create/manage", () => {
  assert.equal(canCreateOrgTemplate("project_manager", false), true);
  assert.equal(canCreateOrgTemplate("viewer", false), false);
  assert.equal(canManageOrgTemplate("org_admin", false), true);
  assert.equal(canManageOrgTemplate("project_manager", false), false);
  assert.equal(canManageOrgTemplate("", true), true);
});

