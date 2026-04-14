import { useRef } from "react";
import {
  buildBpmnDiagramOverlayLayersProps,
  buildDrawioDiagramOverlayLayersProps,
  buildHybridDiagramOverlayLayersProps,
} from "./buildProcessDiagramOverlayLayersProps";
import { bumpDrawioPerfCounter } from "../../drawio/runtime/drawioRuntimeProbes.js";

function hasOwn(obj, key) {
  return Object.prototype.hasOwnProperty.call(obj, key);
}

function normalizeInputForMemo(rawInput, fnRefs, stableFnByKey) {
  const input = rawInput && typeof rawInput === "object" ? rawInput : {};
  const normalized = {};
  Object.keys(input).forEach((key) => {
    const value = input[key];
    if (typeof value !== "function") {
      normalized[key] = value;
      return;
    }
    fnRefs[key] = value;
    if (typeof stableFnByKey[key] !== "function") {
      stableFnByKey[key] = (...args) => {
        const next = fnRefs[key];
        if (typeof next === "function") return next(...args);
        return undefined;
      };
    }
    normalized[key] = stableFnByKey[key];
  });
  return normalized;
}

function areInputsShallowEqual(prevRaw, nextRaw) {
  const prev = prevRaw && typeof prevRaw === "object" ? prevRaw : null;
  const next = nextRaw && typeof nextRaw === "object" ? nextRaw : null;
  if (!prev || !next) return false;
  const prevKeys = Object.keys(prev);
  const nextKeys = Object.keys(next);
  if (prevKeys.length !== nextKeys.length) return false;
  for (let idx = 0; idx < prevKeys.length; idx += 1) {
    const key = prevKeys[idx];
    if (!hasOwn(next, key)) return false;
    if (!Object.is(prev[key], next[key])) return false;
  }
  return true;
}

function collectChangedInputKeys(prevRaw, nextRaw) {
  const prev = prevRaw && typeof prevRaw === "object" ? prevRaw : {};
  const next = nextRaw && typeof nextRaw === "object" ? nextRaw : {};
  const keys = new Set([...Object.keys(prev), ...Object.keys(next)]);
  const changed = [];
  keys.forEach((key) => {
    if (!Object.is(prev[key], next[key])) changed.push(key);
  });
  return changed;
}

function pickInput(rawInput, keys) {
  const input = rawInput && typeof rawInput === "object" ? rawInput : {};
  const picked = {};
  keys.forEach((key) => {
    if (hasOwn(input, key)) picked[key] = input[key];
  });
  return picked;
}

const BPMN_INPUT_KEYS = [
  "activeProjectId",
  "asObject",
  "bpmnFragmentPlacementActive",
  "bpmnFragmentPlacementGhost",
  "bpmnContextMenu",
  "bpmnSubprocessPreview",
  "bpmnRef",
  "closeBpmnContextMenu",
  "closeBpmnSubprocessPreview",
  "diagramMode",
  "draft",
  "handleAiQuestionsByElementChange",
  "handleBpmnSelectionChange",
  "isInterviewMode",
  "onBpmnSaveLifecycleEvent",
  "onDiagramContextMenuDismiss",
  "onDiagramContextMenuRequest",
  "onElementNotesRemap",
  "onSessionSync",
  "getBaseDiagramStateVersion",
  "rememberDiagramStateVersion",
  "propertiesOverlayAlwaysEnabled",
  "propertiesOverlayAlwaysPreviewByElementId",
  "queueDiagramMutation",
  "reloadKey",
  "robotMetaOverlayEnabled",
  "robotMetaOverlayFilters",
  "robotMetaStatusByElementId",
  "selectedPropertiesOverlayPreview",
  "sid",
  "stepTimeUnit",
  "tab",
  "runBpmnContextMenuAction",
  "openBpmnSubprocessPreviewProperties",
];

const DRAWIO_BASE_KEYS = [
  "tab",
  "drawioVisible",
  "drawioEditorOpen",
];

const DRAWIO_OVERLAY_KEYS = [
  "clientToDiagram",
  "commitDrawioOverlayMove",
  "createDrawioRuntimeElement",
  "deleteDrawioOverlayElement",
  "drawioModeEffective",
  "drawioRuntimeToolState",
  "drawioUiState",
  "getOverlayViewportMatrix",
  "hybridViewportMatrix",
  "hybridViewportMatrixRef",
  "setDrawioElementSize",
  "setDrawioElementText",
  "setDrawioElementTextWidth",
  "setDrawioSelectedElementId",
  "subscribeOverlayViewportMatrix",
];

const DRAWIO_EDITOR_KEYS = [
  "closeEmbeddedDrawioEditor",
  "drawioUiState",
  "handleDrawioEditorSave",
];

const HYBRID_BASE_KEYS = [
  "tab",
  "hybridVisible",
  "hybridContextMenu",
  "hybridPersistLockBusyNoticeOpen",
];

const HYBRID_OVERLAY_KEYS = [
  "asObject",
  "bpmnRef",
  "cancelHybridTextEditor",
  "cleanupMissingHybridBindings",
  "commitHybridTextEditor",
  "getHybridLayerCardRefCallback",
  "handleHybridLayerItemPointerDown",
  "handleHybridV2ElementContextMenu",
  "handleHybridV2ElementDoubleClick",
  "handleHybridV2ElementPointerDown",
  "handleHybridV2OverlayContextMenu",
  "handleHybridV2OverlayPointerDown",
  "handleHybridV2ResizeHandlePointerDown",
  "hybridArrowPreview",
  "hybridDebugEnabled",
  "hybridGhostPreview",
  "hybridLayerActiveElementId",
  "hybridLayerOverlayRef",
  "hybridLayerRenderRows",
  "hybridModeEffective",
  "hybridOpacityValue",
  "hybridPlacementHitLayerActive",
  "hybridTextEditor",
  "hybridUiPrefs",
  "hybridV2ActiveId",
  "hybridV2BindingByHybridId",
  "hybridV2PlaybackHighlightedIds",
  "hybridV2Renderable",
  "hybridV2SelectedIdSet",
  "onHybridOverlayPointerLeave",
  "onHybridOverlayPointerMove",
  "setHybridLayerActiveElementId",
  "toText",
  "withHybridOverlayGuard",
];

const HYBRID_MENU_KEYS = [
  "asObject",
  "closeHybridContextMenu",
  "deleteSelectedHybridIds",
  "hideHybridIds",
  "hybridSelectionCount",
  "hybridV2ActiveId",
  "hybridV2DocLive",
  "hybridV2SelectedIds",
  "lockLayersForHybridIds",
  "renameHybridItem",
  "toText",
];

const HYBRID_TOAST_KEYS = [
  "dismissHybridLockBusyNotice",
  "hybridPersistLockBusyNoticeMessage",
  "hybridPersistLockBusyNoticeOpen",
  "hybridPersistPendingDraft",
  "retryHybridPersist",
  "tab",
];

function selectDrawioInput(input) {
  const selected = pickInput(input, DRAWIO_BASE_KEYS);
  if (input?.tab === "diagram" && input?.drawioVisible) {
    Object.assign(selected, pickInput(input, DRAWIO_OVERLAY_KEYS));
  }
  if (input?.drawioEditorOpen) {
    Object.assign(selected, pickInput(input, DRAWIO_EDITOR_KEYS));
  }
  return selected;
}

function selectHybridInput(input) {
  const selected = pickInput(input, HYBRID_BASE_KEYS);
  if (input?.tab === "diagram" && input?.hybridVisible) {
    Object.assign(selected, pickInput(input, HYBRID_OVERLAY_KEYS));
  }
  if (input?.hybridContextMenu) {
    Object.assign(selected, pickInput(input, HYBRID_MENU_KEYS));
  }
  if (input?.tab === "diagram" && input?.hybridPersistLockBusyNoticeOpen) {
    Object.assign(selected, pickInput(input, HYBRID_TOAST_KEYS));
  }
  return selected;
}

function readMemoizedSegment(cache, input, build, perfKeyBase, changedKeyPrefix) {
  if (cache.output && areInputsShallowEqual(cache.input, input)) {
    bumpDrawioPerfCounter(`${perfKeyBase}.cacheHit`);
    return cache.output;
  }
  bumpDrawioPerfCounter(`${perfKeyBase}.cacheMiss`);
  const changedKeys = collectChangedInputKeys(cache.input, input);
  if (changedKeyPrefix && changedKeys.length > 0) {
    const sample = changedKeys.slice(0, 12);
    sample.forEach((key) => {
      bumpDrawioPerfCounter(`${changedKeyPrefix}${String(key)}`);
    });
    if (changedKeys.length > sample.length) {
      bumpDrawioPerfCounter(`${changedKeyPrefix}__other`);
    }
  }
  const output = build(input);
  cache.input = input;
  cache.output = output;
  return output;
}

export default function useStableProcessDiagramOverlayLayersProps(inputRaw) {
  const functionRefs = useRef({});
  const stableFunctionByKey = useRef({});
  const segmentCacheRef = useRef({
    bpmn: { input: null, output: null },
    drawio: { input: null, output: null },
    hybrid: { input: null, output: null },
  });
  const normalizedInput = normalizeInputForMemo(
    inputRaw,
    functionRefs.current,
    stableFunctionByKey.current,
  );
  const bpmnInput = pickInput(normalizedInput, BPMN_INPUT_KEYS);
  const drawioInput = selectDrawioInput(normalizedInput);
  const hybridInput = selectHybridInput(normalizedInput);
  const segments = segmentCacheRef.current;
  return {
    ...readMemoizedSegment(
      segments.bpmn,
      bpmnInput,
      buildBpmnDiagramOverlayLayersProps,
      "overlay.vm.diagramOverlayProps",
      "overlay.vm.input.changed.",
    ),
    ...readMemoizedSegment(
      segments.drawio,
      drawioInput,
      buildDrawioDiagramOverlayLayersProps,
      "overlay.vm.drawioOverlayProps",
      "overlay.vm.drawioInput.changed.",
    ),
    ...readMemoizedSegment(
      segments.hybrid,
      hybridInput,
      buildHybridDiagramOverlayLayersProps,
      "overlay.vm.hybridOverlayProps",
      "overlay.vm.hybridInput.changed.",
    ),
  };
}
