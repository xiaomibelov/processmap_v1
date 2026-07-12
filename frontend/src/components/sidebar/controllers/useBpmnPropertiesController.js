import { useEffect, useMemo, useState } from "react";
import {
  buildPropertyDictionaryEditorModel,
  buildVisibleExtensionPropertyRows,
} from "../../../features/process/camunda/propertyDictionaryModel";
import { deleteExtensionPropertyRowsByDeleteAction } from "../propertyDeleteSemantics";
import { SHOW_PROPERTIES_FLAG_KEY } from "../useElementSettingsController";

// Pinned (quick) properties = hardcoded defaults (by name) + per-user pins
// (by name, persisted in localStorage). Pin-by-name means "add a property with
// a pinned name anywhere -> it surfaces in Quick"; renaming a user-pinned row
// unpins it (documented behavior).
// sidebar-redesign-v2 (G2): quick set extended to the reference composition —
// timing first (ee_time), then the ingredient group + equipment. These names
// surface in the Quick block, the overlay chips, and the To-Be pool even when
// the element/dictionary does not define them yet.
export const DEFAULT_QUICK_PROPERTY_NAMES = ["ee_time", "ingredient", "ingredient_um", "ingredient_value", "equipment"];
const QUICK_PINS_STORAGE_KEY = "processmap_quick_pins";

function normalizePinName(name) {
  return String(name || "").trim().toLowerCase();
}

function loadQuickPins() {
  try {
    if (typeof localStorage === "undefined") return [];
    const raw = localStorage.getItem(QUICK_PINS_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    const seen = new Set();
    const out = [];
    parsed.forEach((item) => {
      const n = normalizePinName(item);
      if (n && !seen.has(n)) {
        seen.add(n);
        out.push(n);
      }
    });
    return out;
  } catch (_) {
    return [];
  }
}

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
  const [userPins, setUserPins] = useState(loadQuickPins);

  useEffect(() => {
    try {
      if (typeof localStorage !== "undefined") {
        localStorage.setItem(QUICK_PINS_STORAGE_KEY, JSON.stringify(userPins));
      }
    } catch (_) {
      /* ignore quota / private mode */
    }
  }, [userPins]);

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

  // Single source of truth for the quick/additional split (consumed by
  // ElementSettingsControls via useElementSettingsController).
  const pinnedNameSet = useMemo(() => {
    const set = new Set(DEFAULT_QUICK_PROPERTY_NAMES);
    userPins.forEach((n) => set.add(n));
    return set;
  }, [userPins]);
  const quickPropertyNames = useMemo(() => {
    const out = [...DEFAULT_QUICK_PROPERTY_NAMES];
    const seen = new Set(out);
    userPins.forEach((n) => {
      if (!seen.has(n)) {
        seen.add(n);
        out.push(n);
      }
    });
    return out;
  }, [userPins]);
  const quickRows = useMemo(
    () => additionalBpmnRows.filter((row) => pinnedNameSet.has(normalizePinName(row?.name))),
    [additionalBpmnRows, pinnedNameSet],
  );
  const otherAdditionalBpmnRows = useMemo(
    () => additionalBpmnRows.filter((row) => !pinnedNameSet.has(normalizePinName(row?.name))),
    [additionalBpmnRows, pinnedNameSet],
  );

  function isUserPinnedName(name) {
    const n = normalizePinName(name);
    if (!n || DEFAULT_QUICK_PROPERTY_NAMES.includes(n)) return false;
    return userPins.includes(n);
  }

  function pinName(name) {
    const n = normalizePinName(name);
    if (!n || DEFAULT_QUICK_PROPERTY_NAMES.includes(n)) return;
    setUserPins((prev) => (prev.includes(n) ? prev : [...prev, n]));
  }

  function unpinName(name) {
    const n = normalizePinName(name);
    if (!n || DEFAULT_QUICK_PROPERTY_NAMES.includes(n)) return;
    setUserPins((prev) => prev.filter((x) => x !== n));
  }

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
    quickPropertyNames,
    quickRows,
    otherAdditionalBpmnRows,
    userPins,
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
    isUserPinnedName,
    pinName,
    unpinName,
  };
}
