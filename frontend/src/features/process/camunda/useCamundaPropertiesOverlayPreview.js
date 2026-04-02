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
  resolvedShowPropertiesOverlayOnSelect,
  propertiesOverlayPreviewDispatchRef,
  onPropertiesOverlayPreviewChange,
  onPropertiesOverlayAlwaysPreviewChange,
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
    if (!selectedElementId || !selectedCamundaPropertiesEditable) return null;
    return buildPropertiesOverlayPreview({
      elementId: selectedElementId,
      extensionStateRaw: camundaPropertiesDraft,
      dictionaryBundleRaw: orgPropertyDictionaryBundle,
      showPropertiesOverlay: true,
    });
  }, [
    camundaPropertiesDraft,
    orgPropertyDictionaryBundle,
    selectedCamundaPropertiesEditable,
    selectedElementId,
  ]);

  const memoizedPropertiesOverlayPreview = useMemo(() => {
    if (!selectedElementId || !selectedCamundaPropertiesEditable) return null;
    if (resolvedShowPropertiesOverlayOnSelect) return memoizedPropertiesOverlayAlwaysPreview;
    return buildPropertiesOverlayPreview({
      elementId: selectedElementId,
      extensionStateRaw: camundaPropertiesDraft,
      dictionaryBundleRaw: orgPropertyDictionaryBundle,
      showPropertiesOverlay: false,
    });
  }, [
    camundaPropertiesDraft,
    memoizedPropertiesOverlayAlwaysPreview,
    orgPropertyDictionaryBundle,
    resolvedShowPropertiesOverlayOnSelect,
    selectedCamundaPropertiesEditable,
    selectedElementId,
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
  };
}
