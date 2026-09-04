import test from "node:test";
import assert from "node:assert/strict";
import { buildWorkspacePermissions } from "./workspacePermissions.js";

// П4: gating смены статуса сессии (archived → can_manage) требует явного флага
// canManage в permissions-объекте.
test("buildWorkspacePermissions exposes canManage (admin-only)", () => {
  assert.equal(buildWorkspacePermissions("org_admin").canManage, true);
  assert.equal(buildWorkspacePermissions("editor").canManage, false);
  assert.equal(buildWorkspacePermissions("org_viewer").canManage, false);
  assert.equal(buildWorkspacePermissions("", true).canManage, true);
});
