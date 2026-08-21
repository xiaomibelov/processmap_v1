/**
 * Pure duplicate-element detector for BPMN XML.
 *
 * Definition: among DIRECT SIBLINGS (element children of the same parent),
 * an element is a duplicate when its tag name + ALL attributes + trimmed
 * text content are identical to an earlier sibling. The first occurrence is
 * the original and is never reported/removed. The check is recursive over
 * the whole document. Whitespace-only text nodes are ignored. Namespace
 * prefixes are part of the tag name (camunda:property !== zeebe:property).
 *
 * This module works at the logical level only: it reports duplicate
 * descriptors without document positions, and rewrites the XML string via
 * DOMParser/XMLSerializer. Invalid XML is handled gracefully (empty result /
 * original string returned unchanged).
 */

function parseXmlDocument(xmlString) {
  if (typeof DOMParser === "undefined") return null;
  try {
    const doc = new DOMParser().parseFromString(String(xmlString ?? ""), "application/xml");
    if (!doc || !doc.documentElement) return null;
    if (doc.getElementsByTagName("parsererror").length > 0) return null;
    return doc;
  } catch {
    return null;
  }
}

function elementChildren(el) {
  return Array.from(el?.childNodes || []).filter((node) => node.nodeType === 1);
}

function elementAttributes(el) {
  const attributes = {};
  for (const attr of Array.from(el?.attributes || [])) {
    attributes[attr.name] = attr.value;
  }
  return attributes;
}

function elementText(el) {
  return String(el?.textContent || "").trim();
}

/**
 * Build the canonical comparison key for an element.
 * Shared with the editor highlight scanner so both sides agree on equality.
 *
 * @param {string} tagName
 * @param {Object<string, string>} attributes
 * @param {string} textContent already-trimmed text content
 * @returns {string}
 */
export function buildElementKey(tagName, attributes, textContent) {
  const pairs = Object.keys(attributes || {})
    .sort()
    .map((name) => [name, attributes[name]]);
  return JSON.stringify([String(tagName || ""), pairs, String(textContent || "").trim()]);
}

function elementKey(el) {
  return buildElementKey(el.tagName, elementAttributes(el), elementText(el));
}

/**
 * Find duplicate sibling elements in an XML document.
 *
 * @param {string} xmlString
 * @returns {Array<{ tagName: string, key: string, attributes: Object<string, string>,
 *   occurrenceIndex: number, siblingIndex: number }>}
 *   occurrenceIndex is 1-based among siblings sharing the same key (the
 *   original has occurrenceIndex 0 and is not reported); siblingIndex is the
 *   0-based position among the parent's element children.
 */
export function findDuplicateElements(xmlString) {
  const doc = parseXmlDocument(xmlString);
  if (!doc) return [];

  const duplicates = [];

  const visit = (el) => {
    const seen = new Map(); // key -> occurrence count so far
    const children = elementChildren(el);
    children.forEach((child, siblingIndex) => {
      const key = elementKey(child);
      const occurrenceIndex = seen.get(key) || 0;
      seen.set(key, occurrenceIndex + 1);
      if (occurrenceIndex > 0) {
        duplicates.push({
          tagName: child.tagName,
          key,
          attributes: elementAttributes(child),
          occurrenceIndex,
          siblingIndex,
        });
      }
      visit(child);
    });
  };

  visit(doc.documentElement);
  return duplicates;
}

/**
 * Remove duplicate sibling elements (keeping the first occurrence).
 *
 * @param {string} xmlString
 * @returns {{ xml: string, removedCount: number }}
 *   On parse errors or when nothing is duplicated the original string is
 *   returned unchanged. The XML declaration is preserved when present.
 */
export function removeDuplicates(xmlString) {
  const source = String(xmlString ?? "");
  const doc = parseXmlDocument(source);
  if (!doc || typeof XMLSerializer === "undefined") {
    return { xml: source, removedCount: 0 };
  }

  const toRemove = [];

  const visit = (el) => {
    const seen = new Map();
    for (const child of elementChildren(el)) {
      const key = elementKey(child);
      const occurrenceIndex = seen.get(key) || 0;
      seen.set(key, occurrenceIndex + 1);
      if (occurrenceIndex > 0) {
        toRemove.push(child);
      } else {
        visit(child);
      }
    }
  };

  visit(doc.documentElement);

  if (toRemove.length === 0) {
    return { xml: source, removedCount: 0 };
  }

  for (const node of toRemove) {
    node.parentNode?.removeChild(node);
  }

  let xml;
  try {
    xml = new XMLSerializer().serializeToString(doc);
  } catch {
    return { xml: source, removedCount: 0 };
  }

  // XMLSerializer drops the XML declaration; restore it from the source.
  const declaration = source.match(/^\s*<\?xml[\s\S]*?\?>/);
  if (declaration && !xml.startsWith("<?xml")) {
    xml = `${declaration[0].trim()}\n${xml}`;
  }

  return { xml, removedCount: toRemove.length };
}
