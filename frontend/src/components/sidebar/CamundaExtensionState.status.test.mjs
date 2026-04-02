import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const notesPanelSource = fs.readFileSync(new URL("../NotesPanel.jsx", import.meta.url), "utf8");
const controlsSource = fs.readFileSync(new URL("./ElementSettingsControls.jsx", import.meta.url), "utf8");

test("camunda extension-state subsection exposes calm trust-status copy for saved/local/syncing/error", () => {
  assert.match(controlsSource, /<span>BPMN extension-state<\/span>/);
  assert.match(controlsSource, /label: "Сохранено"/);
  assert.match(controlsSource, /label: "Есть локальные изменения"/);
  assert.match(controlsSource, /label: "Синхронизация…"/);
  assert.match(controlsSource, /label: "Ошибка"/);
  assert.match(controlsSource, /helper: "Изменения extension-state сохранены\."/);
  assert.match(controlsSource, /helper: "Есть локальные изменения в extension-state\."/);
  assert.match(controlsSource, /helper: "Изменения extension-state сохраняются\."/);
  assert.match(controlsSource, /helper: "Не удалось сохранить extension-state\. Изменения остались в форме\."/);
  assert.match(controlsSource, /testIdPrefix="camunda-extension-state-status"/);
});

test("camunda extension-state subsection keeps CTA discipline: only error exposes retry", () => {
  assert.match(controlsSource, /cta: "Повторить"/);
  assert.match(controlsSource, /<SidebarTrustStatus/);
  assert.match(controlsSource, /onCta=\{onRetryExtensionState\}/);
});

test("NotesPanel derives camunda extension-state trust state with precedence syncing > error > local > saved", () => {
  assert.match(notesPanelSource, /const finalizedCamundaPropertiesDraft = useMemo\(/);
  assert.match(notesPanelSource, /const selectedCamundaExtensionCanonical = useMemo\(/);
  assert.match(notesPanelSource, /const finalizedCamundaPropertiesDraftCanonical = useMemo\(/);
  assert.match(notesPanelSource, /const camundaExtensionHasLocalChanges = selectedCamundaPropertiesEditable\s*&& finalizedCamundaPropertiesDraftCanonical !== selectedCamundaExtensionCanonical;/);
  assert.match(notesPanelSource, /const camundaExtensionSyncState = camundaPropertiesBusy\s*\?\s*"syncing"\s*:\s*\(camundaExtensionSaveFailed \? "error" : \(camundaExtensionHasLocalChanges \? "local" : "saved"\)\);/);
});

test("NotesPanel reuses existing camunda extension-state save and reset lifecycle while preserving draft on failure", () => {
  assert.match(notesPanelSource, /async function saveSelectedCamundaProperties\(\)/);
  assert.match(notesPanelSource, /setCamundaExtensionLastAction\("save"\);/);
  assert.match(notesPanelSource, /setCamundaPropertiesBusy\(true\);\s*setCamundaExtensionSaveFailed\(false\);\s*setCamundaPropertiesErr\(""\);\s*setCamundaPropertiesInfo\(""\);/);
  assert.match(notesPanelSource, /if \(result && result\.ok === false\) \{\s*setCamundaExtensionSaveFailed\(true\);/);
  assert.match(notesPanelSource, /catch \(error\) \{\s*setCamundaExtensionSaveFailed\(true\);/);
  assert.match(notesPanelSource, /async function resetSelectedCamundaProperties\(\)/);
  assert.match(notesPanelSource, /setCamundaExtensionLastAction\("reset"\);/);
});

test("NotesPanel clears stale extension-state error on new edit and passes subsection runtime state into the Camunda block", () => {
  assert.match(notesPanelSource, /function updateCamundaPropertiesDraft\(nextRaw\) \{\s*setCamundaPropertiesDraft\(nextRaw && typeof nextRaw === "object" \? nextRaw : createEmptyCamundaExtensionState\(\)\);\s*setCamundaExtensionSaveFailed\(false\);/);
  assert.match(notesPanelSource, /setCamundaExtensionSaveFailed\(false\);\s*setCamundaExtensionLastAction\("save"\);\s*setCamundaPropertiesErr\(""\);\s*setCamundaPropertiesInfo\(""\);/);
  assert.match(notesPanelSource, /extensionStateSyncState=\{isElementMode \? camundaExtensionSyncState : "saved"\}/);
  assert.match(notesPanelSource, /onRetryExtensionState=\{camundaExtensionLastAction === "reset" \? resetSelectedCamundaProperties : saveSelectedCamundaProperties\}/);
});
