import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const pageSource = fs.readFileSync(new URL("./AdminOrgsPage.jsx", import.meta.url), "utf8");
const ruSource = fs.readFileSync(new URL("../../../shared/i18n/ru.js", import.meta.url), "utf8");
const topbarSource = fs.readFileSync(new URL("../layout/AdminTopbar.jsx", import.meta.url), "utf8");

test("AdminOrgsPage uses access-first information architecture", () => {
  assert.match(pageSource, /ACCESS_SECTION_NAV/);
  assert.match(pageSource, /admin-access-users/);
  assert.match(pageSource, /admin-access-invites/);
  assert.match(pageSource, /admin-access-orgs/);
  assert.match(pageSource, /admin-access-git/);
  assert.match(pageSource, /admin-access-system/);

  assert.ok(pageSource.indexOf('id="admin-access-users"') < pageSource.indexOf('id="admin-access-invites"'));
  assert.ok(pageSource.indexOf('id="admin-access-invites"') < pageSource.indexOf('id="admin-access-orgs"'));
  assert.ok(pageSource.indexOf('id="admin-access-orgs"') < pageSource.indexOf('id="admin-access-git"'));
});

test("AdminOrgsPage keeps existing admin actions while separating organizations and Git mirror", () => {
  assert.match(pageSource, /Создать организацию/);
  assert.match(pageSource, /Переименовать активную организацию/);
  assert.match(pageSource, /<OrgsTable items=\{payload\?\.items \|\| \[\]\} \/>/);
  assert.match(pageSource, /Git mirror \/ публикация/);
  assert.match(pageSource, /Сохранить Git mirror/);
  assert.match(pageSource, /<AdminUsersPanel/);
  assert.match(pageSource, /<AdminOrgInvitesPanel/);
});

test("AdminOrgsPage removes empty filters block and demotes system notes", () => {
  assert.equal(pageSource.includes("AdminFiltersBar"), false);
  assert.match(pageSource, /function SystemStatusPanel/);
  assert.match(pageSource, /<details id="admin-access-system"/);
  assert.match(pageSource, /Redis и runtime health остаются в операционной сводке/);
});

test("admin orgs route and nav use product access wording", () => {
  assert.match(ruSource, /orgs: "Пользователи и доступ"/);
  assert.match(ruSource, /title: "Пользователи и доступ"/);
  assert.match(ruSource, /subtitle: "Управление пользователями, ролями, инвайтами и организациями\."/);
  assert.match(ruSource, /title: "Организации"/);
});

test("AdminTopbar renders Redis as compact system status instead of primary Redis card", () => {
  assert.match(topbarSource, /label="Система"/);
  assert.match(topbarSource, /Redis \$\{toText\(redisMode\) \|\| "UNKNOWN"\}/);
  assert.equal(topbarSource.includes("<StatusPill"), false);
});
