import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const pageSource = fs.readFileSync(new URL("./AdminOrgsPage.jsx", import.meta.url), "utf8");
const orgsPanelSource = fs.readFileSync(new URL("../components/orgs/AdminOrgsPanel.jsx", import.meta.url), "utf8");
const detailPanelSource = fs.readFileSync(new URL("../components/orgs/AdminOrgDetailPanel.jsx", import.meta.url), "utf8");
const gitMirrorSource = fs.readFileSync(new URL("../components/gitMirror/AdminGitMirrorPanel.jsx", import.meta.url), "utf8");
const systemSource = fs.readFileSync(new URL("../components/system/AdminSystemPanel.jsx", import.meta.url), "utf8");
const ruSource = fs.readFileSync(new URL("../../../shared/i18n/ru.js", import.meta.url), "utf8");
const topbarSource = fs.readFileSync(new URL("../layout/AdminTopbar.jsx", import.meta.url), "utf8");

test("AdminOrgsPage uses access-first information architecture with tabs", () => {
  assert.equal(pageSource.includes("ACCESS_SECTION_NAV"), false);
  assert.equal(pageSource.includes("function PageSectionNav"), false);
  assert.equal(pageSource.includes("Разделы страницы пользователей и доступа"), false);
  assert.equal(pageSource.includes("<PageSectionNav"), false);
  assert.match(pageSource, /admin-access-users/);
  assert.match(pageSource, /admin-access-invites/);
  assert.match(pageSource, /admin-access-permissions/);
  assert.match(pageSource, /admin-access-orgs/);
  assert.match(pageSource, /admin-access-git/);
  assert.match(pageSource, /admin-access-system/);

  assert.ok(pageSource.indexOf('id="admin-access-users"') < pageSource.indexOf('id="admin-access-invites"'));
  assert.ok(pageSource.indexOf('id="admin-access-invites"') < pageSource.indexOf('id="admin-access-permissions"'));
  assert.ok(pageSource.indexOf('id="admin-access-permissions"') < pageSource.indexOf('id="admin-access-orgs"'));
  assert.ok(pageSource.indexOf('id="admin-access-orgs"') < pageSource.indexOf('id="admin-access-git"'));

  assert.match(pageSource, /<AdminTabs tabs=\{visibleTabs\}/);
  assert.match(pageSource, /AdminPermissionsPanel/);
});

test("AdminOrgsPage delegates organizations and git mirror tabs to dedicated panels", () => {
  assert.match(pageSource, /<AdminOrgsPanel/);
  assert.match(orgsPanelSource, /id="admin-access-orgs"/);
  assert.match(orgsPanelSource, /Создать организацию/);
  assert.match(detailPanelSource, /Детали организации/);
  assert.match(detailPanelSource, /Сохранить название/);
  assert.match(orgsPanelSource, /<OrgsTable/);
  assert.match(orgsPanelSource, /<AdminOrgDetailPanel/);
  assert.match(pageSource, /<div id="admin-access-orgs"/);
  assert.match(pageSource, /<AdminGitMirrorPanel/);
  assert.match(pageSource, /<div id="admin-access-git"/);
  assert.match(gitMirrorSource, /Git mirror \/ публикация/);
  assert.match(gitMirrorSource, /Сохранить Git mirror/);
  assert.match(gitMirrorSource, /Проверить конфигурацию/);
  assert.match(pageSource, /<AdminUsersPanel/);
  assert.match(pageSource, /<AdminOrgInvitesPanel/);
  assert.ok(pageSource.indexOf("<AdminUsersPanel") < pageSource.indexOf("<AdminOrgInvitesPanel"));
});

test("AdminOrgsPage removes empty filters block and uses AdminSystemPanel for system tab", () => {
  assert.equal(pageSource.includes("AdminFiltersBar"), false);
  assert.equal(pageSource.includes("function SystemStatusPanel"), false);
  assert.match(pageSource, /<AdminSystemPanel/);
  assert.match(pageSource, /<div id="admin-access-system"/);
  assert.match(systemSource, /AdminTabs/);
  assert.match(systemSource, /Заметки/);
  assert.match(systemSource, /Runtime/);
  assert.match(systemSource, /Аудит/);
  assert.match(systemSource, /Feature flags/);
  assert.match(systemSource, /Redis и runtime health остаются в операционной сводке/);
});

test("admin orgs route and nav use product access wording", () => {
  assert.match(ruSource, /orgs: "Пользователи и доступ"/);
  assert.match(ruSource, /title: "Пользователи и доступ"/);
  assert.ok(ruSource.includes('subtitle: "Управление пользователями, ролями, инвайтами и организациями."'));
  assert.match(ruSource, /title: "Организации"/);
});

test("AdminTopbar renders Redis as compact system status instead of primary Redis card", () => {
  assert.match(topbarSource, /label="Система"/);
  assert.match(topbarSource, /Redis \$\{toText\(redisMode\) \|\| "UNKNOWN"\}/);
  assert.equal(topbarSource.includes("<StatusPill"), false);
});
