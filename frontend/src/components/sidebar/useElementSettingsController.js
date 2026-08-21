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
import useBpmnPropertiesController from "./controllers/useBpmnPropertiesController";

export const SHOW_PROPERTIES_FLAG_KEY = "fpc-show-properties";

export default function useElementSettingsController({
  selectedElementId,
  extensionStateDraft,
  dictionaryBundle,
  onExtensionStateDraftChange,
}) {
  const [listenersOpen, setListenersOpen] = useState(false);
  const [operationOpen, setOperationOpen] = useState(false);
  const [operationPropertiesOpen, setOperationPropertiesOpen] = useState(false);
  const [documentationOpen, setDocumentationOpen] = useState(false);
  const [camundaIoOpen, setCamundaIoOpen] = useState(false);
  const [zeebeTaskHeadersOpen, setZeebeTaskHeadersOpen] = useState(false);
  const [overlayCompanionsExpanded, setOverlayCompanionsExpanded] = useState(false);
  const [expandedCamundaScripts, setExpandedCamundaScripts] = useState({});

  const bpmnProperties = useBpmnPropertiesController({
    selectedElementId,
    extensionStateDraft,
    dictionaryBundle,
    onExtensionStateDraftChange,
  });

  const state = extensionStateDraft && typeof extensionStateDraft === "object"
    ? extensionStateDraft
    : createEmptyCamundaExtensionState();
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
    // Keep secondary groups collapsed by default when entering a node.
    setDocumentationOpen(false);
    setCamundaIoOpen(false);
    setZeebeTaskHeadersOpen(false);
    setListenersOpen(false);
  }, [selectedElementId]);

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
        extensionProperties: Array.isArray(state?.properties?.extensionProperties) ? state.properties.extensionProperties : [],
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
        extensionProperties: Array.isArray(state?.properties?.extensionProperties) ? state.properties.extensionProperties : [],
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
        extensionProperties: Array.isArray(state?.properties?.extensionProperties) ? state.properties.extensionProperties : [],
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
    documentationOpen,
    setDocumentationOpen,
    camundaIoOpen,
    setCamundaIoOpen,
    zeebeTaskHeadersOpen,
    setZeebeTaskHeadersOpen,
    overlayCompanionsExpanded,
    setOverlayCompanionsExpanded,
    state,
    listeners,
    camundaInputRows,
    camundaOutputRows,
    zeebeTaskHeaderRows,
    isCamundaScriptExpanded,
    setCamundaScriptExpanded,
    updateCamundaIoParameter,
    addCamundaIoRow,
    deleteCamundaIoRow,
    updateZeebeTaskHeaderRow,
    addZeebeTaskHeaderRow,
    deleteZeebeTaskHeaderRow,
    updateSchemaPropertyValue,
    updateListenerRow,
    addListenerRow,
    deleteListenerRow,
    // BPMN properties subsection (isolated controller)
    ...bpmnProperties,
  };
}
