import { useEffect, useMemo, useState } from "react";
import {
  addZeebeTaskHeaderInExtensionState,
  addCamundaIoParameterInExtensionState,
  createEmptyCamundaExtensionState,
  extractCamundaInputOutputParametersFromExtensionState,
  extractZeebeTaskHeadersFromExtensionState,
  patchCamundaIoParameterInExtensionState,
  patchZeebeTaskHeaderInExtensionState,
  removeCamundaIoParameterFromExtensionState,
  removeZeebeTaskHeaderFromExtensionState,
} from "../../features/process/camunda/camundaExtensions";
import { setSchemaPropertyValueInExtensionState } from "../../features/process/camunda/propertyDictionaryModel";

export default function useElementSettingsController({
  selectedElementId,
  extensionStateDraft,
  dictionaryBundle,
  onExtensionStateDraftChange,
}) {
  const [listenersOpen, setListenersOpen] = useState(true);
  const [operationOpen, setOperationOpen] = useState(false);
  const [operationPropertiesOpen, setOperationPropertiesOpen] = useState(false);
  const [additionalBpmnOpen, setAdditionalBpmnOpen] = useState(false);
  const [documentationOpen, setDocumentationOpen] = useState(false);
  const [camundaIoOpen, setCamundaIoOpen] = useState(false);
  const [zeebeTaskHeadersOpen, setZeebeTaskHeadersOpen] = useState(false);
  const [overlayCompanionsExpanded, setOverlayCompanionsExpanded] = useState(false);
  const [expandedCamundaScripts, setExpandedCamundaScripts] = useState({});
  const [expandedBpmnRows, setExpandedBpmnRows] = useState({});

  const state = extensionStateDraft && typeof extensionStateDraft === "object"
    ? extensionStateDraft
    : createEmptyCamundaExtensionState();
  const properties = Array.isArray(state?.properties?.extensionProperties)
    ? state.properties.extensionProperties
    : [];
  const listeners = Array.isArray(state?.properties?.extensionListeners)
    ? state.properties.extensionListeners
    : [];

  const camundaIoModel = useMemo(
    () => extractCamundaInputOutputParametersFromExtensionState(state, { includeZeebe: true }),
    [state],
  );
  const zeebeTaskHeadersModel = useMemo(
    () => extractZeebeTaskHeadersFromExtensionState(state),
    [state],
  );
  const camundaInputRows = Array.isArray(camundaIoModel?.inputRows) ? camundaIoModel.inputRows : [];
  const camundaOutputRows = Array.isArray(camundaIoModel?.outputRows) ? camundaIoModel.outputRows : [];
  const zeebeTaskHeaderRows = Array.isArray(zeebeTaskHeadersModel?.rows) ? zeebeTaskHeadersModel.rows : [];

  useEffect(() => {
    // Keep Camunda I/O collapsed by default when entering a node.
    setDocumentationOpen(false);
    setCamundaIoOpen(false);
    setZeebeTaskHeadersOpen(false);
  }, [selectedElementId]);

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

  useEffect(() => {
    const knownIds = new Set(
      properties
        .map((row) => String(row?.id || "").trim())
        .filter(Boolean),
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

  useEffect(() => {
    const knownIoIds = new Set(
      [...camundaInputRows, ...camundaOutputRows]
        .map((row) => String(row?.id || "").trim())
        .filter(Boolean),
    );
    setExpandedCamundaScripts((prev) => {
      const current = prev && typeof prev === "object" ? prev : {};
      let changed = false;
      const next = {};
      Object.keys(current).forEach((rowId) => {
        if (knownIoIds.has(rowId) && !!current[rowId]) {
          next[rowId] = true;
        } else {
          changed = true;
        }
      });
      return changed ? next : current;
    });
  }, [camundaInputRows, camundaOutputRows]);

  function updateDraft(nextState) {
    onExtensionStateDraftChange?.(nextState);
  }

  function replaceExtensionProperties(nextExtensionProperties) {
    updateDraft({
      ...state,
      properties: {
        ...(state.properties || {}),
        extensionProperties: nextExtensionProperties,
        extensionListeners: listeners,
      },
    });
  }

  function updatePropertyRow(rowId, patch = {}) {
    replaceExtensionProperties(properties.map((row) => (
      String(row?.id || "") === String(rowId || "")
        ? { ...row, ...patch }
        : row
    )));
  }

  function addPropertyRow() {
    replaceExtensionProperties([...properties, { id: `prop_draft_${Date.now()}`, name: "", value: "" }]);
  }

  function deletePropertyRow(rowId) {
    replaceExtensionProperties(properties.filter((row) => String(row?.id || "") !== String(rowId || "")));
  }

  function updateCamundaIoParameter(rowRef, patch = {}) {
    const nextState = patchCamundaIoParameterInExtensionState({
      extensionStateRaw: state,
      parameterRef: rowRef,
      patch,
    });
    updateDraft(nextState);
  }

  function addCamundaIoRow(direction = "input") {
    const nextState = addCamundaIoParameterInExtensionState({
      extensionStateRaw: state,
      direction,
      draft: {
        name: "",
        value: "",
      },
    });
    updateDraft(nextState);
  }

  function deleteCamundaIoRow(rowRef) {
    const rowId = String(rowRef?.id || "").trim();
    if (rowId) {
      setExpandedCamundaScripts((prev) => {
        if (!prev || !prev[rowId]) return prev;
        const next = { ...prev };
        delete next[rowId];
        return next;
      });
    }
    const nextState = removeCamundaIoParameterFromExtensionState({
      extensionStateRaw: state,
      parameterRef: rowRef,
    });
    updateDraft(nextState);
  }

  function updateZeebeTaskHeaderRow(rowRef, patch = {}) {
    const nextState = patchZeebeTaskHeaderInExtensionState({
      extensionStateRaw: state,
      headerRef: rowRef,
      patch,
    });
    updateDraft(nextState);
  }

  function addZeebeTaskHeaderRow() {
    const nextState = addZeebeTaskHeaderInExtensionState({
      extensionStateRaw: state,
      draft: {
        key: "",
        value: "",
      },
    });
    updateDraft(nextState);
  }

  function deleteZeebeTaskHeaderRow(rowRef) {
    const nextState = removeZeebeTaskHeaderFromExtensionState({
      extensionStateRaw: state,
      headerRef: rowRef,
    });
    updateDraft(nextState);
  }

  function isCamundaScriptExpanded(rowIdRaw) {
    const rowId = String(rowIdRaw || "").trim();
    if (!rowId) return false;
    return !!expandedCamundaScripts[rowId];
  }

  function setCamundaScriptExpanded(rowIdRaw, nextOpen) {
    const rowId = String(rowIdRaw || "").trim();
    if (!rowId) return;
    setExpandedCamundaScripts((prev) => {
      const next = { ...(prev || {}) };
      if (nextOpen) {
        next[rowId] = true;
      } else {
        delete next[rowId];
      }
      return next;
    });
  }

  function updateSchemaPropertyValue(propertyKey, value) {
    updateDraft(setSchemaPropertyValueInExtensionState({
      extensionStateRaw: state,
      dictionaryBundleRaw: dictionaryBundle,
      propertyKey,
      value,
    }));
  }

  function updateListenerRow(rowId, patch = {}) {
    updateDraft({
      ...state,
      properties: {
        ...(state.properties || {}),
        extensionProperties: properties,
        extensionListeners: listeners.map((row) => (
          String(row?.id || "") === String(rowId || "")
            ? { ...row, ...patch }
            : row
        )),
      },
    });
  }

  function addListenerRow() {
    updateDraft({
      ...state,
      properties: {
        ...(state.properties || {}),
        extensionProperties: properties,
        extensionListeners: [...listeners, {
          id: `listener_draft_${Date.now()}`,
          event: "start",
          type: "expression",
          value: "",
        }],
      },
    });
  }

  function deleteListenerRow(rowId) {
    updateDraft({
      ...state,
      properties: {
        ...(state.properties || {}),
        extensionProperties: properties,
        extensionListeners: listeners.filter((row) => String(row?.id || "") !== String(rowId || "")),
      },
    });
  }

  return {
    listenersOpen,
    setListenersOpen,
    operationOpen,
    setOperationOpen,
    operationPropertiesOpen,
    setOperationPropertiesOpen,
    additionalBpmnOpen,
    setAdditionalBpmnOpen,
    documentationOpen,
    setDocumentationOpen,
    camundaIoOpen,
    setCamundaIoOpen,
    zeebeTaskHeadersOpen,
    setZeebeTaskHeadersOpen,
    overlayCompanionsExpanded,
    setOverlayCompanionsExpanded,
    state,
    properties,
    listeners,
    camundaInputRows,
    camundaOutputRows,
    zeebeTaskHeaderRows,
    isBpmnRowExpanded,
    setBpmnRowExpanded,
    updatePropertyRow,
    addPropertyRow,
    deletePropertyRow,
    updateCamundaIoParameter,
    addCamundaIoRow,
    deleteCamundaIoRow,
    updateZeebeTaskHeaderRow,
    addZeebeTaskHeaderRow,
    deleteZeebeTaskHeaderRow,
    isCamundaScriptExpanded,
    setCamundaScriptExpanded,
    updateSchemaPropertyValue,
    updateListenerRow,
    addListenerRow,
    deleteListenerRow,
  };
}
