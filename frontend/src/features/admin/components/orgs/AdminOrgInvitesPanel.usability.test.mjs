import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync(new URL("./AdminOrgInvitesPanel.jsx", import.meta.url), "utf8");

test("AdminOrgInvitesPanel keeps invite creation visible and compact", () => {
  const formIndex = source.indexOf("onSubmit={handleCreateInvite}");
  const historyButtonIndex = source.indexOf("Показать историю инвайтов");
  assert.ok(formIndex > 0);
  assert.ok(historyButtonIndex > 0);
  assert.ok(formIndex < historyButtonIndex);
  assert.match(source, /Организация/);
  assert.match(source, /Email/);
  assert.match(source, /Имя/);
  assert.match(source, /Должность/);
  assert.match(source, /Роль/);
  assert.match(source, /Срок действия, дней/);
  assert.match(source, /primaryBtn h-9 min-h-0 w-full/);
});

test("AdminOrgInvitesPanel collapses invite history by default", () => {
  assert.match(source, /const \[historyOpen, setHistoryOpen\] = useState\(false\)/);
  assert.match(source, /aria-expanded=\{historyOpen\}/);
  assert.match(source, /Показать историю инвайтов · \$\{invites\.length\}/);
  assert.match(source, /Скрыть историю инвайтов/);
  assert.match(source, /\{historyOpen \? \(/);
});

test("AdminOrgInvitesPanel preserves invite API actions and statuses", () => {
  assert.match(source, /apiCreateOrgInvite/);
  assert.match(source, /apiListOrgInvites/);
  assert.match(source, /apiRevokeOrgInvite/);
  assert.match(source, /handleRegenerateInvite/);
  assert.match(source, /handleRevokeInvite/);
  assert.match(source, /trStatusInvite\(status\)/);
});
