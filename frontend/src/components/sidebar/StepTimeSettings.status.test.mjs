import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const notesPanelSource = fs.readFileSync(new URL("../NotesPanel.jsx", import.meta.url), "utf8");
const controlsSource = fs.readFileSync(new URL("./ElementSettingsControls.jsx", import.meta.url), "utf8");

test("step time block exposes calm Russian status copy for saved/local/syncing/error", () => {
  assert.match(controlsSource, /label: "Сохранено"/);
  assert.match(controlsSource, /label: "Есть локальные изменения"/);
  assert.match(controlsSource, /label: "Синхронизация…"/);
  assert.match(controlsSource, /label: "Ошибка"/);
  assert.match(controlsSource, /helper: "Время шага сохранено\."/);
  assert.match(controlsSource, /helper: "Значение времени изменено локально\."/);
  assert.match(controlsSource, /helper: "Время шага сохраняется\."/);
  assert.match(controlsSource, /helper: "Не удалось сохранить время шага\. Значение осталось в поле\."/);
});

test("step time block keeps CTA discipline: only error state exposes retry", () => {
  assert.match(controlsSource, /cta: "Повторить"/);
  assert.match(controlsSource, /<SidebarTrustStatus/);
  assert.match(controlsSource, /testIdPrefix="step-time-status"/);
});

test("NotesPanel derives step time trust state with precedence syncing > error > local > saved", () => {
  assert.match(notesPanelSource, /const stepTimeHasLocalChanges = normalizeStepTimeDraftValue\(stepTimeInput\) !== normalizeStepTimeDraftValue\(stepTimeBaselineInput\);/);
  assert.match(notesPanelSource, /const stepTimeSyncState = stepTimeBusy\s*\?\s*"syncing"\s*:\s*\(stepTimeSaveFailed \? "error" : \(stepTimeHasLocalChanges \? "local" : "saved"\)\);/);
});

test("NotesPanel reuses existing step time save lifecycle and preserves local draft on failure", () => {
  assert.match(notesPanelSource, /async function saveSelectedElementStepTime\(\)/);
  assert.match(notesPanelSource, /setStepTimeBusy\(true\);/);
  assert.match(notesPanelSource, /setStepTimeSaveFailed\(false\);\s*setStepTimeErr\(""\);/);
  assert.match(notesPanelSource, /if \(result && result\.ok === false\) \{\s*setStepTimeSaveFailed\(true\);/);
  assert.match(notesPanelSource, /catch \(error\) \{\s*setStepTimeSaveFailed\(true\);/);
});

test("NotesPanel clears stale step time error on new edit and passes runtime state into the step time block", () => {
  assert.match(notesPanelSource, /setStepTimeSaveFailed\(false\);\s*setStepTimeInput\(value\);/);
  assert.match(notesPanelSource, /stepTimeSyncState=\{isElementMode \? stepTimeSyncState : "saved"\}/);
});
