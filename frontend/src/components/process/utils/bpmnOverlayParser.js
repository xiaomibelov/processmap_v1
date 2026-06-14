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

/**
 * Removes duplicate property entries by name while preserving the order of
 * first occurrences. This protects the overlay renderer from showing the same
 * property twice when the underlying BPMN XML contains accidental duplicates
 * (e.g. two `equipment_mode` entries on the same element).
 */
function dedupePropertiesByName(props, { keep = "first" } = {}) {
  if (!Array.isArray(props)) return [];
  const seen = new Map();
  props.forEach((prop) => {
    const name = String(prop?.name ?? "").trim();
    if (!name) return;
    if (keep === "last" || !seen.has(name)) {
      seen.set(name, { name, value: String(prop?.value ?? "") });
    }
  });
  return Array.from(seen.values());
}

function isShapeElement(el) {
  return !!el && !Array.isArray(el?.waypoints) && el.type !== "label";
}

function isSequenceFlowElement(el) {
  return !!el && Array.isArray(el?.waypoints) && String(el.type).toLowerCase() === "bpmn:sequenceflow";
}

/**
 * Meta-property keys that configure the overlay itself and must never be shown
 * to the user as regular business properties.
 * Strings are matched case-insensitively; RegExps are tested as-is.
 */
export const META_PROPERTY_KEYS = [
  "fpc-overlay-v2",
  "fpc-show-properties",
  "fpc:show-properties",
  /^fpc:overlay:/,
];

export function isOverlayMetaProperty(name) {
  const n = String(name).trim().toLowerCase();
  return META_PROPERTY_KEYS.some((key) =>
    typeof key === "string" ? n === key : key.test(n)
  );
}

function isShowPropertiesFlag(name) {
  const n = String(name).trim().toLowerCase();
  return n === "fpc-show-properties" || n === "fpc:show-properties";
}

function readShowPropertiesFlag(props) {
  const flag = asArray(props).find((p) => isShowPropertiesFlag(p?.name));
  if (!flag) return false;
  const v = String(flag.value ?? "").trim().toLowerCase();
  return v === "true" || v === "1" || v === "yes";
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
 * Duplicate property names are collapsed to a single entry (first occurrence
 * wins) so the overlay renderer never shows the same key twice.
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
    if (type === "camunda:properties" || type.endsWith(":properties")) {
      // Known extension descriptors (e.g. camunda:Properties) use `values`.
      // Unknown extension elements (e.g. zeebe:properties parsed without the
      // zeebe moddle descriptor) use `$children`.
      const items = asArray(entry.values || entry.$children);
      items.forEach((itemRaw) => {
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
  return dedupePropertiesByName(props, { keep: "first" });
}

/**
 * Element types that are allowed to render a name-only V2 overlay when the
 * global "show all V2 overlays" flag is enabled. This covers the non-task
 * elements users explicitly asked for (gateways, data stores) plus the
 * common flow-node categories that also carry meaningful names.
 */
const SUPPORTED_NAME_ONLY_ELEMENT_TYPES = new Set([
  // Tasks
  "bpmn:task",
  "bpmn:usertask",
  "bpmn:servicetask",
  "bpmn:sendtask",
  "bpmn:receivetask",
  "bpmn:manualtask",
  "bpmn:businessruletask",
  "bpmn:scripttask",
  // Subprocesses / call activity
  "bpmn:subprocess",
  "bpmn:adhocsubprocess",
  "bpmn:transaction",
  "bpmn:callactivity",
  // Gateways
  "bpmn:exclusivegateway",
  "bpmn:parallelgateway",
  "bpmn:inclusivegateway",
  "bpmn:complexgateway",
  "bpmn:eventbasedgateway",
  // Events
  "bpmn:startevent",
  "bpmn:endevent",
  "bpmn:intermediatethrowevent",
  "bpmn:intermediatecatchevent",
  "bpmn:boundaryevent",
  // Data
  "bpmn:datastorereference",
  "bpmn:dataobjectreference",
]);

function isSupportedNameOnlyElementType(type) {
  const t = String(type).trim().toLowerCase();
  if (SUPPORTED_NAME_ONLY_ELEMENT_TYPES.has(t)) return true;
  return (
    /(task|gateway|event|subprocess)$/i.test(t) ||
    t.startsWith("data") ||
    t.includes("callactivity")
  );
}

/**
 * Parses overlay properties for a single BPMN element into the overlay format
 * expected by `mountLightweightOverlays`.
 *
 * @param {{ name: string, value: string }[]} props - Properties from `extractOverlayProperties`.
 * @param {string} nodeId - BPMN element id (e.g. `StartEvent_1`).
 * @param {string} elementName - Optional element name used as a fallback title.
 * @param {string} elementType - BPMN element type (e.g. `bpmn:ExclusiveGateway`).
 * @param {boolean} forceShow - When true, generate an overlay from the element name even if there are no real properties.
 * @returns {object | null} Overlay descriptor or `null` if no overlay properties found.
 */
export function parseOverlayFromProperties(
  props,
  nodeId,
  elementName = "",
  elementType = "",
  forceShow = false
) {
  const cleanProps = Array.isArray(props) ? props : [];

  const realProps = cleanProps.filter((p) => !isOverlayMetaProperty(p.name));

  if (!cleanProps.length) {
    // Even without properties, the global "show all V2 overlays" mode can
    // render a name-only card for supported element types.
    const cleanName = String(elementName || "").trim();
    if (forceShow && cleanName && isSupportedNameOnlyElementType(elementType)) {
      return {
        node_id: nodeId,
        text: cleanName,
        x: 0,
        y: -40,
        width: 180,
        height: 30,
        style: {},
        meta: { title: cleanName },
        colorKey: "property",
        auto: true,
        showProperties: false,
      };
    }
    return null;
  }

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
          showProperties: readShowPropertiesFlag(props),
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

  if (overlayProps.length) {
    const get = (key) => {
      const p = overlayProps.find(
        (p) =>
          String(p.name).trim().toLowerCase() ===
          `${prefixLower}${key.toLowerCase()}`
      );
      return p ? String(p.value) : undefined;
    };

    const text = get("text") || "";
    if (text) {
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
        showProperties: readShowPropertiesFlag(props),
      };
    }
  }

  // No explicit overlay descriptor found, but the element has real BPMN/custom
  // properties. Create a compact auto-generated V2 card so the properties are
  // visible immediately without requiring users to add an fpc-overlay-v2
  // descriptor by hand.
  if (realProps.length) {
    const firstKey = String(realProps[0]?.name || "").trim();
    const titleText = String(elementName || firstKey || "Properties").trim();
    return {
      node_id: nodeId,
      text: titleText,
      x: 0,
      y: -40,
      width: 180,
      height: 30,
      style: {},
      meta: { title: `${realProps.length} element properties` },
      colorKey: deriveOverlayColorKey(props, ""),
      auto: true,
      showProperties: readShowPropertiesFlag(props),
    };
  }

  return null;
}

/**
 * Extracts V2 overlays from all shape elements of a bpmn-js viewer/modeler instance.
 *
 * @param {object} inst - bpmn-js viewer or modeler instance.
 * @param {boolean} forceShow - When true, also generate name-only overlays for
 *   supported element types that have no custom properties.
 * @returns {object[]} Array of overlay descriptors ready for `mountLightweightOverlays`.
 */
export function extractOverlaysFromBpmn(inst, forceShow = false) {
  if (!inst) return [];
  try {
    const registry = inst.get("elementRegistry");
    const elements = registry.getAll().filter((el) => isShapeElement(el) || isSequenceFlowElement(el));
    const result = [];
    elements.forEach((el) => {
      const bo = asObject(el.businessObject);
      const props = extractOverlayProperties(bo);
      const overlay = parseOverlayFromProperties(
        props,
        el.id,
        String(bo.name || ""),
        String(bo.$type || el.type || ""),
        forceShow
      );
      if (overlay) {
        // Only business properties travel with the overlay; meta-descriptors
        // (fpc-overlay-v2, fpc-show-properties, fpc:overlay:*) are consumed by
        // the parser and must never leak into the rendered card.
        const businessProperties = props.filter(
          (p) => !isOverlayMetaProperty(p?.name)
        );
        result.push({ ...overlay, properties: businessProperties });
      }
    });
    return result;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn("[FPC-OVERLAY-V2] extract error", err);
    return [];
  }
}
