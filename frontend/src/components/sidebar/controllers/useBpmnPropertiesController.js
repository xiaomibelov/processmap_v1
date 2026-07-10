import { useEffect, useMemo, useState } from "react";
import {
  buildPropertyDictionaryEditorModel,
  buildVisibleExtensionPropertyRows,
} from "../../../features/process/camunda/propertyDictionaryModel";
import { deleteExtensionPropertyRowsByDeleteAction } from "../propertyDeleteSemantics";
import { SHOW_PROPERTIES_FLAG_KEY } from "../useElementSettingsController";

function isShowPropertiesFlagRow(row) {
  return String(row?.name || "").trim().toLowerCase() === SHOW_PROPERTIES_FLAG_KEY;
}

/**
 * Controller for the Additional BPMN Properties section.
 *
 * Isolated from DOM rendering and overlay concerns. Manages the list of
 * user-defined extension properties, inline-edit expansion state, and the
 * derived rows shown when a dictionary schema is active.
 */
export default function useBpmnPropertiesController({
  selectedElementId,
  extensionStateDraft,
  dictionaryBundle,
  onExtensionStateDraftChange,
}) {
  const [additionalBpmnOpen, setAdditionalBpmnOpen] = useState(true);
  const [expandedBpmnRows, setExpandedBpmnRows] = useState({});

  const state = extensionStateDraft && typeof extensionStateDraft === "object"
    ? extensionStateDraft
    : { properties: { extensionProperties: [], extensionListeners: [] }, preservedExtensionElements: [] };

  const properties = Array.isArray(state?.properties?.extensionProperties)
    ? state.properties.extensionProperties
    : [];

  useEffect(() => {
    // Surface Additional BPMN properties immediately when entering a node.
    setAdditionalBpmnOpen(true);
  }, [selectedElementId]);

  useEffect(() => {
    const knownIds = new Set(
      properties.map((row) => String(row?.id || "").trim()).filter(Boolean),
    );
    setExpandedBpmnRows((prev) => {
      const current = prev && typeof prev === "object" ? prev : {};
      let changed = false;
      const next = {};
      Object.keys(current).forEach((rowId) => {
        if (knownIds.has(rowId) && !!current[rowId]) {
          next[rowId] = true;
        } else {
          changed = true;
        }
      });
      return changed ? next : current;
    });
  }, [properties]);

  const dictionaryEditorModel = useMemo(
    () => buildPropertyDictionaryEditorModel({ extensionStateRaw: state, dictionaryBundleRaw: dictionaryBundle }),
    [state, dictionaryBundle],
  );
  const visibleFallbackProperties = useMemo(
    () => buildVisibleExtensionPropertyRows(state).rows,
    [state],
  );

  const hasDictionarySchema = dictionaryEditorModel.hasSchema;
  const additionalBpmnRows = (hasDictionarySchema
    ? (Array.isArray(dictionaryEditorModel?.customRows) ? dictionaryEditorModel.customRows : [])
    : visibleFallbackProperties)
    .filter((row) => !isShowPropertiesFlagRow(row));
  const visibleSchemaRows = Array.isArray(dictionaryEditorModel?.schemaRows)
    ? dictionaryEditorModel.schemaRows.filter((row) => String(row?.value ?? "").trim() !== "")
    : [];

  const listeners = Array.isArray(state?.properties?.extensionListeners)
    ? state.properties.extensionListeners
    : [];

  function updateDraft(nextExtensionProperties) {
    const nextState = {
      ...state,
      properties: {
        ...(state.properties || {}),
        extensionProperties: nextExtensionProperties,
        extensionListeners: listeners,
      },
    };
    onExtensionStateDraftChange?.(nextState);
    return nextState;
  }

  function isBpmnRowExpanded(rowIdRaw) {
    const rowId = String(rowIdRaw || "").trim();
    if (!rowId) return false;
    return !!expandedBpmnRows[rowId];
  }

  function setBpmnRowExpanded(rowIdRaw, nextOpen) {
    const rowId = String(rowIdRaw || "").trim();
    if (!rowId) return;
    setExpandedBpmnRows((prev) => {
      const next = { ...(prev || {}) };
      if (nextOpen) {
        next[rowId] = true;
      } else {
        delete next[rowId];
      }
      return next;
    });
  }

  function updatePropertyRow(rowId, patch = {}) {
    updateDraft(properties.map((row) => (
      String(row?.id || "") === String(rowId || "")
        ? { ...row, ...patch }
        : row
    )));
  }

  function addPropertyRow() {
    updateDraft([...properties, { id: `prop_draft_${Date.now()}`, name: "", value: "" }]);
  }

  // Create a pinned (quick) property with a known name in one step so the
  // quick table can fill an empty pinned slot inline (draft-only, consistent
  // with addPropertyRow; persists on the global Save).
  function addQuickPropertyRow(name, value = "") {
    const nextName = String(name || "").trim();
    if (!nextName) return null;
    return updateDraft([
      ...properties,
      { id: `prop_draft_${Date.now()}`, name: nextName, value: String(value || "") },
    ]);
  }

  function deletePropertyRow(rowId) {
    return updateDraft(deleteExtensionPropertyRowsByDeleteAction(properties, rowId));
  }

  return {
    additionalBpmnOpen,
    setAdditionalBpmnOpen,
    properties,
    additionalBpmnRows,
    visibleSchemaRows,
    operationPropertiesCount: visibleSchemaRows.length,
    additionalBpmnCount: additionalBpmnRows.length,
    hasDictionarySchema,
    isBpmnRowExpanded,
    setBpmnRowExpanded,
    updatePropertyRow,
    addPropertyRow,
    addQuickPropertyRow,
    deletePropertyRow,
  };
}
