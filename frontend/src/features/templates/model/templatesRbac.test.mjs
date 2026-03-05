import test from "node:test";
import assert from "node:assert/strict";

import { canCreateOrgTemplateForRole, canMutateTemplate } from "./templatesRbac.js";

test("canCreateOrgTemplateForRole allows admin and org managers", () => {
  assert.equal(canCreateOrgTemplateForRole("viewer", true), true);
  assert.equal(canCreateOrgTemplateForRole("org_admin", false), true);
  assert.equal(canCreateOrgTemplateForRole("project_manager", false), true);
  assert.equal(canCreateOrgTemplateForRole("viewer", false), false);
});

test("canMutateTemplate allows owner and org manager, blocks foreign viewer", () => {
  const shared = {
    id: "tpl_1",
    scope: "org",
    owner_user_id: "owner_1",
  };
  assert.equal(canMutateTemplate({ template: shared, userId: "owner_1", isAdmin: false, activeOrgRole: "viewer" }), true);
  assert.equal(canMutateTemplate({ template: shared, userId: "user_2", isAdmin: false, activeOrgRole: "project_manager" }), true);
  assert.equal(canMutateTemplate({ template: shared, userId: "user_2", isAdmin: false, activeOrgRole: "viewer" }), false);
});
