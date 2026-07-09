import { isOverlayMetaProperty } from "../../../../../components/process/utils/bpmnOverlayParser.js";
import { asArray, asText } from "./overlayUtils.js";

const MIN_ELEMENT_SIZE = 20;

export function hasLegacyPropertyOverlay(inst, elementId) {
  if (!inst || !elementId) return false;
  try {
    const overlays = inst.get("overlays");
    const all = overlays.get({ element: elementId });
    for (const entry of all) {
      const html = entry?.html;
      const node = typeof html === "string" ? null : html;
      if (node && node.classList && node.classList.contains("fpcPropertyOverlay")) {
        return true;
      }
    }
  } catch {}
  return false;
}

export function shouldRenderV2Overlay({ elementId, globalEnabled, elementState = {}, content }) {
  if (!globalEnabled) return false;

  const {
    isSequenceFlow = false,
    width = 0,
    height = 0,
    hasLegacyOverlay = false,
  } = elementState;

  if (!isSequenceFlow && (Number(width) < MIN_ELEMENT_SIZE || Number(height) < MIN_ELEMENT_SIZE)) {
    return false;
  }

  const realProps = asArray(content?.properties).filter((prop) => {
    const name = asText(prop?.name);
    return !!name && !isOverlayMetaProperty(name);
  });
  const titleText = asText(content?.title ?? content?.text);

  if (!realProps.length && !titleText) return false;
  if (hasLegacyOverlay) return false;

  return true;
}
