import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync(new URL("./AdminUsersPanel.jsx", import.meta.url), "utf8");

const usersDir = new URL("../users/", import.meta.url);
const tableSource = fs.readFileSync(new URL("./UsersTable.jsx", usersDir), "utf8");
const drawerSource = fs.readFileSync(new URL("./UserDrawer.jsx", usersDir), "utf8");
const utilsSource = fs.readFileSync(new URL("./userAccessUtils.js", usersDir), "utf8");
const hookSource = fs.readFileSync(new URL("../../hooks/useUserAccessForm.js", import.meta.url), "utf8");

test("AdminUsersPanel keeps Russian access wording and profile fields", () => {
  assert.match(source, /title="Пользователи платформы"/);
  assert.match(source, /Управление пользователями и их доступом к организациям\./);
  assert.match(source, /function getUserIdentity/);
  assert.match(source, /full_name.*fullName/);
  assert.match(source, /job_title.*jobTitle/);
});

test("AdminUsersPanel shows platform-only explanation instead of silently disappearing for org admins", () => {
  assert.equal(source.includes("if (!isAdmin) return null"), false);
  assert.match(source, /if \(!isAdmin\) \{/);
  assert.match(source, /Пользователи платформы доступны только администратору платформы\./);
  assert.match(source, /Вы управляете участниками выбранной организации в блоке доступа организации\./);
});

test("AdminUsersPanel preserves backend user APIs", () => {
  assert.match(source, /apiAdminCreateUser/);
  assert.match(source, /apiAdminListUsers/);
  assert.match(source, /if \(!isAdmin\) return;\s+setLoading\(true\);\s+setError\(""\);\s+const res = await apiAdminListUsers\(\);/s);
  assert.match(source, /apiAdminPatchUser/);
});

test("AdminUsersPanel integrates redesigned user-access components", () => {
  assert.match(source, /AvatarInitials/);
  assert.match(source, /PermissionMatrix/);
  assert.match(source, /UserDrawer/);
  assert.match(source, /UserFilters/);
  assert.match(source, /UsersTable/);
  assert.match(source, /useUserAccessForm/);
  assert.match(source, /filterUsers/);
});

test("UsersTable displays full_name identity with email fallback and job_title column", () => {
  assert.match(tableSource, /user\?\.full_name \|\| user\?\.fullName/);
  assert.match(tableSource, /user\?\.job_title \|\| user\?\.jobTitle/);
  assert.match(tableSource, /AvatarInitials/);
});

test("UserDrawer submits via useUserAccessForm and supports granular permissions", () => {
  assert.match(drawerSource, /form\.buildPayload\(\)/);
  assert.match(drawerSource, /PermissionMatrix/);
  assert.match(drawerSource, /handlePermissionChange/);
  assert.match(hookSource, /full_name: toText\(fullName\)/);
  assert.match(hookSource, /job_title: toText\(jobTitle\)/);
  assert.match(hookSource, /memberships: nextMemberships/);
});

test("userAccessUtils keeps permission normalization and role templates", () => {
  assert.match(utilsSource, /PERMISSION_KEYS/);
  assert.match(utilsSource, /rolePermissionTemplate/);
  assert.match(utilsSource, /normalizePermissions/);
  assert.match(utilsSource, /filterUsers/);
  assert.match(utilsSource, /getInitials/);
});

test("useUserAccessForm resets permissions when role changes", () => {
  assert.match(hookSource, /handleMembershipChange/);
  assert.match(hookSource, /next\.permissions = \{ \.\.\.rolePermissionTemplate\(value\) \}/);
  assert.match(hookSource, /handlePermissionChange/);
});
