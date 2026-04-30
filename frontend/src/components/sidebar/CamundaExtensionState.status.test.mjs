import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const notesPanelSource = fs.readFileSync(new URL("../NotesPanel.jsx", import.meta.url), "utf8");
const controlsSource = fs.readFileSync(new URL("./ElementSettingsControls.jsx", import.meta.url), "utf8");

test("camunda extension-state subsection exposes calm trust-status copy for saved/local/syncing/error", () => {
  assert.match(controlsSource, /<span>BPMN extension-state<\/span>/);
  assert.match(controlsSource, /label: "Сохранено"/);
  assert.match(controlsSource, /label: "Сохранено на сервере"/);
  assert.match(controlsSource, /label: "Есть локальные изменения"/);
  assert.match(controlsSource, /label: "Сохраняем…"/);
  assert.match(controlsSource, /label: "Синхронизация…"/);
  assert.match(controlsSource, /helper: "Обновляем состояние…"/);
  assert.match(controlsSource, /label: "Ошибка"/);
  assert.match(controlsSource, /helper: "Не удалось сохранить extension-state\. Изменения остались в форме\."/);
  assert.match(controlsSource, /testIdPrefix="camunda-extension-state-status"/);
});

test("camunda extension-state subsection keeps CTA discipline: only error exposes retry", () => {
  assert.match(controlsSource, /cta: "Повторить"/);
  assert.match(controlsSource, /<SidebarTrustStatus/);
  assert.match(controlsSource, /onCta=\{onRetryExtensionState\}/);
});

test("NotesPanel derives camunda extension-state trust state with explicit durable/background phases", () => {
  assert.match(notesPanelSource, /useCamundaPropertiesOverlayPreview\(/);
  assert.match(notesPanelSource, /selectedCamundaExtensionCanonical,/);
  assert.match(notesPanelSource, /finalizedCamundaPropertiesDraftCanonical,/);
  assert.match(notesPanelSource, /const camundaExtensionHasLocalChanges = selectedCamundaPropertiesEditable\s*&& finalizedCamundaPropertiesDraftCanonical !== selectedCamundaExtensionCanonical;/);
  assert.match(notesPanelSource, /const \[camundaExtensionSavePhase, setCamundaExtensionSavePhase\] = useState\("idle"\);/);
  assert.match(notesPanelSource, /camundaPropertiesBusy\s*\?\s*"saving"/);
  assert.match(notesPanelSource, /camundaExtensionSavePhaseKey === "refreshing"/);
  assert.match(notesPanelSource, /camundaExtensionSavePhaseKey === "durable_saved"/);
});

test("NotesPanel reuses existing camunda extension-state save and reset lifecycle while preserving draft on failure", () => {
  assert.match(notesPanelSource, /async function saveSelectedCamundaProperties\(\)/);
  assert.match(notesPanelSource, /setCamundaExtensionLastAction\("save"\);/);
  assert.match(notesPanelSource, /setCamundaExtensionSavePhase\("saving"\);\s*setCamundaPropertiesBusy\(true\);\s*setCamundaExtensionSaveFailed\(false\);\s*setCamundaPropertiesErr\(""\);\s*setCamundaPropertiesInfo\(""\);/);
  assert.match(notesPanelSource, /backgroundSessionRefresh: true/);
  assert.match(notesPanelSource, /onDurableSaveAck: \(\) => \{/);
  assert.match(notesPanelSource, /setCamundaPropertiesInfo\("Сохранено на сервере\."\);/);
  assert.match(notesPanelSource, /setCamundaPropertiesInfo\("Сохранено на сервере\. Обновляем состояние…"\);/);
  assert.match(notesPanelSource, /if \(result && result\.ok === false\) \{\s*setCamundaExtensionSavePhase\("idle"\);\s*setCamundaExtensionSaveFailed\(true\);/);
  assert.match(notesPanelSource, /catch \(error\) \{\s*setCamundaExtensionSavePhase\("idle"\);\s*setCamundaExtensionSaveFailed\(true\);/);
  assert.match(notesPanelSource, /async function resetSelectedCamundaProperties\(\)/);
  assert.match(notesPanelSource, /setCamundaExtensionLastAction\("reset"\);/);
});

test("NotesPanel clears stale extension-state error on new edit and passes subsection runtime state into the Camunda block", () => {
  assert.match(notesPanelSource, /const updateCamundaPropertiesDraft = useCallback\(\(nextRaw\) => \{/);
  assert.match(notesPanelSource, /setCamundaPropertiesDraft\(nextDraft\);\s*if \(camundaPropertiesDraftKey\)/);
  assert.match(notesPanelSource, /setCamundaExtensionSaveFailed\(false\);\s*setCamundaExtensionSavePhase\("idle"\);/);
  assert.match(notesPanelSource, /setCamundaExtensionSaveFailed\(false\);\s*setCamundaExtensionLastAction\("save"\);\s*setCamundaExtensionSavePhase\("idle"\);\s*setCamundaPropertiesErr\(""\);\s*setCamundaPropertiesInfo\(""\);/);
  assert.match(notesPanelSource, /extensionStateSyncState=\{isElementMode \? camundaExtensionSyncState : "saved"\}/);
  assert.match(notesPanelSource, /onRetryExtensionState=\{camundaExtensionLastAction === "reset" \? resetSelectedCamundaProperties : saveSelectedCamundaProperties\}/);
});
