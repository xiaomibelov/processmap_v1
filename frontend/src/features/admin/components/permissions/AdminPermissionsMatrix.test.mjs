import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync(new URL("./AdminPermissionsMatrix.jsx", import.meta.url), "utf8");

test("AdminPermissionsMatrix renders a principal × entity matrix", () => {
  assert.match(source, /AdminPermissionsMatrix/);
  assert.match(source, /apiAdminListPermissionPrincipals/);
  assert.match(source, /apiAdminListMatrixPermissions/);
  assert.match(source, /apiAdminPatchMatrixPermission/);
  assert.match(source, /apiAdminBulkMatrixPermissions/);
  assert.match(source, /Simplified/);
  assert.match(source, /Advanced/);
});

test("AdminPermissionsMatrix supports simplified and advanced toggles and bulk actions", () => {
  assert.match(source, /const \[view, setView\]/);
  assert.match(source, /setView\("advanced"\)/);
  assert.match(source, /applyBulk/);
  assert.match(source, /selectedIds/);
  assert.match(source, /type="checkbox"/);
});

test("AdminPermissionsMatrix uses entity-type columns and preset detection", () => {
  assert.match(source, /ENTITY_TYPES/);
  assert.match(source, /detectPreset/);
  assert.match(source, /presetPermissions/);
  assert.match(source, /permissionKeys/);
});
