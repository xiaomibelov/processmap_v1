import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync(new URL("./AdminGroupsPanel.jsx", import.meta.url), "utf8");

test("AdminGroupsPanel renders inline create form and dense groups table", () => {
  assert.match(source, /Создать группу/);
  assert.match(source, /Название/);
  assert.match(source, /Описание/);
  assert.match(source, /apiCreateOrgGroup/);
  assert.match(source, /apiListOrgGroups/);
  assert.match(source, /id="admin-access-groups"/);
  assert.match(source, /<GroupsTable/);
});

test("AdminGroupsPanel supports group editing and member management", () => {
  assert.match(source, /apiUpdateOrgGroup/);
  assert.match(source, /apiDeleteOrgGroup/);
  assert.match(source, /apiListGroupMembers/);
  assert.match(source, /apiAddGroupMember/);
  assert.match(source, /apiRemoveGroupMember/);
  assert.match(source, /Участники группы/);
  assert.match(source, /expandedGroupId/);
});

test("AdminGroupsPanel uses cached query keys", () => {
  assert.match(source, /\["orgGroups", orgId\]/);
  assert.match(source, /\["groupMembers", orgId, groupId\]/);
  assert.match(source, /\["orgAssignableUsers", orgId\]/);
});
