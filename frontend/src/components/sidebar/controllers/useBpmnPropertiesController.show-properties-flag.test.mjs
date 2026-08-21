// Round-trip preservation of the hidden per-element flag row
// `fpc-show-properties` (property-panel-redesign, B2 data-loss fix).
//
// The flag is manageable only via XML: it is filtered OUT of every UI row
// list (isShowPropertiesFlagRow in useBpmnPropertiesController.js) but must
// stay INSIDE the draft/extension-state payload so saving camunda properties
// never silently drops it. This test simulates the exact draft mutations the
// sidebar performs (value edit, add, delete of OTHER rows) and the exact
// save-payload builder used by NotesPanel.saveSelectedCamundaProperties
// (finalizeExtensionStateWithDictionary + normalizeCamundaExtensionState).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  normalizeCamundaExtensionState,
} from "../../../features/process/camunda/camundaExtensions.js";
import {
  finalizeExtensionStateWithDictionary,
} from "../../../features/process/camunda/propertyDictionaryModel.js";
import { deleteExtensionPropertyRowsByDeleteAction } from "../propertyDeleteSemantics.js";

// Mirrors SHOW_PROPERTIES_FLAG_KEY in ../useElementSettingsController.js
// (that module uses Vite-style extensionless imports and cannot be loaded
// by pure node --test; the value is asserted against source below).
const SHOW_PROPERTIES_FLAG_KEY = "fpc-show-properties";

const FLAG_ROW = { id: "prop_flag", name: SHOW_PROPERTIES_FLAG_KEY, value: "1" };

function buildDraftFromXmlState() {
  // Mirrors the draft build: XML/modeler state is normalized as-is (meta
  // properties are never filtered at this layer).
  return normalizeCamundaExtensionState({
    properties: {
      extensionProperties: [
        { ...FLAG_ROW },
        { id: "prop_time", name: "ee_time", value: "0.33" },
        { id: "prop_ing", name: "ingredient_value", value: "5" },
      ],
      extensionListeners: [],
    },
    preservedExtensionElements: [],
  });
}

function flagRowIn(state) {
  return state?.properties?.extensionProperties?.find(
    (row) => String(row?.name || "").trim().toLowerCase() === SHOW_PROPERTIES_FLAG_KEY,
  ) || null;
}

function applySidebarLikeEdits(draft) {
  // 1) value edit on another row (updatePropertyRow: map patch by id)
  let rows = draft.properties.extensionProperties.map((row) => (
    row.id === "prop_time" ? { ...row, value: "0.66" } : row
  ));
  // 2) add a new row (addPropertyRow: append)
  rows = [...rows, { id: "prop_new", name: "new_field", value: "x" }];
  // 3) delete another row (deletePropertyRow)
  rows = deleteExtensionPropertyRowsByDeleteAction(rows, "prop_ing");
  return {
    ...draft,
    properties: { ...draft.properties, extensionProperties: rows },
  };
}

test("flag key constant matches the controller's SHOW_PROPERTIES_FLAG_KEY", () => {
  const controllerSource = readFileSync(
    new URL("../useElementSettingsController.js", import.meta.url),
    "utf8",
  );
  assert.match(
    controllerSource,
    /SHOW_PROPERTIES_FLAG_KEY\s*=\s*"fpc-show-properties"/,
    "test constant must stay in sync with the controller",
  );
});

test("draft built from XML keeps the flag row after edits to other rows", () => {
  const edited = applySidebarLikeEdits(buildDraftFromXmlState());
  const flag = flagRowIn(edited);
  assert.ok(flag, "flag row must stay in the draft after edits");
  assert.equal(flag.value, "1", "flag value round-trips unchanged");
});

test("save payload (no dictionary schema) preserves the flag row", () => {
  const edited = applySidebarLikeEdits(buildDraftFromXmlState());
  const payload = normalizeCamundaExtensionState(
    finalizeExtensionStateWithDictionary({ extensionStateRaw: edited, dictionaryBundleRaw: null }),
  );
  const flag = flagRowIn(payload);
  assert.ok(flag, "flag row must survive the save payload build");
  assert.equal(flag.value, "1");
});

test("save payload (active dictionary schema) preserves the flag row", () => {
  const edited = applySidebarLikeEdits(buildDraftFromXmlState());
  const bundle = {
    operation: { operationKey: "op1", operationLabel: "Op" },
    properties: [
      { propertyKey: "ee_time", propertyLabel: "Time", inputMode: "text", options: [] },
    ],
  };
  const payload = normalizeCamundaExtensionState(
    finalizeExtensionStateWithDictionary({ extensionStateRaw: edited, dictionaryBundleRaw: bundle }),
  );
  const flag = flagRowIn(payload);
  assert.ok(flag, "flag row must survive the dictionary-schema save path");
  assert.equal(flag.value, "1");
  // The edited row is rebuilt from the schema, the added row stays custom.
  assert.ok(payload.properties.extensionProperties.some((row) => row.name === "ee_time" && row.value === "0.66"));
  assert.ok(payload.properties.extensionProperties.some((row) => row.name === "new_field"));
});

test("flag row with empty value is still preserved (name is the identity)", () => {
  const draft = normalizeCamundaExtensionState({
    properties: {
      extensionProperties: [
        { id: "prop_flag", name: SHOW_PROPERTIES_FLAG_KEY, value: "" },
        { id: "prop_time", name: "ee_time", value: "0.33" },
      ],
      extensionListeners: [],
    },
    preservedExtensionElements: [],
  });
  const payload = normalizeCamundaExtensionState(
    finalizeExtensionStateWithDictionary({ extensionStateRaw: draft, dictionaryBundleRaw: null }),
  );
  assert.ok(flagRowIn(payload), "empty-value flag row must not be dropped");
});
