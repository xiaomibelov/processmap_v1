import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync(new URL("./AdminUsersPanel.jsx", import.meta.url), "utf8");

test("AdminUsersPanel keeps Russian access wording and profile fields", () => {
  assert.match(source, /title="Пользователи платформы"/);
  assert.match(source, /Управление пользователями и их доступом к организациям\./);
  assert.match(source, />Пользователь</);
  assert.match(source, />Должность</);
  assert.match(source, /name="admin_user_full_name"/);
  assert.match(source, /name="admin_user_job_title"/);
});

test("AdminUsersPanel shows platform-only explanation instead of silently disappearing for org admins", () => {
  assert.equal(source.includes("if (!isAdmin) return null"), false);
  assert.match(source, /if \(!isAdmin\) \{/);
  assert.match(source, /Пользователи платформы доступны только администратору платформы\./);
  assert.match(source, /Вы управляете участниками выбранной организации в блоке доступа организации\./);
});

test("AdminUsersPanel uses full_name identity with email fallback and job_title column", () => {
  assert.match(source, /function getUserIdentity/);
  assert.match(source, /user\?\.full_name \|\| user\?\.fullName/);
  assert.match(source, /primary: fullName \|\| email \|\| "—"/);
  assert.match(source, /secondary: fullName && email \? email : ""/);
  assert.match(source, /row\?\.job_title \|\| row\?\.jobTitle/);
});

test("AdminUsersPanel submits profile fields and does not render raw user id as visible secondary text", () => {
  assert.match(source, /full_name: toText\(fullName\)/);
  assert.match(source, /job_title: toText\(jobTitle\)/);
  assert.equal(source.includes("{userId || \"—\"}"), false);
  assert.equal(source.includes("mt-1 text-xs text-slate-500\">{userId"), false);
  assert.match(source, /title=\{userId \? `ID: \$\{userId\}` : ""\}/);
});

test("AdminUsersPanel keeps the user form above the full-width compact table", () => {
  const formIndex = source.indexOf('<form className="rounded-xl border border-slate-200 bg-slate-50 p-3"');
  const tableIndex = source.indexOf('<table className="min-w-full table-fixed border-collapse text-[13px]"');
  assert.ok(formIndex > 0);
  assert.ok(tableIndex > 0);
  assert.ok(formIndex < tableIndex);
  assert.equal(source.includes("xl:grid-cols-[1.45fr_0.9fr]"), false);
  assert.equal(source.includes("min-w-[1080px]"), false);
  assert.match(source, /Новый \/ сбросить/);
  assert.match(source, /Создать пользователя/);
  assert.match(source, /Сохранить пользователя/);
  assert.match(source, /compactInputClass/);
});

test("AdminUsersPanel preserves backend user APIs and membership editing controls", () => {
  assert.match(source, /apiAdminCreateUser/);
  assert.match(source, /apiAdminListUsers/);
  assert.match(source, /if \(!isAdmin\) return;\s+setBusy\(true\);\s+setError\(""\);\s+const res = await apiAdminListUsers\(\);/s);
  assert.match(source, /apiAdminPatchUser/);
  assert.match(source, /handleAddMembership/);
  assert.match(source, /handleRemoveMembership/);
  assert.match(source, /USER_FACING_ROLE_OPTIONS/);
});
