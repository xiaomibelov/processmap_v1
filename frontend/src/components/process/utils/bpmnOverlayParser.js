/**
 * Helpers for extracting lightweight V2 overlay definitions from BPMN
 * `bpmn:extensionElements` / `camunda:properties`.
 *
 * Supports two property conventions:
 *   1. JSON: `fpc-overlay-v2` = `{ text, x, y, width, height, title, style?, meta? }`
 *   2. Prefixed: `fpc:overlay:text`, `fpc:overlay:x`, `fpc:overlay:y`, etc.
 */

function asObject(x) {
  return x && typeof x === "object" && !Array.isArray(x) ? x : {};
}

function asArray(x) {
  if (Array.isArray(x)) return x;
  if (x == null) return [];
  return [x];
}

function isShapeElement(el) {
  return !!el && !Array.isArray(el?.waypoints) && el.type !== "label";
}

function isOverlayMetaProperty(name) {
  const n = String(name).trim().toLowerCase();
  return n === "fpc-overlay-v2" || n.startsWith("fpc:overlay:");
}

function deriveOverlayColorKey(props, explicitType) {
  const type = String(explicitType || "").trim();
  if (type) return type;
  const firstReal = (props || []).find((p) => !isOverlayMetaProperty(p.name));
  if (firstReal?.name) return String(firstReal.name).trim();
  return "property";
}

/**
 * Collects `camunda:properties` entries from a BPMN element business object.
 *
 * @param {object} businessObject - The `businessObject` from a bpmn-js registry element.
 * @returns {{ name: string, value: string }[]} Flat list of `{ name, value }` property entries.
 */
export function extractOverlayProperties(businessObject) {
  const ext = asObject(businessObject?.extensionElements);
  const values = asArray(ext?.values);
  const props = [];
  values.forEach((entryRaw) => {
    const entry = asObject(entryRaw);
    const type = String(entry?.$type || entry?.type || "").toLowerCase();
    if (type === "camunda:properties") {
      asArray(entry.values).forEach((itemRaw) => {
        const item = asObject(itemRaw);
        if (item.name) {
          props.push({
            name: String(item.name),
            value: String(item.value ?? ""),
          });
        }
      });
    }
  });
  return props;
}

/**
 * Parses overlay properties for a single BPMN element into the overlay format
 * expected by `mountLightweightOverlays`.
 *
 * @param {{ name: string, value: string }[]} props - Properties from `extractOverlayProperties`.
 * @param {string} nodeId - BPMN element id (e.g. `StartEvent_1`).
 * @returns {object | null} Overlay descriptor or `null` if no overlay properties found.
 */
export function parseOverlayFromProperties(props, nodeId) {
  if (!Array.isArray(props) || !props.length) return null;

  const jsonProp = props.find(
    (p) => String(p.name).trim().toLowerCase() === "fpc-overlay-v2"
  );
  if (jsonProp?.value) {
    try {
      const parsed = JSON.parse(String(jsonProp.value).trim());
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        const meta = asObject(parsed.meta);
        return {
          node_id: nodeId,
          text: String(parsed.text ?? ""),
          x: Number(parsed.x ?? 0),
          y: Number(parsed.y ?? 0),
          width: Number(parsed.width ?? 100),
          height: Number(parsed.height ?? 30),
          style:
            parsed.style &&
            typeof parsed.style === "object" &&
            !Array.isArray(parsed.style)
              ? parsed.style
              : {},
          meta: { title: String(parsed.title ?? meta.title ?? "") },
          colorKey: deriveOverlayColorKey(props, parsed.type || meta.type),
        };
      }
    } catch {
      // fall through to prefixed properties
    }
  }

  const prefix = "fpc:overlay:";
  const prefixLower = prefix.toLowerCase();
  const overlayProps = props.filter((p) =>
    String(p.name).trim().toLowerCase().startsWith(prefixLower)
  );
  if (!overlayProps.length) return null;

  const get = (key) => {
    const p = overlayProps.find(
      (p) =>
        String(p.name).trim().toLowerCase() ===
        `${prefixLower}${key.toLowerCase()}`
    );
    return p ? String(p.value) : undefined;
  };

  const text = get("text") || "";
  if (!text) return null;

  const style = {};
  const bg = get("bg");
  if (bg) style.bg = bg;
  const color = get("color");
  if (color) style.color = color;
  const fontSize = get("fontsize");
  if (fontSize) style.fontSize = fontSize;
  const border = get("border");
  if (border) style.border = border;

  return {
    node_id: nodeId,
    text,
    x: Number(get("x") ?? 0),
    y: Number(get("y") ?? 0),
    width: Number(get("width") ?? 100),
    height: Number(get("height") ?? 30),
    style,
    meta: { title: String(get("title") ?? "") },
    colorKey: deriveOverlayColorKey(props, get("type")),
  };
}

/**
 * Extracts V2 overlays from all shape elements of a bpmn-js viewer/modeler instance.
 *
 * @param {object} inst - bpmn-js viewer or modeler instance.
 * @returns {object[]} Array of overlay descriptors ready for `mountLightweightOverlays`.
 */
export function extractOverlaysFromBpmn(inst) {
  if (!inst) return [];
  try {
    const registry = inst.get("elementRegistry");
    const elements = registry.getAll().filter(isShapeElement);
    const result = [];
    elements.forEach((el) => {
      const bo = asObject(el.businessObject);
      const props = extractOverlayProperties(bo);
      const overlay = parseOverlayFromProperties(props, el.id);
      if (overlay) result.push({ ...overlay, properties: props });
    });
    return result;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn("[FPC-OVERLAY-V2] extract error", err);
    return [];
  }
}
