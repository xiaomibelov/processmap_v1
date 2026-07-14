function escapeXmlAttr(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function buildAttributes(element) {
  if (!element.attributes || element.attributes.length === 0) return "";
  const parts = [];
  for (let i = 0; i < element.attributes.length; i += 1) {
    const attr = element.attributes.item(i);
    if (attr) parts.push(` ${attr.name}="${escapeXmlAttr(attr.value)}"`);
  }
  return parts.join("");
}

const TEXT_NODE = 3;
const ELEMENT_NODE = 1;
const COMMENT_NODE = 8;
const CDATA_SECTION_NODE = 4;

function serializeNode(node, depth) {
  const indent = "  ".repeat(depth);

  if (node.nodeType === TEXT_NODE) {
    const text = String(node.nodeValue || "").trim();
    return text ? `${indent}${text}\n` : "";
  }

  if (node.nodeType === COMMENT_NODE) {
    const text = String(node.nodeValue || "").trim();
    return text ? `${indent}<!-- ${text} -->\n` : `${indent}<!-- -->\n`;
  }

  if (node.nodeType === CDATA_SECTION_NODE) {
    return `${indent}<![CDATA[${node.nodeValue}]]>\n`;
  }

  if (node.nodeType === ELEMENT_NODE) {
    const tag = node.tagName;
    const attrs = buildAttributes(node);
    const children = Array.from(node.childNodes);
    const nonTextChildren = children.filter((c) => c.nodeType !== TEXT_NODE);
    const textOnlyChild = children.length === 1 && children[0].nodeType === TEXT_NODE;

    if (children.length === 0) {
      return `${indent}<${tag}${attrs}/>\n`;
    }

    if (textOnlyChild) {
      const text = String(children[0].nodeValue || "").trim();
      return text
        ? `${indent}<${tag}${attrs}>${text}</${tag}>\n`
        : `${indent}<${tag}${attrs}></${tag}>\n`;
    }

    let out = `${indent}<${tag}${attrs}>\n`;
    children.forEach((child) => {
      out += serializeNode(child, depth + 1);
    });
    out += `${indent}</${tag}>\n`;
    return out;
  }

  return "";
}

function hasBpmnDefinitionsRoot(doc) {
  const root = doc.documentElement;
  if (!root) return false;
  const localName = root.localName || root.tagName;
  const ns = String(root.namespaceURI || "").toLowerCase();
  return localName === "definitions" && ns.includes("bpmn");
}

/**
 * Pretty-print BPMN XML with 2-space indentation.
 * Throws if the input is not well-formed XML.
 *
 * @param {string} rawXml
 * @returns {string}
 */
export function prettyPrintXml(rawXml) {
  const raw = String(rawXml || "").trim();
  if (!raw) return "";

  const parser = new DOMParser();
  const doc = parser.parseFromString(raw, "application/xml");
  const parserError = doc.getElementsByTagName("parsererror")[0];
  if (parserError) {
    const message = String(parserError.textContent || "").replace(/\s+/g, " ").trim() || "XML parsing error";
    throw new Error(message);
  }

  if (!hasBpmnDefinitionsRoot(doc)) {
    throw new Error("Missing BPMN definitions root element");
  }

  const declaration = raw.startsWith("<?xml") ? raw.split("\n")[0].trim() + "\n" : "";
  const root = doc.documentElement;
  const formatted = declaration + serializeNode(root, 0).trim();
  return formatted;
}
