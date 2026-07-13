import { useEffect, useMemo } from "react";

import { normalizeCamundaExtensionState } from "./camundaExtensions";
import {
  buildPropertiesOverlayPreview,
  finalizeExtensionStateWithDictionary,
} from "./propertyDictionaryModel";
import { buildPropertiesOverlayPreviewSignature } from "../../../components/sidebar/camundaPropertiesSectionMemo";

export default function useCamundaPropertiesOverlayPreview({
  selectedElementId,
  selectedCamundaPropertiesEditable,
  camundaPropertiesDraft,
  selectedCamundaExtensionEntry,
  orgPropertyDictionaryBundle,
  operationKey = "",
  operationLabel = "",
  resolvedShowPropertiesOverlayOnSelect,
  propertiesOverlayPreviewDispatchRef,
  onPropertiesOverlayPreviewChange,
  onPropertiesOverlayAlwaysPreviewChange,
  suppressOverlayPreview = false,
  hiddenFields = null,
}) {
  const finalizedCamundaPropertiesDraft = useMemo(
    () => normalizeCamundaExtensionState(finalizeExtensionStateWithDictionary({
      extensionStateRaw: camundaPropertiesDraft,
      dictionaryBundleRaw: orgPropertyDictionaryBundle,
    })),
    [camundaPropertiesDraft, orgPropertyDictionaryBundle],
  );

  const selectedCamundaExtensionCanonical = useMemo(
    () => JSON.stringify(normalizeCamundaExtensionState(selectedCamundaExtensionEntry)),
    [selectedCamundaExtensionEntry],
  );

  const finalizedCamundaPropertiesDraftCanonical = useMemo(
    () => JSON.stringify(finalizedCamundaPropertiesDraft),
    [finalizedCamundaPropertiesDraft],
  );

  const memoizedPropertiesOverlayAlwaysPreview = useMemo(() => {
    if (suppressOverlayPreview) return null;
    if (!selectedElementId || !selectedCamundaPropertiesEditable) return null;
    return buildPropertiesOverlayPreview({
      elementId: selectedElementId,
      extensionStateRaw: camundaPropertiesDraft,
      dictionaryBundleRaw: orgPropertyDictionaryBundle,
      operationKey,
      operationLabel,
      showPropertiesOverlay: true,
      hiddenFields,
    });
  }, [
    camundaPropertiesDraft,
    hiddenFields,
    operationKey,
    operationLabel,
    orgPropertyDictionaryBundle,
    selectedCamundaPropertiesEditable,
    selectedElementId,
    suppressOverlayPreview,
  ]);

  const memoizedPropertiesOverlayPreview = useMemo(() => {
    if (suppressOverlayPreview) return null;
    if (!selectedElementId || !selectedCamundaPropertiesEditable) return null;
    if (resolvedShowPropertiesOverlayOnSelect) return memoizedPropertiesOverlayAlwaysPreview;
    return buildPropertiesOverlayPreview({
      elementId: selectedElementId,
      extensionStateRaw: camundaPropertiesDraft,
      dictionaryBundleRaw: orgPropertyDictionaryBundle,
      operationKey,
      operationLabel,
      showPropertiesOverlay: false,
    });
  }, [
    camundaPropertiesDraft,
    memoizedPropertiesOverlayAlwaysPreview,
    operationKey,
    operationLabel,
    orgPropertyDictionaryBundle,
    resolvedShowPropertiesOverlayOnSelect,
    selectedCamundaPropertiesEditable,
    selectedElementId,
    suppressOverlayPreview,
  ]);

  useEffect(() => {
    const dispatchState = propertiesOverlayPreviewDispatchRef.current;
    if (!selectedElementId || !selectedCamundaPropertiesEditable) {
      if (dispatchState.draftSignature !== "null") {
        dispatchState.draftSignature = "null";
        onPropertiesOverlayPreviewChange?.(null);
      }
      if (dispatchState.alwaysSignature !== "null") {
        dispatchState.alwaysSignature = "null";
        onPropertiesOverlayAlwaysPreviewChange?.(null);
      }
      return;
    }
    const nextAlwaysPreview = memoizedPropertiesOverlayAlwaysPreview;
    const alwaysSig = buildPropertiesOverlayPreviewSignature(nextAlwaysPreview);
    if (dispatchState.alwaysSignature !== alwaysSig) {
      dispatchState.alwaysSignature = alwaysSig;
      onPropertiesOverlayAlwaysPreviewChange?.(nextAlwaysPreview);
    }
    const nextPreview = memoizedPropertiesOverlayPreview;
    const draftSig = resolvedShowPropertiesOverlayOnSelect
      ? alwaysSig
      : buildPropertiesOverlayPreviewSignature(nextPreview);
    if (dispatchState.draftSignature !== draftSig) {
      dispatchState.draftSignature = draftSig;
      onPropertiesOverlayPreviewChange?.(nextPreview);
    }
  }, [
    memoizedPropertiesOverlayAlwaysPreview,
    memoizedPropertiesOverlayPreview,
    onPropertiesOverlayAlwaysPreviewChange,
    onPropertiesOverlayPreviewChange,
    propertiesOverlayPreviewDispatchRef,
    resolvedShowPropertiesOverlayOnSelect,
    selectedCamundaPropertiesEditable,
    selectedElementId,
  ]);

  return {
    finalizedCamundaPropertiesDraft,
    selectedCamundaExtensionCanonical,
    finalizedCamundaPropertiesDraftCanonical,
    // The always-mode preview (already filtered by hiddenFields) drives the
    // LiveCardPreview in the sidebar; null when suppressed or not editable.
    overlayPreview: memoizedPropertiesOverlayAlwaysPreview,
  };
}
