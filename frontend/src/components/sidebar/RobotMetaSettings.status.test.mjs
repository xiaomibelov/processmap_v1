import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const notesPanelSource = fs.readFileSync(new URL("../NotesPanel.jsx", import.meta.url), "utf8");
const controlsSource = fs.readFileSync(new URL("./ElementSettingsControls.jsx", import.meta.url), "utf8");

test("robot meta block exposes calm trust-status copy for saved/local/syncing/error", () => {
  assert.match(controlsSource, /helper: "Robot Meta сохранена\."/);
  assert.match(controlsSource, /helper: "Есть локальные изменения\."/);
  assert.match(controlsSource, /helper: "Robot Meta сохраняется\."/);
  assert.match(controlsSource, /helper: "Не удалось сохранить Robot Meta\. Изменения остались в форме\."/);
  assert.match(controlsSource, /testIdPrefix="robotmeta-trust-status"/);
});

test("robot meta block keeps CTA discipline: only error state exposes retry", () => {
  assert.match(controlsSource, /cta: "Повторить"/);
  assert.match(controlsSource, /<SidebarTrustStatus/);
});

test("NotesPanel derives robot meta trust state with precedence syncing > error > local > saved", () => {
  assert.match(notesPanelSource, /const robotMetaHasLocalChanges = useMemo\(\(\) => \{/);
  assert.match(notesPanelSource, /const robotMetaSyncState = robotMetaBusy\s*\?\s*"syncing"\s*:\s*\(robotMetaSaveFailed \? "error" : \(robotMetaHasLocalChanges \? "local" : "saved"\)\);/);
});

test("NotesPanel reuses existing robot meta save lifecycle and preserves local draft on failure", () => {
  assert.match(notesPanelSource, /async function saveSelectedRobotMeta\(\)/);
  assert.match(notesPanelSource, /setRobotMetaBusy\(true\);\s*setRobotMetaSaveFailed\(false\);\s*setRobotMetaErr\(""\);\s*setRobotMetaInfo\(""\);/);
  assert.match(notesPanelSource, /if \(result && result\.ok === false\) \{\s*setRobotMetaSaveFailed\(true\);/);
  assert.match(notesPanelSource, /setRobotMetaSaveFailed\(false\);\s*setRobotMetaInfo\("Robot Meta сохранена\."\);/);
  assert.match(notesPanelSource, /catch \(error\) \{\s*setRobotMetaSaveFailed\(true\);/);
});

test("NotesPanel clears stale robot meta error on new edit and passes runtime state into the block", () => {
  assert.match(notesPanelSource, /function updateRobotMetaDraft\(nextRaw\) \{\s*setRobotMetaDraft\(normalizeRobotMetaV1\(nextRaw\)\);\s*setRobotMetaSaveFailed\(false\);/);
  assert.match(notesPanelSource, /robotMetaSyncState=\{isElementMode \? robotMetaSyncState : "saved"\}/);
});
