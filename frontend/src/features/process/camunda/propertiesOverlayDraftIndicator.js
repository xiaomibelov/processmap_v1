import { buildPropertiesOverlayPreview } from "./propertyDictionaryModel.js";
import { buildPropertiesOverlayPreviewSignature } from "../../../components/sidebar/camundaPropertiesSectionMemo.js";
import { asArray, asObject, asText } from "../../process/bpmn/stage/overlay/overlayUtils.js";

// F2 «unsaved draft» indicator: returns the element id whose V2 overlay card
// should carry the draft marker, or "" when there is nothing unsaved.
//
// The draft preview (built from the live camundaPropertiesDraft) is compared
// against the preview rebuilt from the SAVED extension state
// (bpmn_meta.camunda_extensions_by_element_id). Any signature mismatch means
// the draft holds unsaved edits; the marker clears itself after a successful
// save (bpmn_meta converges to the draft) or after cancel (the draft dispatch
// reverts to the saved values).
export function resolvePropertiesOverlayDraftIndicator({ draftPreview, metaExtensionsByElementId, hiddenFields = null } = {}) {
  const draft = asObject(draftPreview);
  const elementId = asText(draft?.elementId);
  if (!elementId) return "";
  if (draft?.enabled !== true || !asArray(draft?.items).length) return "";

  const metaExtensionState = asObject(metaExtensionsByElementId)?.[elementId] ?? null;
  const savedPreview = buildPropertiesOverlayPreview({
    elementId,
    extensionStateRaw: metaExtensionState,
    showPropertiesOverlay: true,
    hiddenFields,
  });
  const draftSig = buildPropertiesOverlayPreviewSignature(draft);
  const savedSig = buildPropertiesOverlayPreviewSignature(savedPreview);
  return draftSig !== savedSig ? elementId : "";
}
