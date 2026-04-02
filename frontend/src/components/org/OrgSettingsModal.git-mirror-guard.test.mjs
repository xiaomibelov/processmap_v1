import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync(new URL("./OrgSettingsModal.jsx", import.meta.url), "utf8");

test("git mirror submit is guarded until initial config load resolves", () => {
  assert.match(source, /const \[gitConfigLoaded, setGitConfigLoaded\] = useState\(false\);/);
  assert.match(source, /setGitConfigLoaded\(false\);/);
  assert.match(source, /setGitConfigLoaded\(true\);/);
  assert.match(source, /if \(isGitMirrorSubmitLocked\(\{ canManageMembers, gitBusy, busy, gitConfigLoaded \}\)\)/);
  assert.match(source, /Дождитесь загрузки настроек Git mirror перед сохранением\./);
  assert.match(source, /disabled=\{gitFormLocked\}/);
});

