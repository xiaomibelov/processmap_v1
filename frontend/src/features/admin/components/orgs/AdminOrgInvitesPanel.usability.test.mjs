import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync(new URL("./AdminOrgInvitesPanel.jsx", import.meta.url), "utf8");

test("AdminOrgInvitesPanel keeps invite creation visible and compact", () => {
  assert.match(source, /InviteInlineForm/);
  assert.match(source, /onSubmit=\{handleCreateInvite\}/);
  assert.match(source, /Организация/);
  assert.match(source, /Email/);
  assert.match(source, /Имя/);
  assert.match(source, /Должность/);
  assert.match(source, /Роль/);
  assert.match(source, /TTL, дн/);
  assert.match(source, /text-xs/);
});

test("AdminOrgInvitesPanel renders dense table with expandable permission rows", () => {
  assert.match(source, /InvitesTable/);
  assert.match(source, /w-full border-collapse text-xs/);
  assert.match(source, /expandedInviteId/);
  assert.match(source, /setExpandedInviteId/);
  assert.match(source, /colSpan=\{11\}/);
});

test("AdminOrgInvitesPanel preserves invite API actions and statuses", () => {
  assert.match(source, /apiCreateOrgInvite/);
  assert.match(source, /apiListOrgInvites/);
  assert.match(source, /apiRevokeOrgInvite/);
  assert.match(source, /handleRegenerateInvite/);
  assert.match(source, /handleRevokeInvite/);
  assert.match(source, /trStatusInvite\(status\)/);
});

test("AdminOrgInvitesPanel includes permission editor and inline permission editing", () => {
  assert.match(source, /AdminInvitePermissionEditor/);
  assert.match(source, /AdminInvitePermissionSummary/);
  assert.match(source, /apiAdminGetInvitePermissions/);
  assert.match(source, /apiAdminPatchInvitePermissions/);
  assert.match(source, /startEditingPermissions/);
  assert.match(source, /saveEditingPermissions/);
  assert.match(source, /Права/);
});
