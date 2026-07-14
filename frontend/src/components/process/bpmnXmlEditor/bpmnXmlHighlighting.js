import { ViewPlugin, Decoration } from "@codemirror/view";
import { RangeSetBuilder } from "@codemirror/state";
import { syntaxTree } from "@codemirror/language";

const PROCESS_DIAGRAM_NAMES = new Set([
  "definitions",
  "process",
  "collaboration",
  "participant",
  "diagram",
  "plane",
  "bpmndiagram",
  "bpmnplane",
]);

const TASK_NAMES = new Set([
  "task",
  "servicetask",
  "usertask",
  "sendtask",
  "receivetask",
  "manualtask",
  "scripttask",
  "businessruletask",
  "subprocess",
  "callactivity",
  "adhocsubprocess",
  "transaction",
]);

const GATEWAY_NAMES = new Set([
  "exclusivegateway",
  "parallelgateway",
  "inclusivegateway",
  "eventbasedgateway",
  "complexgateway",
]);

const EVENT_NAMES = new Set([
  "startevent",
  "endevent",
  "intermediatethrowevent",
  "intermediatecatchevent",
  "boundaryevent",
  "implicitthrowevent",
]);

const FLOW_NAMES = new Set([
  "sequenceflow",
  "messageflow",
  "association",
  "dataassociation",
  "datainputassociation",
  "dataoutputassociation",
]);

const DATA_NAMES = new Set([
  "dataobject",
  "dataobjectreference",
  "datastore",
  "datastorereference",
  "textannotation",
  "group",
]);

const DI_NAMES = new Set([
  "shape",
  "edge",
  "waypoint",
  "bounds",
  "bpmnshape",
  "bpmnedge",
]);

const DI_PREFIXES = new Set(["bpmndi", "di", "dc"]);
const EXTENSION_PREFIXES = new Set(["camunda", "pm", "zeebe"]);

function parseTagName(tagName) {
  const raw = String(tagName || "");
  const parts = raw.split(":");
  if (parts.length >= 2) {
    return { prefix: parts[0].toLowerCase(), local: parts.slice(1).join(":").toLowerCase() };
  }
  return { prefix: null, local: raw.toLowerCase() };
}

/**
 * Map a tag name to a BPMN category CSS class.
 * @param {string} tagName
 * @returns {string | null}
 */
export function getTagClass(tagName) {
  const { prefix, local } = parseTagName(tagName);

  if (prefix === "camunda") return "cm-extension-camunda";
  if (prefix === "pm") return "cm-extension-pm";
  if (prefix === "zeebe") return "cm-extension-zeebe";
  if (prefix && DI_PREFIXES.has(prefix)) return "cm-bpmn-di";

  if (PROCESS_DIAGRAM_NAMES.has(local)) return "cm-bpmn-process";
  if (TASK_NAMES.has(local)) return "cm-bpmn-task";
  if (GATEWAY_NAMES.has(local)) return "cm-bpmn-gateway";
  if (EVENT_NAMES.has(local)) return "cm-bpmn-event";
  if (FLOW_NAMES.has(local)) return "cm-bpmn-flow";
  if (DATA_NAMES.has(local)) return "cm-bpmn-data";
  if (DI_NAMES.has(local)) return "cm-bpmn-di";

  return null;
}

/**
 * Map an attribute name to a CSS class.
 * @param {string} attrName
 * @param {string} tagName
 * @returns {string | null}
 */
export function getAttributeNameClass(attrName, tagName) {
  const { prefix } = parseTagName(tagName);
  if (prefix === "camunda") return "cm-extension-camunda";
  if (prefix === "pm") return "cm-extension-pm";
  if (prefix === "zeebe") return "cm-extension-zeebe";

  const lower = String(attrName || "").toLowerCase();
  if (lower === "id") return "cm-attr-id";
  if (lower === "name") return "cm-attr-name";
  if (lower === "value") return "cm-attr-value";
  if (["sourceref", "targetref", "processref", "bpmnelement"].includes(lower)) return "cm-attr-ref";
  return null;
}

const UNIT_VALUES = new Set(["кг", "шт", "г", "л", "м", "мг", "см", "мм", "ч", "мин", "с", "%"]);
const KEY_VALUES = new Set([
  "ee_time",
  "ingredient_value",
  "ee_operation",
  "ingredient_um",
  "process_version",
  "robot_meta",
]);

function stripQuotes(value) {
  return String(value || "").replace(/^["']|["']$/g, "");
}

function looksLikeBpmnId(value) {
  return /^(Activity_|Gateway_|Event_|Flow_|DataObject_|DataStore_|Participant_|Process_|SubProcess_|Collaboration_|SequenceFlow_|MessageFlow_|Association_)/.test(value);
}

/**
 * Map an attribute value to a CSS class.
 * @param {string} value
 * @param {string} attrName
 * @param {string} tagName
 * @returns {string | null}
 */
export function getAttributeValueClass(value, attrName, tagName) {
  const { prefix } = parseTagName(tagName);
  if (prefix === "camunda") return "cm-extension-camunda";
  if (prefix === "pm") return "cm-extension-pm";
  if (prefix === "zeebe") return "cm-extension-zeebe";

  const lowerAttr = String(attrName || "").toLowerCase();
  const raw = stripQuotes(value);

  if (lowerAttr === "id") return "cm-value-id";
  if (["sourceref", "targetref", "processref", "bpmnelement"].includes(lowerAttr)) return "cm-value-id";

  if (lowerAttr === "value") {
    if (/^-?\d+(\.\d+)?$/.test(raw)) return "cm-value-number";
    if (looksLikeBpmnId(raw)) return "cm-value-id";
    if (KEY_VALUES.has(raw)) return "cm-value-key";
    if (/^[А-ЯA-Z]$/.test(raw)) return "cm-value-operation";
    if (UNIT_VALUES.has(raw.toLowerCase())) return "cm-value-unit";
  }

  return null;
}

/**
 * Map text content to a CSS class based on parent tag.
 * @param {string} tagName
 * @returns {string | null}
 */
export function getTextContentClass(tagName) {
  const { local } = parseTagName(tagName);
  if (local === "textannotation") return "cm-content-annotation";
  if (local === "documentation") return "cm-content-doc";
  return null;
}

function buildDecorations(view) {
  const builder = new RangeSetBuilder();
  try {
    const tree = syntaxTree(view.state);
    if (!tree || tree.length === 0) return builder.finish();

    const stack = [];
    let currentTagName = null;
    let currentAttrName = null;

    tree.cursor().iterate(
      (node) => {
        const name = node?.name;
        if (!name) return;
        if (name === "Element") {
          stack.push(null);
          return;
        }
        if (name === "Attribute") {
          currentAttrName = null;
          return;
        }
        if (name === "TagName") {
          const tag = view.state.doc.sliceString(node.from, node.to);
          currentTagName = tag;
          if (stack.length > 0 && stack[stack.length - 1] === null) {
            stack[stack.length - 1] = tag;
          }
          const cls = getTagClass(tag);
          if (cls) {
            builder.add(node.from, node.to, Decoration.mark({ class: cls }));
          }
          return;
        }
        if (name === "AttributeName") {
          const attr = view.state.doc.sliceString(node.from, node.to);
          currentAttrName = attr;
          const tag = stack.length > 0 ? stack[stack.length - 1] : currentTagName;
          const cls = getAttributeNameClass(attr, tag);
          if (cls) {
            builder.add(node.from, node.to, Decoration.mark({ class: cls }));
          }
          return;
        }
        if (name === "AttributeValue") {
          const val = view.state.doc.sliceString(node.from, node.to);
          const tag = stack.length > 0 ? stack[stack.length - 1] : currentTagName;
          const cls = getAttributeValueClass(val, currentAttrName, tag);
          if (cls) {
            builder.add(node.from, node.to, Decoration.mark({ class: cls }));
          }
          return;
        }
        if (name === "Text") {
          const tag = stack.length > 0 ? stack[stack.length - 1] : currentTagName;
          const cls = getTextContentClass(tag);
          if (cls) {
            builder.add(node.from, node.to, Decoration.mark({ class: cls }));
          }
        }
      },
      (node) => {
        const name = node?.name;
        if (name === "Element") {
          stack.pop();
        } else if (name === "Attribute") {
          currentAttrName = null;
        }
      },
    );
  } catch (err) {
    if (typeof console !== "undefined" && console.error) {
      console.error("BpmnXmlHighlightPlugin error:", err);
    }
  }

  return builder.finish();
}

/**
 * CodeMirror ViewPlugin that adds BPMN-specific CSS classes to XML tokens.
 */
export function bpmnXmlHighlightPlugin() {
  return ViewPlugin.fromClass(
    class {
      constructor(view) {
        this.decorations = buildDecorations(view);
      }

      update(update) {
        if (update.docChanged) {
          this.decorations = buildDecorations(update.view);
        }
      }
    },
    {
      decorations: (v) => v.decorations,
    },
  );
}
