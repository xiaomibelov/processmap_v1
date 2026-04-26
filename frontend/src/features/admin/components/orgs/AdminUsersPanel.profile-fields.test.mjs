import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync(new URL("./AdminUsersPanel.jsx", import.meta.url), "utf8");

test("AdminUsersPanel keeps Russian access wording and profile fields", () => {
  assert.match(source, /title="Пользователи и доступ"/);
  assert.match(source, /Администратор платформы управляет пользователями, ролями и доступом к организациям\./);
  assert.match(source, />Пользователь</);
  assert.match(source, />Должность</);
  assert.match(source, /name="admin_user_full_name"/);
  assert.match(source, /name="admin_user_job_title"/);
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
