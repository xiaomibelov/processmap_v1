import { useEffect, useMemo, useRef, useState } from "react";
import {
  buildPropertyDictionaryEditorModel,
  buildVisibleExtensionPropertyRows,
} from "../../../features/process/camunda/propertyDictionaryModel";
import { deleteExtensionPropertyRowsByDeleteAction, bulkDeleteExtensionPropertyRows } from "../propertyDeleteSemantics";
import { SHOW_PROPERTIES_FLAG_KEY } from "../useElementSettingsController";

// Pinned (quick) properties = per-user pins (by name, persisted in
// localStorage). DEFAULT_QUICK_PROPERTY_NAMES are INITIAL pins only: fresh
// users (no stored list) start with them, but they are fully removable —
// unpinning a default drops it from the quick list like any other pin.
// Pin-by-name means "add a property with a pinned name anywhere -> it
// surfaces in Quick"; renaming a pinned row unpins it (documented behavior).
export const DEFAULT_QUICK_PROPERTY_NAMES = ["ee_time", "ingredient_value"];
const QUICK_PINS_STORAGE_KEY = "processmap_quick_pins";

function normalizePinName(name) {
  return String(name || "").trim().toLowerCase();
}

function loadQuickPins() {
  try {
    if (typeof localStorage === "undefined") return [...DEFAULT_QUICK_PROPERTY_NAMES];
    const raw = localStorage.getItem(QUICK_PINS_STORAGE_KEY);
    // Fresh users (no stored list) get the default pins; an explicitly stored
    // list — even an empty one — is respected (defaults are removable).
    if (raw === null || raw === undefined) return [...DEFAULT_QUICK_PROPERTY_NAMES];
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
  const [quickPropsOpen, setQuickPropsOpen] = useState(false);
  const [expandedBpmnRows, setExpandedBpmnRows] = useState({});
  const [userPins, setUserPins] = useState(loadQuickPins);
  const [selectedRowIds, setSelectedRowIds] = useState(new Set());
  const lastClickedIndexRef = useRef(-1);

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
    // Surface Additional BPMN properties immediately when entering a node;
    // «Быстрые свойства» stays collapsed by default (manual toggle only).
    setAdditionalBpmnOpen(true);
    setQuickPropsOpen(false);
    setSelectedRowIds(new Set());
    lastClickedIndexRef.current = -1;
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

  // Single source of truth for the quick/additional views (consumed by
  // ElementSettingsControls via useElementSettingsController): Quick and
  // Additional are two views of ONE draft — quickRows is the pinned subset
  // of additionalBpmnRows; Additional shows the full list.
  const pinnedNameSet = useMemo(() => new Set(userPins), [userPins]);
  const quickPropertyNames = userPins;
  const quickRows = useMemo(
    () => additionalBpmnRows.filter((row) => pinnedNameSet.has(normalizePinName(row?.name))),
    [additionalBpmnRows, pinnedNameSet],
  );

  function isUserPinnedName(name) {
    const n = normalizePinName(name);
    if (!n) return false;
    return userPins.includes(n);
  }

  function pinName(name) {
    const n = normalizePinName(name);
    if (!n) return;
    setUserPins((prev) => (prev.includes(n) ? prev : [...prev, n]));
  }

  function unpinName(name) {
    const n = normalizePinName(name);
    if (!n) return;
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

  function isRowSelected(rowId) {
    return selectedRowIds.has(String(rowId));
  }

  function toggleRowSelection(rowId) {
    setSelectedRowIds((prev) => {
      const next = new Set(prev);
      const id = String(rowId);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAllSelection() {
    const allIds = additionalBpmnRows.map((r) => String(r?.id ?? ""));
    const allSelected = allIds.length > 0 && allIds.every((id) => selectedRowIds.has(id));
    setSelectedRowIds(allSelected ? new Set() : new Set(allIds));
  }

  function handleShiftClick(rowId, rowIndex) {
    if (lastClickedIndexRef.current < 0) {
      toggleRowSelection(rowId);
      lastClickedIndexRef.current = rowIndex;
      return;
    }
    const start = Math.min(lastClickedIndexRef.current, rowIndex);
    const end = Math.max(lastClickedIndexRef.current, rowIndex);
    const rangeIds = additionalBpmnRows.slice(start, end + 1).map((r) => String(r?.id ?? ""));
    setSelectedRowIds((prev) => {
      const next = new Set(prev);
      rangeIds.forEach((id) => next.add(id));
      return next;
    });
  }

  function clearSelection() {
    setSelectedRowIds(new Set());
  }

  function bulkDeletePropertyRows(rowIds) {
    const namesToDelete = additionalBpmnRows
      .filter((r) => rowIds.has(String(r?.id ?? "")))
      .map((r) => String(r?.name || ""));
    namesToDelete.forEach((n) => {
      if (isUserPinnedName(n)) unpinName(n);
    });
    return updateDraft(bulkDeleteExtensionPropertyRows(properties, [...rowIds]));
  }

  const allIds = additionalBpmnRows.map((r) => String(r?.id ?? ""));
  const isAllSelected = allIds.length > 0 && allIds.every((id) => selectedRowIds.has(id));
  const isIndeterminate = !isAllSelected && allIds.some((id) => selectedRowIds.has(id));

  return {
    additionalBpmnOpen,
    setAdditionalBpmnOpen,
    quickPropsOpen,
    setQuickPropsOpen,
    properties,
    additionalBpmnRows,
    quickPropertyNames,
    quickRows,
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
    selectedRowIds,
    isRowSelected,
    toggleRowSelection,
    toggleAllSelection,
    handleShiftClick,
    clearSelection,
    bulkDeletePropertyRows,
    hasSelection: selectedRowIds.size > 0,
    selectionCount: selectedRowIds.size,
    isAllSelected,
    isIndeterminate,
  };
}
